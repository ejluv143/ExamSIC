"use client";

import type { Question, QuestionType } from "@examinus/domain/question";
import { questionUi } from "../registry";
import type { QuestionUi } from "../types";

// What a type's answer editor is given: the teacher's question of the type and a way to replace it.
export type EditorProps<T extends QuestionType> = {
  q: Extract<Question, { type: T }>;
  onChange: (q: Extract<Question, { type: T }>) => void;
};

// The editor of what a question's answer is, of the question's type. TypeScript can't see that the entry found by
// `q.type` is the one that takes `q`, hence the one cast.
export function AnswerEditor(props: EditorProps<QuestionType>) {
  const { Editor } = questionUi[props.q.type] as unknown as QuestionUi<QuestionType>;
  return <Editor {...props} />;
}
