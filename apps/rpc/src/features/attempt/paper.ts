// The paper an attempt got, its score, and what that score means for the attempt. One place, so the order a student
// saw, the points they got and the status they are left in can't drift between the student page, the teacher's
// reports, the games and the background job. Pure: the row types are the only thing taken from the database layer.
import { type QuizPartWithQuestions } from "@examinus/contract/quiz";
import { type Question } from "@examinus/domain/question";
import { type AttemptStatus, type QuizSettings } from "@examinus/domain/quiz";
import { attemptScore, type AttemptScore, type ScoredAnswer } from "@examinus/domain/scoring";
import { orderForAttempt } from "@examinus/domain/shuffle";

// What a paper is made from: the quiz's settings and its parts. A `QuizDetail` fits.
export type PaperSource = { quiz: { settings: QuizSettings }; parts: readonly QuizPartWithQuestions[] };

export type AnswerRow = ScoredAnswer & { questionId: string };

export type AttemptPaper = {
  // The parts as this attempt's student saw them, questions in their order.
  parts: (Omit<QuizPartWithQuestions, "questions"> & { questions: Question[] })[];
  // Every question of the paper in the order it was seen.
  questions: Question[];
  // The attempt's score from its answer rows (a question without a row scores as unanswered).
  score: (rows: readonly AnswerRow[]) => AttemptScore;
};

// The paper of the attempt with this seed: the same seed always gives the same paper.
export function paperOf(source: PaperSource, seed: number): AttemptPaper {
  const parts = orderForAttempt(source.quiz.settings, source.parts, seed);
  const questions = parts.flatMap((p) => p.questions);
  return { parts, questions, score: (rows) => attemptScore(questions, new Map(rows.map((r) => [r.questionId, r]))) };
}

// The paper's questions in the order they were seen.
export const paperQuestions = (source: PaperSource, seed: number): Question[] => paperOf(source, seed).questions;

// The quiz's questions in the order they were written, whatever an attempt's seed would make of them.
export const authoredQuestions = (source: Pick<PaperSource, "parts">): Question[] => source.parts.flatMap((p) => p.questions);

// What a game plays: a relay goes through the questions as written, any other game gets each player's paper.
export const gameQuestions = (source: PaperSource, seed: number, relay: boolean): Question[] =>
  relay ? authoredQuestions(source) : paperQuestions(source, seed);

// Essays, and code nothing could check, wait for the teacher: the attempt is graded once nothing is left.
export const statusAfterScoring = (score: Pick<AttemptScore, "ungraded">): Exclude<AttemptStatus, "in_progress"> =>
  score.ungraded > 0 ? "needs_grading" : "graded";

// A day: no question takes longer, so a clock that was left running isn't recorded as more.
const maxSpentMs = 24 * 3600_000;

// The time a student reports spending on a question, kept within what is possible.
export const clampSpentMs = (ms: number): number => Math.min(Math.max(0, ms), maxSpentMs);
