// Readable text for answer keys and students' answers, for previews, results and the AI coach. The text is markdown
// (choices, matching items and prompts are), so the web app shows it with `Markdown`. What each question type reads
// as is in its kind (`./kinds/`).
import { kindOf } from "./kinds/index.ts";
import type { Question, RevealQuestion } from "./question.ts";
import type { AnswerValue } from "./quiz.ts";

// Also accepts a `RevealQuestion` (the student reveal): the key reads only fields a reveal keeps, and the two
// rubric-graded types fall back to "graded by hand" when the rubric isn't there.
export const answerKey = (q: Question | RevealQuestion): string => kindOf(q).answerKey(q as Question);

// What the student put, as text. Empty string when they left it blank. Accepts a `RevealQuestion` too.
export function answerText(q: Question | RevealQuestion, value: AnswerValue | undefined): string {
  if (value === undefined || value === null) return "";
  return kindOf(q).answerText(q as Question, value);
}
