// How a question's type is named to people. The names are on the kinds (@examinus/domain/kinds).
import { questionKinds } from "@examinus/domain/kinds";
import { questionTypes, type QuestionType } from "@examinus/domain/question";

export const questionTypeLabel = Object.fromEntries(questionTypes.map((t) => [t, questionKinds[t].label])) as Record<QuestionType, string>;

// A question's type for display.
export const questionLabel = (q: { type: QuestionType }) => questionTypeLabel[q.type];
