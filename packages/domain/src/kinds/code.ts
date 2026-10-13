import { Schema } from "effect";
import {
  cleanText,
  CodeTestResult,
  maxCodeLength,
  plainAnswerText,
  studentBase,
  studentCommon,
  teacherBase,
  weightedFraction,
  weights,
  type QuestionKind,
} from "./base.ts";
import { sourceKind, similarPairs } from "../similarity.ts";

export const codeLanguages = ["python", "java", "cpp", "c", "javascript", "php"] as const;
export const CodeLanguage = Schema.Literals(codeLanguages);
export type CodeLanguage = typeof CodeLanguage.Type;

// The program reads `input` from standard input and must print `expectedOutput`.
// Hidden tests are never sent to students, so they can't hard-code the answers.
export const CodeTestCase = Schema.Struct({
  id: Schema.String,
  input: Schema.String,
  expectedOutput: Schema.String,
  hidden: Schema.Boolean,
});
export type CodeTestCase = typeof CodeTestCase.Type;

// What the code runner (apps/runner) accepts. It turns down anything bigger, and the answer then waits for the
// teacher, so the question editor keeps code questions within these. Keep in step with `limits` in
// apps/runner/server.mjs. Lengths are in characters, except `maxBody`, which is the whole request in bytes.
export const codeRunnerLimits = {
  maxTests: 30,
  maxInput: 64 * 1024,
  maxDatabase: 256 * 1024,
  maxCode: 20_000,
  maxBody: 512 * 1024,
} as const;

// The job sent to the runner's POST /run. Only PHP questions load the question's tables.
export const codeRunnerJob = (
  language: CodeLanguage,
  code: string,
  tests: readonly CodeTestCase[],
  database?: string,
) => ({
  language,
  code,
  tests: tests.map((t) => ({ id: t.id, input: t.input })),
  database: language === "php" && database?.trim() ? database : undefined,
});
export type CodeRunnerJob = ReturnType<typeof codeRunnerJob>;

// Why the runner would turn a job down, or null when it takes it. `test` is the index of the offending test.
export type CodeRunnerProblem =
  | { readonly kind: "tests"; readonly count: number }
  | { readonly kind: "input"; readonly test: number; readonly length: number }
  | { readonly kind: "database"; readonly length: number }
  | { readonly kind: "code"; readonly length: number }
  | { readonly kind: "body"; readonly bytes: number; readonly max: number };

// The same checks the runner makes, so the API needn't send a job it will refuse. `maxBody` is lower when room
// must be left for code that isn't written yet (the question editor).
export function codeRunnerProblem(job: CodeRunnerJob, maxBody: number = codeRunnerLimits.maxBody): CodeRunnerProblem | null {
  const { maxTests, maxInput, maxDatabase, maxCode } = codeRunnerLimits;
  if (job.tests.length === 0 || job.tests.length > maxTests) return { kind: "tests", count: job.tests.length };
  const test = job.tests.findIndex((t) => t.input.length > maxInput);
  if (test !== -1) return { kind: "input", test, length: job.tests[test]!.input.length };
  if ((job.database?.length ?? 0) > maxDatabase) return { kind: "database", length: job.database!.length };
  if (job.code.length > maxCode) return { kind: "code", length: job.code.length };
  const bytes = new TextEncoder().encode(JSON.stringify(job)).length;
  return bytes > maxBody ? { kind: "body", bytes, max: maxBody } : null;
}

const type = Schema.Literal("code");

const fields = {
  language: CodeLanguage,
  starterCode: Schema.String,
  tests: Schema.Array(CodeTestCase),
  // PHP only: CREATE TABLE and INSERT statements loaded into a fresh SQLite database before each test. Shown to students.
  database: Schema.optionalKey(Schema.String),
  // Notes for the teacher's review (style, approach). Not shown to students.
  rubric: Schema.String,
  ...weights,
};

export const CodeBody = Schema.Struct({ type, ...fields });
export const CodeQuestion = Schema.Struct({ ...teacherBase, type, ...fields });
export type CodeQuestion = typeof CodeQuestion.Type;
export const StudentCodeQuestion = Schema.Struct({
  ...studentBase,
  type,
  language: CodeLanguage,
  starterCode: Schema.String,
  // Sample tests only; hidden tests stay on the server.
  tests: Schema.Array(CodeTestCase),
  database: Schema.optionalKey(Schema.String),
});
export type StudentCodeQuestion = typeof StudentCodeQuestion.Type;

// Each test case is worth an equal share, or its weight.
export function codeFraction(q: CodeQuestion, results: readonly CodeTestResult[]): number {
  return weightedFraction(q.tests.map((t) => results.find((r) => r.testId === t.id)?.passed === true), q.weights, q.partialCredit);
}

export const code: QuestionKind<"code"> = {
  type: "code",
  toStudent: (q) => ({
    ...studentCommon(q),
    type: q.type,
    language: q.language,
    starterCode: q.starterCode,
    tests: q.tests.filter((t) => !t.hidden).map(({ id, input, expectedOutput, hidden }) => ({ id, input, expectedOutput, hidden })),
    ...(q.database === undefined ? {} : { database: q.database }),
  }),
  cleanAnswer: (_q, v) => cleanText(v, maxCodeLength),
  autoScore: (q, _answer, results) => (results ? codeFraction(q, results) : null),
  units: (q) => q.tests.length,
  reviewable: true,
  checker: "runner",
  answerKey: (q) => `Passes ${q.tests.length} test ${q.tests.length === 1 ? "case" : "cases"}`,
  answerText: (_q, value) => plainAnswerText(value),
  // Untouched starter code doesn't count.
  answerGiven: (q, v) => typeof v === "string" && v.trim() !== "" && v.trim() !== q.starterCode.trim(),
  summary: (_q, v) => {
    const lines = String(v).trim().split("\n").length;
    return `${lines} ${lines === 1 ? "line" : "lines"} of code`;
  },
  typing: true,
  freeForm: true,
  similarity: {
    kind: "code",
    pairs: (q, texts) => similarPairs(texts, q.starterCode, sourceKind(q.language), 0.75),
    detail: (score) => `${Math.round(score * 100)}% of their code matches once names and spacing are ignored.`,
  },
  gameProblem: (questions, { pacing }) =>
    pacing === "teacher" && questions.length > 0 ? "Code questions only work in a student-paced game, because running code takes time." : null,
};
