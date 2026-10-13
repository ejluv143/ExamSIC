import { ShortQuestion } from "@/components/question-kinds/shared/print-parts";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"numeric"> = {
  space: () => 4,
  sheetKind: () => "short",
  sheetUnit: (q) => q.unit || undefined,
};

export function Print({ q, n, answerSheet, urls }: PrintProps<"numeric">) {
  return <ShortQuestion n={n} prompt={q.prompt} urls={urls} answerSheet={answerSheet} suffix={q.unit ? `in ${q.unit}` : undefined} />;
}
