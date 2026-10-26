import { codeRunnerJob, codeRunnerLimits, codeRunnerProblem, type CodeQuestion, type CodeRunnerProblem, type CodeTestCase } from "@examinus/domain/kinds/code";
import { type CodeTestResult } from "@examinus/domain/kinds/base";
import { outputMatches } from "@examinus/domain/scoring";
import { Context, Effect, Exit, Layer, Option, Schema } from "effect";
import { HttpTraceContext } from "effect/http";
import { AppConfig } from "./AppConfig.ts";
import { runnerDuration, timed } from "./Metrics.ts";

type RunnerReply = {
  results?: { testId: string; stdout: string; stderr?: string; error?: string }[];
  compileError?: string;
  error?: string;
};

const describeProblem = (p: CodeRunnerProblem): string => {
  const { maxTests, maxInput, maxDatabase, maxCode } = codeRunnerLimits;
  switch (p.kind) {
    case "tests":
      return `${p.count} tests (1 to ${maxTests} allowed)`;
    case "input":
      return `test ${p.test + 1} has a ${p.length}-character input (at most ${maxInput})`;
    case "database":
      return `the tables are ${p.length} characters (at most ${maxDatabase})`;
    case "code":
      return `the code is ${p.length} characters (at most ${maxCode})`;
    case "body":
      return `the request is ${p.bytes} bytes (at most ${p.max})`;
  }
};

// The runner couldn't take the job now (busy, unreachable, failed, or too slow to answer): trying again later may work.
export class RunnerUnavailable extends Schema.TaggedError<RunnerUnavailable>()("RunnerUnavailable", {
  reason: Schema.String,
}) {}

// Runs students' code against test cases with the code runner (apps/runner), which starts a throwaway Docker
// container per run. Optional: without RUNNER_URL and RUNNER_SECRET every call answers null and code answers
// wait for the teacher.
export class Runner extends Context.Service<
  Runner,
  {
    readonly configured: boolean;
    // null means "not checked": the question waits for the teacher, like an essay.
    readonly runTests: (
      question: CodeQuestion,
      code: string,
      tests?: readonly CodeTestCase[],
    ) => Effect.Effect<CodeTestResult[] | null>;
    // The same, but a runner that couldn't take the job now fails with RunnerUnavailable instead of answering null,
    // for callers that try again later (submit-time grading, issue #45). null: it can never be checked here (no
    // runner, the job is over its limits, or the question's own tables are broken).
    readonly tryTests: (
      question: CodeQuestion,
      code: string,
      tests?: readonly CodeTestCase[],
    ) => Effect.Effect<CodeTestResult[] | null, RunnerUnavailable>;
  }
