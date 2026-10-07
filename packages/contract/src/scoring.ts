// Scoring, shared by the API (grades on submit) and the web app (display). Automatic scores are a fraction
// 0..1 of a question's points; teacher scores are in points and win over the automatic score.
import { blankAnswers, splitAlternatives } from "./blanks.ts";
import { parseNumber } from "./numbers.ts";
import type { CodeQuestion, CodeTestResult, Question, QuestionType } from "./question.ts";
import type { AnswerValue } from "./quiz.ts";

// Typed answers a teacher may want to check by hand: essays always need it, and the others can be
// re-scored when the key missed a valid answer (a misspelling, a synonym, a different wording).
export const reviewableTypes: QuestionType[] = [
  "identification",
  "fill_in_the_blank",
  "enumeration",
  "essay",
  "code",
  "sql",
];

function matches(given: string, accepted: readonly string[], caseSensitive: boolean): boolean {
  const g = caseSensitive ? given.trim() : given.trim().toLowerCase();
  return g !== "" && accepted.some((a) => (caseSensitive ? a.trim() : a.trim().toLowerCase()) === g);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type PartResult = { given: string; correct: boolean };

// Each blank or listed item with whether it matched the key, in the order the student wrote them.
export function partResults(question: Question, answer: AnswerValue): PartResult[] | null {
  const given = Array.isArray(answer) ? answer : [];
  if (question.type === "fill_in_the_blank") {
    return blankAnswers(question.prompt).map((accepted, i) => ({
      given: given[i] ?? "",
      correct: matches(given[i] ?? "", accepted, question.caseSensitive),
    }));
  }
  if (question.type !== "enumeration") return null;
  const items = question.items.map(splitAlternatives);
  if (question.orderMatters) {
    return items.map((accepted, i) => ({
      given: given[i] ?? "",
      correct: matches(given[i] ?? "", accepted, question.caseSensitive),
    }));
  }
  // Each item can be credited once, so repeating an answer doesn't score twice.
  const unused = [...items];
  return items.map((_, i) => {
    const g = given[i] ?? "";
    const hit = unused.findIndex((accepted) => matches(g, accepted, question.caseSensitive));
    if (hit !== -1) unused.splice(hit, 1);
    return { given: g, correct: hit !== -1 };
  });
}

export function maxScore(questions: readonly { points: number }[]): number {
  return questions.reduce((sum, q) => sum + q.points, 0);
}

// Trailing spaces on each line and blank lines at the end don't count, like most online judges.
const normalize = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();

export const outputMatches = (actual: string, expected: string) => normalize(actual) === normalize(expected);

const fraction = (correct: number, total: number) => (total === 0 ? 0 : correct / total);

// The fraction (0..1) of a question's points an answer earns by itself. null: needs a teacher (essays), or
// a checker that hasn't run (code and SQL without test results).
export function autoScore(
  question: Question,
  answer: AnswerValue,
  codeResults?: readonly CodeTestResult[] | null,
): number | null {
  switch (question.type) {
    case "multiple_choice":
      return answer === question.correctChoiceId ? 1 : 0;
    case "true_false":
      return answer === question.answer ? 1 : 0;
    case "identification":
      return typeof answer === "string" && matches(answer, question.acceptedAnswers, question.caseSensitive) ? 1 : 0;
    case "fill_in_the_blank":
    case "enumeration": {
      const parts = partResults(question, answer)!;
      return fraction(parts.filter((p) => p.correct).length, parts.length);
    }
    case "numeric": {
      const given = typeof answer === "string" ? parseNumber(answer) : null;
      // A little slack so 0.1 + 0.2 style rounding never costs a point.
      return given !== null && Math.abs(given - question.answer) <= question.tolerance + 1e-9 ? 1 : 0;
    }
    case "code":
      return codeResults ? codeFraction(question, codeResults) : null;
    case "sql":
      // Each SQL check (sample data, and hidden data if any) is worth an equal share.
      return codeResults?.length ? fraction(codeResults.filter((r) => r.passed).length, codeResults.length) : null;
    case "essay":
      return null;
  }
}

// Each test case is worth an equal share.
export function codeFraction(q: CodeQuestion, results: readonly CodeTestResult[]): number {
  if (q.tests.length === 0) return 0;
  return q.tests.filter((t) => results.find((r) => r.testId === t.id)?.passed).length / q.tests.length;
}

// What was stored for one answer: the automatic fraction and the teacher's points.
export type ScoredAnswer = { autoScore: number | null; manualScore: number | null };

// Points for one question. The teacher's score wins (capped at the question's points); essays and unchecked
// code have no score (null) until then. Answers that don't exist yet score as unanswered by the caller.
export function questionScore(question: { points: number }, answer: ScoredAnswer | undefined): number | null {
  if (answer?.manualScore != null) return Math.min(answer.manualScore, question.points);
  if (answer?.autoScore == null) return null;
  return round2(answer.autoScore * question.points);
}

export type AttemptScore = {
  score: number;
  max: number;
  // Points of the questions already scored, so a provisional percentage ignores ungraded essays.
  gradedMax: number;
  // Questions still waiting for a teacher or a checker.
  ungraded: number;
};

// `answers` by question id; a question without an answer row scores 0 (left blank).
export function attemptScore(
  questions: readonly Question[],
  answers: ReadonlyMap<string, ScoredAnswer> | Readonly<Record<string, ScoredAnswer>>,
): AttemptScore {
  const get = (id: string) => (answers instanceof Map ? answers.get(id) : (answers as Record<string, ScoredAnswer>)[id]);
  let score = 0;
  let ungraded = 0;
  let gradedMax = 0;
  for (const q of questions) {
    const row = get(q.id);
    const s = row ? questionScore(q, row) : 0;
    if (s === null) ungraded++;
    else {
      score += s;
      gradedMax += q.points;
    }
  }
  return { score: round2(score), max: maxScore(questions), gradedMax, ungraded };
}

export function percent(score: number, max: number): number {
  return max === 0 ? 0 : Math.round((score / max) * 100);
}
