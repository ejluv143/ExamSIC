// Helpers for the teacher's pages that read AttemptDetail rows together with their quiz. The results themselves
// (scores, latest attempt, topics) are in @examinus/domain/results.
import type { QuizDetail } from "@examinus/contract/quiz";
import type { AttemptDetail } from "@examinus/contract/session";
import type { Question } from "@examinus/domain/question";
import type { Answer } from "@examinus/domain/quiz";

export const quizQuestions = (quiz: QuizDetail): Question[] => quiz.parts.flatMap((p) => p.questions);

export function answerMap(d: AttemptDetail): Map<string, Answer> {
  return new Map(d.answers.map((a) => [a.questionId, a]));
}

// The text of a code or SQL answer, "" when blank.
export function answerText(d: AttemptDetail, questionId: string): string {
  const value = d.answers.find((a) => a.questionId === questionId)?.value;
  return typeof value === "string" ? value : "";
}
