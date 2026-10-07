// Runs students' code against a question's test cases with the code runner (backend/runner), which uses a
// throwaway Docker container per run. Configure RUNNER_URL and RUNNER_SECRET in .env.local.
// TODO: move behind backend/api once it exists; the runner itself stays a separate private service.
import "server-only";
import { outputMatches } from "../code";
import type { CodeLanguage, CodeQuestion, CodeTestCase, CodeTestResult } from "../types";

type RunnerReply = {
  results?: { testId: string; stdout: string; stderr?: string; error?: string }[];
  compileError?: string;
  error?: string;
};

export const runnerConfigured = () => !!process.env.RUNNER_URL && !!process.env.RUNNER_SECRET;

// null when the runner can't be reached or failed; callers then leave the answer for the teacher.
async function callRunner(
  language: CodeLanguage,
  code: string,
  tests: CodeTestCase[],
  database?: string,
): Promise<RunnerReply | null> {
  if (!runnerConfigured()) return null;
  try {
    const res = await fetch(`${process.env.RUNNER_URL}/run`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RUNNER_SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({
        language,
        code,
        tests: tests.map((t) => ({ id: t.id, input: t.input })),
        database: language === "php" && database?.trim() ? database : undefined,
      }),
      // Submissions queue behind each other on the runner, so allow for a wait.
      signal: AbortSignal.timeout(180_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as RunnerReply;
  } catch {
    return null;
  }
}

// null means "not checked": the question waits for the teacher, like an essay.
export async function runTests(
  question: CodeQuestion,
  code: string,
  tests: CodeTestCase[] = question.tests,
): Promise<CodeTestResult[] | null> {
  const reply = await callRunner(question.language, code, tests, question.database);
  if (!reply) return null;
  // The question's own tables are broken: not the student's fault, so the teacher grades it.
  if (reply.compileError?.startsWith("The question's tables")) return null;
  // The student's program broke (didn't compile, or ran too long overall): every test fails with the reason.
  const failure = reply.compileError ? `Didn't compile:\n${reply.compileError}` : reply.error;
  if (failure || !reply.results) {
    return tests.map((t) => ({ testId: t.id, passed: false, output: "", error: failure ?? "No result" }));
  }
  return tests.map((t) => {
    const r = reply.results!.find((x) => x.testId === t.id);
    if (!r) return { testId: t.id, passed: false, output: "", error: "Didn't run" };
    return { testId: t.id, passed: !r.error && outputMatches(r.stdout, t.expectedOutput), output: r.stdout, error: r.error };
  });
}
