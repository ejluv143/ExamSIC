import type { CodeTestResult } from "@examinus/domain/kinds/base";
import type { QuestionType, StudentQuestion } from "@examinus/domain/question";
import type { AnswerValue } from "@examinus/domain/quiz";
import { questionUi } from "../registry";
import type { QuestionUi } from "../types";

// The Run button for languages the browser can't run. `ok` is null when there is no code runner.
export type RunCode = (questionId: string, code: string) => Promise<{ ok: readonly CodeTestResult[] | null } | { error: string }>;

// What the exam calls before handing in (or moving on): makes sure the drawing's latest picture is uploaded (the
// answer is updated through `onChange`). Throws an Error with a message for the student when the upload fails.
export type DrawingFinalizer = () => Promise<void>;

// The edits a code editor reports, for the teacher's typing replay.
export type EditHandler = (edits: { from: number; to: number; insert: string }[]) => void;

// Game players answer a choice or true/false question with one tap: the input then draws big coloured buttons that
// answer at once (`submit`) instead of an ordinary form control. `styles` are the buttons' colours, in order.
export type TapAnswer = { disabled: boolean; submit: (v: AnswerValue) => void; styles: readonly string[] };

// What a type's answer input is given: the student's question, the answer so far (whatever shape it has, the input
// reads its own) and what the page around it offers.
export type InputProps<T extends QuestionType> = {
  q: Extract<StudentQuestion, { type: T }>;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  assetUrls: Record<string, string>;
  // false in a preview: nothing is uploaded.
  uploads: boolean;
  registerDrawing: (questionId: string, finalize: DrawingFinalizer | null) => void;
  // Choice and true/false questions only: answer on tap, as in a game.
  tap?: TapAnswer;
  // Code questions: runs languages the browser can't. Missing when no code runner is set up.
  runOnServer?: RunCode;
  // Code and SQL questions: every edit, for the typing replay. Missing when nothing is recorded.
  onEdit?: EditHandler;
};

// The answer input of the question's type. TypeScript can't see that the entry found by `q.type` is the one that
// takes `q`, hence the one cast.
export function AnswerInput(props: InputProps<QuestionType>) {
  const { Input } = questionUi[props.q.type] as unknown as QuestionUi<QuestionType>;
  return <Input {...props} />;
}
