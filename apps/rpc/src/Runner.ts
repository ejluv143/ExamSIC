import {
  codeRunnerJob,
  codeRunnerLimits,
  codeRunnerProblem,
  outputMatches,
  type CodeQuestion,
  type CodeRunnerProblem,
  type CodeTestCase,
  type CodeTestResult,
} from "@examora/contract";
import { Config, Context, Effect, Layer } from "effect";

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
  }
>()("examora/api/Runner") {
  static readonly layer = Layer.effect(
    Runner,
    Effect.gen(function* () {
      const url = yield* Config.String("RUNNER_URL").pipe(Config.withDefault(""));
      const secret = yield* Config.String("RUNNER_SECRET").pipe(Config.withDefault(""));
      const configured = url !== "" && secret !== "";

      // null when the runner can't be reached, failed, or turned the job down (logged with its reason).
      const call = (question: CodeQuestion, code: string, tests: readonly CodeTestCase[]) => {
        const job = codeRunnerJob(question.language, code, tests, question.database);
        const details = { questionId: question.id, tests: tests.length, codeLength: code.length };
        // Over the runner's limits: it would only refuse it, so don't send it.
        const problem = codeRunnerProblem(job);
        if (problem)
          return Effect.logWarning(`Code job is over the runner's limits, not sent: ${describeProblem(problem)}`, details).pipe(
            Effect.as(null),
          );
        return Effect.tryPromise(async () => {
          const res = await fetch(`${url}/run`, {
            method: "POST",
            headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
            body: JSON.stringify(job),
            // Submissions queue behind each other on the runner, so allow for a wait.
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
          Effect.flatMap((r) =>
            "reply" in r
              ? Effect.succeed(r.reply)
              : Effect.logWarning(`Code runner turned the job down (${r.status}): ${r.reason}`, details).pipe(Effect.as(null)),
          ),
          Effect.catch((cause) => Effect.logWarning("Code runner call failed", cause).pipe(Effect.as(null))),
        );
      };

      return Runner.of({
        configured,
        runTests: Effect.fn("Runner.runTests")(function* (question, code, tests = question.tests) {
          if (!configured) return null;
          const reply = yield* call(question, code, tests);
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
        }),
      });
    }),
  );
}
