// Starting shapes for new questions. What differs between types is in each type's kind (packages/domain/src/kinds). The checks a question must pass are in quiz-editing.ts.
import type { Question, QuestionType } from "@examinus/domain/question";
import { questionKinds } from "@examinus/domain/kinds";

export const newQuestion = (type: QuestionType, id?: string): Question => questionKinds[type].create(id);
