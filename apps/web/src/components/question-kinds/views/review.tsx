import type { ComponentType } from "react";
import type { AiControls } from "@/features/ai/components/ai-grading-controls";
import type { Stroke } from "@examinus/domain/drawing";
import type { CodeTestResult } from "@examinus/domain/kinds/base";
import type { Question, QuestionType } from "@examinus/domain/question";
import type { Answer, AnswerValue } from "@examinus/domain/quiz";
import type { TypingEdit } from "@examinus/domain/quiz";
import { questionUi } from "../registry";

type QuestionOf<T extends QuestionType> = Extract<Question, { type: T }>;

// What the teacher has typed for one question so far; `marks` are the strokes drawn over a drawing answer.
export type DraftRow = { points: string; feedback: string; marks: Stroke[] };

// What a type's grading controls need beyond the answer: the stored row, what the checkers returned, how the answer
// was typed, the draft score and feedback with the setters, and the AI drafts. The rubric rows ticked as quick
// scoring live in the card (typing a score clears them), so the setters for them are here too.
export type Grading = {
  row: Answer | undefined;
  codeResults: readonly CodeTestResult[] | undefined;
  typing: readonly TypingEdit[] | undefined;
  draft: DraftRow;
  ticked: ReadonlySet<string>;
  setTicked: (ticked: ReadonlySet<string>) => void;
  setPoints: (points: string) => void;
  setFeedback: (feedback: string) => void;
  setMarks: (marks: Stroke[]) => void;
  ai: AiControls;
};

// A given answer shown against the key, in the place where it is shown:
// - `prompt`: the prompt on the results page (an inline blank is filled in the sentence);
// - `result`: the student's answer, the key and the teacher's feedback on the results page;
// - `grading`: the key, the answer and the checks the teacher grades from, with the type's own grading controls;
// - `live`: the answer as it stands in the live drawer, with the typing replay for the types that have one;
// - `key`: the question's key alone (the question bank).
type Shown<T extends QuestionType> = { q: QuestionOf<T>; urls: Record<string, string> };

export type ReviewProps<T extends QuestionType> =
  | (Shown<T> & { mode: "prompt"; answer: AnswerValue })
  | (Shown<T> & { mode: "result"; answer: AnswerValue; full: boolean; feedback: string })
  | (Shown<T> & { mode: "grading"; answer: AnswerValue; grading: Grading })
  | (Shown<T> & { mode: "live"; answer: AnswerValue | undefined; number: number; edits: readonly TypingEdit[] | undefined })
  | (Shown<T> & { mode: "key" });

// Shows `q` with the Review of its type. The registry is exhaustive by type, so the Review found by `q.type` is the
// one that takes `q`; TypeScript can't see that correlation across the union, hence the one cast.
export function Review(props: ReviewProps<QuestionType>) {
  const View = questionUi[props.q.type].Review as ComponentType<ReviewProps<QuestionType>>;
  return <View {...props} />;
}
