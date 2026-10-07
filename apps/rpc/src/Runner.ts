import { outputMatches, type CodeQuestion, type CodeTestCase, type CodeTestResult } from "@examora/contract";
import { Config, Context, Effect, Layer } from "effect";

type RunnerReply = {
  results?: { testId: string; stdout: string; stderr?: string; error?: string }[];
  compileError?: string;
  error?: string;
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

      // null when the runner can't be reached or failed.
      const call = (language: string, code: string, tests: readonly CodeTestCase[], database?: string) =>
        Effect.tryPromise(async (): Promise<RunnerReply | null> => {
          const res = await fetch(`${url}/run`, {
            method: "POST",
            headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
            body: JSON.stringify({
              language,
              code,
              tests: tests.map((t) => ({ id: t.id, input: t.input })),
              database: language === "php" && database?.trim() ? database : undefined,
            }),
            // Submissions queue behind each other on the runner, so allow for a wait.
            signal: AbortSignal.timeout(180_000),
          });
          return res.ok ? ((await res.json()) as RunnerReply) : null;
        }).pipe(
          Effect.catch((cause) => Effect.logWarning("Code runner call failed", cause).pipe(Effect.as(null))),
        );

      return Runner.of({
        configured,
        runTests: Effect.fn("Runner.runTests")(function* (question, code, tests = question.tests) {
          if (!configured) return null;
          const reply = yield* call(question.language, code, tests, question.database);
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
