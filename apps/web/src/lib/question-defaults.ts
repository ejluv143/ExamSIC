// Starting shapes for new questions, and the checks a question must pass before the quiz is saved. What differs
// between types is in each type's editor model (features/question-kinds/<type>/editor-model.ts).
import { imagesWithoutAlt } from "@examinus/domain/asset";
import { unitCount } from "@examinus/domain/scoring";
import type { Question, QuestionType } from "@examinus/domain/question";
import { editorModels, modelOf } from "@/features/question-kinds/views/editor-model";

export const newQuestion = (type: QuestionType, id?: string): Question => editorModels[type].create(id);

// The first thing wrong with a question, or null. Callers add "Question N" in front.
export function validateQuestion(q: Question): string | null {
  if (!q.prompt.trim()) return "has no question text.";
  const noAlt = imagesWithoutAlt(q);
  if (noAlt.length > 0) return `has an image without alt text (${noAlt.join(", ")}). Describe each image so students using a screen reader can follow.`;
  if (q.points <= 0) return "must be worth more than 0 points.";
  if (!Number.isInteger(q.points * 2)) return "can only be worth whole or half points.";
  if ("weights" in q && q.weights && q.weights.length > 0) {
    if (q.weights.length !== unitCount(q) || q.weights.some((w) => !(w >= 0)) || !q.weights.some((w) => w > 0))
      return "has custom weights that don't match its parts. Edit the weights again or switch back to equal shares.";
  }
  return modelOf(q).validate?.(q) ?? null;
}