>()("examinus/api/Runner") {
  static readonly layer = Layer.effect(
    Runner,
    Effect.gen(function* () {
      const { url, secret } = (yield* AppConfig).runner;
      const configured = url !== "" && secret !== "";

      // The reply is null when the runner can't be reached, failed, or turned the job down (logged with its reason);
      // `retry` says whether that may pass (busy, unreachable, a runner error) or never will (over the limits).
      // `outcome` is what the runner duration metric records: ok, failed (the program didn't compile or ran too
      // long), rejected (over the limits, or the runner turned the job down), busy (its queue was full) or unreachable.
      type Call = { readonly reply: RunnerReply | null; readonly outcome: string; readonly retry?: string };
      const call = (question: CodeQuestion, code: string, tests: readonly CodeTestCase[]): Effect.Effect<Call> => {
        const job = codeRunnerJob(question.language, code, tests, question.database);
        const details = { questionId: question.id, tests: tests.length, codeLength: code.length };
        // Over the runner's limits: it would only refuse it, so don't send it.
        const problem = codeRunnerProblem(job);
        if (problem)
          return Effect.logWarning(`Code job is over the runner's limits, not sent: ${describeProblem(problem)}`, details).pipe(
            Effect.as({ reply: null, outcome: "rejected" } as Call),
            timed(runnerDuration, {}, (exit) => (Exit.isSuccess(exit) ? exit.value.outcome : "unreachable")),
          );
        return Effect.gen(function* () {
          // Carries the current trace to the runner, so its spans join this request's trace.
          const span = yield* Effect.option(Effect.currentSpan);
          const traceHeaders = Option.isSome(span) ? HttpTraceContext.toHeaders(span.value) : {};
          return yield* Effect.tryPromise(async () => {
            const res = await fetch(`${url}/run`, {
              method: "POST",
              headers: { ...traceHeaders, authorization: `Bearer ${secret}`, "content-type": "application/json" },
              body: JSON.stringify(job),
              // Submissions queue behind each other on the runner, so allow for a wait. Giving up closes the
              // connection, and the runner drops the job (or kills its container) instead of running it for nobody.
              signal: AbortSignal.timeout(180_000),
            });
            if (res.ok) return { reply: (await res.json()) as RunnerReply };
            // The runner answers { error } when it turns a job down (too many tests, input too long, body too large).
            const text = await res.text();
            let reason = text;
            try {
              reason = (JSON.parse(text) as RunnerReply).error ?? text;
            } catch {}
            return { status: res.status, reason };
          }).pipe(
            Effect.flatMap(
              (r): Effect.Effect<Call> =>
                "reply" in r
                  ? Effect.succeed({ reply: r.reply, outcome: r.reply.compileError || r.reply.error ? "failed" : "ok" })
                  : // 503: its queue is full, expected under load (the metric counts it as busy); other 5xx: it failed
                    // on its side. Both may work later; a 4xx never will.
                    r.status === 503
                    ? Effect.logDebug("Code runner is busy", details).pipe(
                        Effect.as({ reply: null, outcome: "busy", retry: r.reason }),
                      )
                    : r.status >= 500
                    ? Effect.logWarning(`Code runner couldn't take the job (${r.status}): ${r.reason}`, details).pipe(
                        Effect.as({ reply: null, outcome: "unreachable", retry: r.reason }),
                      )
                    : Effect.logWarning(`Code runner turned the job down (${r.status}): ${r.reason}`, details).pipe(
                        Effect.as({ reply: null, outcome: "rejected" }),
                      ),
            ),
            Effect.catch((cause) =>
              Effect.logWarning("Code runner call failed", cause).pipe(
                Effect.as({ reply: null, outcome: "unreachable", retry: String(cause) }),
              ),
            ),
          );
        }).pipe(timed(runnerDuration, {}, (exit) => (Exit.isSuccess(exit) ? exit.value.outcome : "unreachable")));
      };

      const tryTests = Effect.fn("Runner.tryTests")(function* (
        question: CodeQuestion,
        code: string,
        tests: readonly CodeTestCase[] = question.tests,
      ) {
        if (!configured) return null;
        const { reply, retry } = yield* call(question, code, tests);
        if (retry !== undefined) return yield* new RunnerUnavailable({ reason: retry });
        if (!reply) return null;
        // The question's own tables are broken: not the student's fault, so the teacher grades it.
        if (reply.compileError?.startsWith("The question's tables")) return null;
        // The student's program broke (didn't compile, or ran too long overall): every test fails with the reason.
        const failure = reply.compileError ? `Didn't compile:\n${reply.compileError}` : reply.error;
        if (failure || !reply.results) {
          return tests.map((t) => ({ testId: t.id, passed: false, output: "", error: failure ?? "No result" }));
        }
        return tests.map((t): CodeTestResult => {
          const r = reply.results!.find((x) => x.testId === t.id);
          if (!r) return { testId: t.id, passed: false, output: "", error: "Didn't run" };
          return {
            testId: t.id,
            passed: !r.error && outputMatches(r.stdout, t.expectedOutput),
            output: r.stdout,
            ...(r.error === undefined ? {} : { error: r.error }),
          };
        });
      });

      return Runner.of({
        configured,
        tryTests,
        runTests: (question, code, tests) => tryTests(question, code, tests).pipe(Effect.catchTag("RunnerUnavailable", () => Effect.succeed(null))),
      });
    }),
  );
}
