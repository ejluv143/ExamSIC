// Helpers for the teacher's pages that read AttemptDetail rows together with their quiz.
import type { Answer, AttemptDetail, Question, QuizDetail } from "@examora/contract";
import { attemptScore, type AttemptScore } from "@examora/contract/scoring";

export const quizQuestions = (quiz: QuizDetail): Question[] => quiz.parts.flatMap((p) => p.questions);

export const isSubmitted = (d: AttemptDetail) => d.attempt.submittedAt !== null;

// The questions this student's paper had (a pool draws only some), in the quiz's order.
export function questionsOf(all: readonly Question[], d: AttemptDetail): Question[] {
  const had = new Set(d.questionOrder);
  return all.filter((q) => had.has(q.id));
}

export function answerMap(d: AttemptDetail): Map<string, Answer> {
  return new Map(d.answers.map((a) => [a.questionId, a]));
}

// The text of a code or SQL answer, "" when blank.
export function answerText(d: AttemptDetail, questionId: string): string {
  const value = d.answers.find((a) => a.questionId === questionId)?.value;
  return typeof value === "string" ? value : "";
}

export function scoreOf(all: readonly Question[], d: AttemptDetail): AttemptScore {
  return attemptScore(questionsOf(all, d), answerMap(d));
}

// Each student's latest submitted attempt, by roster id.
export function latestSubmitted(details: readonly AttemptDetail[]): Map<string, AttemptDetail> {
  const latest = new Map<string, AttemptDetail>();
  for (const d of details) {
    if (!isSubmitted(d)) continue;
    const prev = latest.get(d.studentId);
    if (!prev || d.attempt.submittedAt! > prev.attempt.submittedAt!) latest.set(d.studentId, d);
  }
  return latest;
}
