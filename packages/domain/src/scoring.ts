// Scoring, shared by the API (grades on submit) and the web app (display). Automatic scores are a fraction
// 0..1 of a question's points; teacher scores are in points and win over the automatic score. How each question
// type is scored is in its kind (`./kinds/`); this module only asks the kind.
import { kindOf, questionKinds } from "./kinds/index.ts";
import { round2, type CodeTestResult, type PartResult } from "./kinds/base.ts";
import { questionTypes, type Question, type QuestionType } from "./question.ts";
import type { AnswerValue } from "./quiz.ts";

// Typed answers a teacher may want to check by hand: essays always need it, and the others can be
// re-scored when the key missed a valid answer (a misspelling, a synonym, a different wording).
export const reviewableTypes: QuestionType[] = questionTypes.filter((t) => questionKinds[t].reviewable);

// Each blank, pair or listed item with whether it matched the key, in the order of the key (blanks and
// listed items) or of the left column (pairs). null for the types that have none.
export function partResults(question: Question, answer: AnswerValue): PartResult[] | null {
  return kindOf(question).partResults?.(question, answer) ?? null;
}

// How many units a question's points are split over: blanks, pairs, items or tests; 1 for the rest.
export function unitCount(q: Question): number {
  return kindOf(q).units?.(q) ?? 1;
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

// The fraction (0..1) of a question's points an answer earns by itself. null: needs a teacher (essays), or
// a checker that hasn't run (code and SQL without test results).
export function autoScore(
  question: Question,
  answer: AnswerValue,
  codeResults?: readonly CodeTestResult[] | null,
): number | null {
  return kindOf(question).autoScore(question, answer, codeResults);
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
