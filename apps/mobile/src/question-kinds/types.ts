import type { QuestionType, RevealQuestion, StudentQuestion } from "@examinus/domain/question";
import type { AnswerValue } from "@examinus/domain/quiz";
import type { EditHandler } from "@examinus/taking/typing";
import type { RunCode } from "@examinus/taking/types";

// What the paper calls before handing in (or moving on): makes sure the drawing's latest picture is uploaded (the
// answer is updated through `onChange`). Throws an Error with a message for the student when the upload fails.
export type DrawingFinalizer = () => Promise<void>;

// Game players answer a choice or true/false question with one tap: the input then draws big coloured buttons that
// answer at once (`submit`). `styles` are the buttons' colours in order: a NativeWind class for the tile and the
// text colour that reads on it.
export type TapAnswer = {
  disabled: boolean;
  submit: (v: AnswerValue) => void;
  styles: readonly { readonly tile: string; readonly text: string }[];
};

// What an answer input is given: the student's question, the answer so far (whatever shape the type has) and what
// the screen around it offers. The same props as the web's `InputProps`, with `value` null for no answer.
export type QuestionInputProps = {
  question: StudentQuestion;
  value: AnswerValue | null;
  onChange: (value: AnswerValue) => void;
  // Code and SQL questions: every edit, for the typing replay. Missing when nothing is recorded.
  onEdit?: EditHandler;
  disabled?: boolean;
  assetUrls: Readonly<Record<string, string>>;
  // Choice and true/false questions only: answer on tap, as in a game.
  tap?: TapAnswer;
  // Code and SQL questions: runs the visible tests on the API. Missing when no code runner is set up.
  runOnServer?: RunCode;
  // Drawing questions: registered while the question is on screen so the paper can upload the latest picture. A
  // preview (nothing is uploaded) leaves it out.
  registerDrawing?: (questionId: string, finalize: DrawingFinalizer | null) => void;
};

// The same props for the input of one type, with the question narrowed.
export type KindInputProps<T extends QuestionType> = Omit<QuestionInputProps, "question"> & {
  question: Extract<StudentQuestion, { type: T }>;
};

// A question with the student's answer, as the results screen shows it: the prompt, the answer against the key
// (when it is revealed), the teacher's feedback and the explanation.
export type QuestionReviewProps = {
  question: RevealQuestion;
  answer: AnswerValue;
  // Full points: the key is only shown under an answer that wasn't fully right.
  full: boolean;
  feedback: string;
  assetUrls: Readonly<Record<string, string>>;
};

export type KindReviewProps<T extends QuestionType> = Omit<QuestionReviewProps, "question"> & {
  question: Extract<RevealQuestion, { type: T }>;
};
