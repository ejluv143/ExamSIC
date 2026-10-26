import { codeRunnerJob, codeRunnerLimits, codeRunnerProblem, type CodeQuestion } from "@examinus/domain/kinds/code";
import { starterTemplates } from "../code.ts";
import { newBase, newId, splitsPoints, testsHeading, defaultPlaceholder } from "../editor-shared.ts";
import type { EditorModel } from "../editor-model.ts";

const kb = (n: number) => `${Math.ceil(n / 1024)} KB`;

// Whether the code runner would take this question's tests. It turns down anything over its limits, and every
// answer would then wait for the teacher instead of being checked.
function runnerLimitProblem(q: CodeQuestion): string | null {
  const { maxTests, maxInput, maxDatabase, maxCode, maxBody } = codeRunnerLimits;
  // Leave room for the longest code a student may send (up to 3 bytes a character).
  const problem = codeRunnerProblem(codeRunnerJob(q.language, "", q.tests, q.database), maxBody - maxCode * 3);
  switch (problem?.kind) {
    case undefined:
    case "code":
      return null;
    case "tests":
      return `has ${problem.count} test cases. Code can be checked against at most ${maxTests}.`;
    case "input":
      return `has a test case input that is too long (test ${problem.test + 1}). Keep each input under ${kb(maxInput)}.`;
    case "database":
      return `has tables (database setup) that are too long. Keep them under ${kb(maxDatabase)}.`;
    case "body":
      return `has test inputs${q.language === "php" ? " and tables" : ""} that add up to ${kb(problem.bytes)}. Code can be checked with at most ${kb(problem.max)} of them in total.`;
  }
}

export const codeModel: EditorModel<"code"> = {
  type: "code",
  create: (id) => ({
    ...newBase(id),
    type: "code",
    language: "python",
    starterCode: starterTemplates.python,
    tests: [{ id: newId(), input: "", expectedOutput: "", hidden: false }],
    rubric: "",
  }),
  validate(q) {
    if (q.tests.length === 0) return "needs at least one test case.";
    if (q.tests.some((t) => !t.expectedOutput.trim())) return "has a test case with no expected output.";
    return runnerLimitProblem(q);
  },
  promptPlaceholder: defaultPlaceholder,
  answer: testsHeading,
  unit: { noun: "test", labels: (q) => q.tests.map((_, i) => `Test ${i + 1}`) },
  partialCredit: { applies: splitsPoints },
  summary: (q) => `${q.language} · ${q.tests.length} ${q.tests.length === 1 ? "test" : "tests"}`,
};
