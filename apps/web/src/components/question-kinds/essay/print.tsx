import { BoldPrompt, plural } from "@/components/question-kinds/shared/print-parts";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"essay"> = {
  sheetKind: () => "long",
};

export function Print({ q, n, answerSheet, urls }: PrintProps<"essay">) {
  return (
    <>
      <BoldPrompt n={n} prompt={q.prompt} urls={urls} suffix={plural(q.points, "pt")} />
      {!answerSheet &&
        Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={{ height: "0.3in", borderBottom: "1px solid #000" }} />
        ))}
    </>
  );
}
