// Scoring, shared by the API (grades on submit) and the web app (display). Automatic scores are a fraction
// 0..1 of a question's points; teacher scores are in points and win over the automatic score.
import { splitAlternatives } from "./blanks.ts";
import { parseNumber } from "./numbers.ts";
import { blankKey, type CodeQuestion, type CodeTestResult, type Question, type QuestionType } from "./question.ts";
import type { AnswerValue } from "./quiz.ts";

// Typed answers a teacher may want to check by hand: essays always need it, and the others can be
// re-scored when the key missed a valid answer (a misspelling, a synonym, a different wording).
export const reviewableTypes: QuestionType[] = [
  "blank",
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

const asList = (answer: AnswerValue): string[] => (Array.isArray(answer) ? answer : typeof answer === "string" ? [answer] : []);

// Each blank, pair or listed item with whether it matched the key, in the order of the key (blanks and
// listed items) or of the left column (pairs).
export function partResults(question: Question, answer: AnswerValue): PartResult[] | null {
  const given = asList(answer);
  if (question.type === "blank") {
    return blankKey(question).map((accepted, i) => ({
      given: given[i] ?? "",
      correct: matches(given[i] ?? "", accepted, question.caseSensitive),
    }));
  }
  if (question.type === "matching") {
    return question.left.map((l, i) => {
      const id = given[i] ?? "";
      return { given: question.right.find((r) => r.id === id)?.text ?? "", correct: id !== "" && id === l.rightId };
    });
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

// The share (0..1) of the points the correct units earn. Units (blanks, pairs, items, tests) are worth
// equal shares unless `weights` has one positive number for each. Without partial credit, only all of them count.
export function weightedFraction(correct: readonly boolean[], weights: readonly number[] | undefined, partialCredit: boolean): number {
  if (correct.length === 0) return 0;
  if (correct.every(Boolean)) return 1;
  if (!partialCredit) return 0;
  const custom = weights && weights.length === correct.length && weights.every((w) => w >= 0) && weights.some((w) => w > 0);
  const w = custom ? weights : correct.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  return correct.reduce((sum, ok, i) => sum + (ok ? w[i]! : 0), 0) / total;
}

// How many units a question's points are split over: blanks, pairs, items or tests; 1 for the rest.
export function unitCount(q: Question): number {
  switch (q.type) {
    case "blank":
      return blankKey(q).length;
    case "matching":
      return q.left.length;
    case "enumeration":
      return q.items.length;
    case "code":
      return q.tests.length;
    default:
      return 1;
  }
}

// The points each unit (blank, pair, item or test) is worth, from the question's points and weights.
export function unitPoints(q: Question): number[] {
  const n = unitCount(q);
  const weights = "weights" in q ? q.weights : undefined;
  const custom = weights && weights.length === n && weights.every((w) => w >= 0) && weights.some((w) => w > 0);
  const w = custom ? weights : Array.from({ length: n }, () => 1);
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((x) => round2((x / total) * q.points));
}

// The sum of an essay rubric's rows.
export const rubricTotal = (rubric: readonly { points: number }[]) => round2(rubric.reduce((sum, r) => sum + r.points, 0));

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

// Multiple choice. One correct choice: exact. Several: all of them and nothing else, or with partial credit
// each right tick earns a share and each wrong tick takes one back (never below 0).
function choiceFraction(q: Extract<Question, { type: "multiple_choice" }>, answer: AnswerValue): number {
  const picked = new Set(asList(answer));
  const correct = new Set(q.correctChoiceIds);
  const right = [...picked].filter((id) => correct.has(id)).length;
  const wrong = picked.size - right;
  if (right === correct.size && wrong === 0) return correct.size === 0 ? 0 : 1;
  if (!q.multipleCorrect || !q.partialCredit || correct.size === 0) return 0;
  return Math.max(0, (right - wrong) / correct.size);
}

// The fraction (0..1) of a question's points an answer earns by itself. null: needs a teacher (essays), or
// a checker that hasn't run (code and SQL without test results).
export function autoScore(
  question: Question,
  answer: AnswerValue,
  codeResults?: readonly CodeTestResult[] | null,
): number | null {
  switch (question.type) {
    case "multiple_choice":
      return choiceFraction(question, answer);
    case "true_false":
      return answer === question.answer ? 1 : 0;
    case "blank":
    case "matching":
    case "enumeration": {
      const parts = partResults(question, answer)!;
      return weightedFraction(parts.map((p) => p.correct), question.weights, question.partialCredit);
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
      return codeResults?.length ? weightedFraction(codeResults.map((r) => r.passed), undefined, question.partialCredit) : null;
    case "essay":
      return null;
  }
}

// Each test case is worth an equal share, or its weight.
export function codeFraction(q: CodeQuestion, results: readonly CodeTestResult[]): number {
  return weightedFraction(q.tests.map((t) => results.find((r) => r.testId === t.id)?.passed === true), q.weights, q.partialCredit);
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
