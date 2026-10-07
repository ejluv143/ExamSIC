// Mastery mode: self-paced practice. Each answer is graded at once; a wrong answer comes back later in the
// queue until it is answered correctly or the retry limit is reached.
import { Schema } from "effect";
import { Question, StudentQuestion } from "./question.ts";

// How many other questions come before a missed question returns.
export const masteryRequeueGap = 3;

// Where the student stands. `question` is the one to answer now (null once the queue is empty).
export const MasteryState = Schema.Struct({
  // Questions on the paper.
  total: Schema.Int,
  // Answered correctly.
  mastered: Schema.Int,
  // Out of tries without a correct answer.
  missed: Schema.Int,
  // Accepted once and waiting for the teacher.
  pending: Schema.Int,
  // Still in the queue (the current question included).
  remaining: Schema.Int,
  retryLimit: Schema.Int,
  targetPercent: Schema.NullOr(Schema.Int),
  question: Schema.NullOr(StudentQuestion),
  // Tries already used on the current question.
  triesUsed: Schema.Int,
  // The attempt is over (the queue is empty and it was submitted).
  finished: Schema.Boolean,
  // Signed URLs of the images of the current question, by asset id.
  assetUrls: Schema.Record(Schema.String, Schema.String),
});
export type MasteryState = typeof MasteryState.Type;

// What the student sees right after an answer.
export const MasteryFeedback = Schema.Struct({
  // null: graded later by the teacher.
  correct: Schema.NullOr(Schema.Boolean),
  // Fraction correct of this try, 0 to 1 (null: waits for the teacher).
  score: Schema.NullOr(Schema.Number),
  triesUsed: Schema.Int,
  triesLeft: Schema.Int,
  // The question will come back later.
  returns: Schema.Boolean,
  // Out of tries: the question is done and unmastered.
  final: Schema.Boolean,
  // The author's explanation (markdown), empty when there is none.
  explanation: Schema.String,
  // The question with its answers, only after the last wrong try and when the teacher allows it.
  reveal: Schema.NullOr(Question),
  // Images of `reveal`, by asset id.
  assetUrls: Schema.Record(Schema.String, Schema.String),
});
export type MasteryFeedback = typeof MasteryFeedback.Type;

export const MasteryAnswerResult = Schema.Struct({ feedback: MasteryFeedback, state: MasteryState });
export type MasteryAnswerResult = typeof MasteryAnswerResult.Type;
