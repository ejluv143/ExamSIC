import { Blank, BoldPrompt, indent } from "@/components/paper/parts";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"enumeration"> = {
  sheetKind: () => "lines",
  sheetLines: (q) => q.items.map((_, i) => ({ label: `${String.fromCharCode(97 + i)}.`, width: "2.6in" })),
};

export function Print({ q, n, answerSheet, urls }: PrintProps<"enumeration">) {
  return (
    <>
      <BoldPrompt n={n} prompt={q.prompt} urls={urls} />
      {!answerSheet &&
        q.items.map((_, i) => (
          <p key={i} style={{ ...indent, paddingTop: "4pt" }}>
            {String.fromCharCode(97 + i)}. <Blank width="3in" />
          </p>
        ))}
    </>
  );
}
