// Rows of the attempt feature as the contract's shapes. Pure.
import { type AttemptResult, type QuizMeta, type ReviewItem } from "@examinus/contract/attempt";
import { type Question } from "@examinus/domain/question";
import { type Attempt } from "@examinus/domain/quiz";
import { answerGiven, answerSummary } from "@examinus/domain/review";
import { type AttemptScore } from "@examinus/domain/scoring";
import type { AnswerItem, AttemptItem, QuizItem } from "../../database/schemas/index.ts";

export const toAttempt = (a: AttemptItem): Attempt => ({
  id: a.id,
  sessionId: a.sessionId,
  studentId: a.studentId,
  seed: a.seed,
  status: a.status,
  startedAt: a.startedAt.toISOString(),
  submittedAt: a.submittedAt?.toISOString() ?? null,
  pledgeAcceptedAt: a.pledgeAcceptedAt?.toISOString() ?? null,
});

export const toMeta = (q: QuizItem): QuizMeta => ({
  id: q.id,
  title: q.title,
  description: q.description,
  subject: q.subject,
  subjectArea: q.subjectArea,
  header: q.header,
});

export const summary = (score: AttemptScore): AttemptResult => ({
  score: score.score,
  max: score.max,
  pendingEssays: score.ungraded,
});

// Where each question of the paper stands, for the student's overview and review screen.
export const reviewItems = (paper: readonly Question[], rows: readonly AnswerItem[], closed: readonly boolean[]): ReviewItem[] => {
  const byQuestion = new Map(rows.map((r) => [r.questionId, r]));
  return paper.map((q, i) => {
    const row = byQuestion.get(q.id);
    return {
      questionId: q.id,
      answered: answerGiven(q, row?.value ?? undefined),
      marked: row?.markedForReview ?? false,
      closed: closed[i] ?? false,
      summary: answerSummary(q, row?.value ?? undefined),
    };
  });
};
