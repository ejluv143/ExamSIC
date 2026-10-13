import { ShortQuestion } from "@/components/question-kinds/shared/print-parts";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"true_false"> = {
  space: () => 4,
  sheetKind: () => "tf",
  sheetBubbles: () => ["T", "F"],
};

export function Print({ q, n, answerSheet, urls }: PrintProps<"true_false">) {
  return <ShortQuestion n={n} prompt={q.prompt} urls={urls} answerSheet={answerSheet} />;
}
