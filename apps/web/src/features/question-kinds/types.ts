import type { QuestionType } from "@examinus/domain/question";
import type { ComponentType } from "react";
import type { EditorProps } from "./views/editor";
import type { InputProps } from "./views/input";
import type { PrintProps, PrintTraits } from "./views/print";
import type { ReviewProps } from "./views/review";

// What the web app shows for one question type: the student's answer input, the review of a given answer against
// the key (results, grading, live drawer), the teacher's editor, and the printed paper. One module per type in
// `./<type>/`, listed in `./registry.ts`; the view props live in `./views/`, next to the component that picks the
// right type's view.
export type QuestionUi<T extends QuestionType> = {
  readonly Input: ComponentType<InputProps<T>>;
  readonly Review: ComponentType<ReviewProps<T>>;
  readonly Editor: ComponentType<EditorProps<T>>;
  readonly Print: ComponentType<PrintProps<T>>;
  // How the paper paginates the type and lays it out on the answer sheet; see `PrintTraits`.
  readonly printTraits: PrintTraits<T>;
};
