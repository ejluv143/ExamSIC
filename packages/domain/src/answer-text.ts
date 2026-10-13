// Readable text for answer keys and students' answers, for previews, results and the AI coach. The text is markdown
// (choices, matching items and prompts are), so the web app shows it with `Markdown`. What each question type reads
// as is in its kind (`./kinds/`).
import { kindOf } from "./kinds/index.ts";
import type { Question } from "./question.ts";
import type { AnswerValue } from "./quiz.ts";

export const answerKey = (q: Question): string => kindOf(q).answerKey(q);

// What the student put, as text. Empty string when they left it blank.
export function answerText(q: Question, value: AnswerValue | undefined): string {
  if (value === undefined || value === null) return "";
  return kindOf(q).answerText(q, value);
}
