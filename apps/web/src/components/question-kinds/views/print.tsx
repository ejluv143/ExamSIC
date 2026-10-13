import type { Question, QuestionType } from "@examinus/domain/question";
import type { ComponentType } from "react";
import type { AssetUrls } from "@/components/question-kinds/shared/print-parts";
import { questionUi } from "../registry";

// With an answer sheet, the test paper only asks; answers go on the sheet. A print view never prints an answer.
export type PrintProps<T extends QuestionType> = {
  readonly q: Extract<Question, { type: T }>;
  readonly n: number;
  readonly answerSheet: boolean;
  readonly urls: AssetUrls;
};

// How a question is laid out on the answer sheet: bubbles for a choice, one line for a short answer, a line per
// answer, or a block of ruled lines for a long one. Drawing questions are answered on the test paper itself.
export type SheetKind = "mc" | "tf" | "short" | "lines" | "long" | "drawing";

// What the paper needs to know about a type besides how it prints: how it is paginated and how it is answered on
// the sheet.
export type PrintTraits<T extends QuestionType> = {
  // Space above the question, in points. Defaults to 5.
  readonly space?: (q: Extract<Question, { type: T }>) => number;
  // Ruled lines printed after the question as blocks of their own, so they can run over to the next page. Left out
  // when there is an answer sheet.
  readonly writingLines?: { readonly count: number; readonly height: string };
  readonly sheetKind: (q: Extract<Question, { type: T }>) => SheetKind;
  // The answer lines of a question that takes several answers: a label and the line's width.
  readonly sheetLines?: (q: Extract<Question, { type: T }>) => { label: string; width: string }[];
  // The bubble labels of a choice question.
  readonly sheetBubbles?: (q: Extract<Question, { type: T }>) => string[];
  // Printed after the answer line of a short answer.
  readonly sheetUnit?: (q: Extract<Question, { type: T }>) => string | undefined;
};

// The registry is exhaustive by type, so the entry found by `q.type` is the one that takes `q`; TypeScript can't see
// that correlation across the union, hence the casts here and nowhere else in the paper.
export function QuestionPrint(props: PrintProps<QuestionType>) {
  const Print = questionUi[props.q.type].Print as ComponentType<PrintProps<QuestionType>>;
  return <Print {...props} />;
}

export const printTraitsOf = (q: Question) => questionUi[q.type].printTraits as unknown as PrintTraits<QuestionType>;
