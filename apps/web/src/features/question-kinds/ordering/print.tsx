import { Blank, BoldPrompt, PaperItem, indent } from "@/components/paper/parts";
import { printedItems } from "../shared/print-items";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"ordering"> = {
  sheetKind: () => "lines",
  sheetLines: (q) => printedItems(q).map((_, i) => ({ label: `${String.fromCharCode(65 + i)}.`, width: "0.7in" })),
};

export function Print({ q, n, answerSheet, urls }: PrintProps<"ordering">) {
  return (
    <>
      <BoldPrompt n={n} prompt={q.prompt} urls={urls} />
      <p style={{ ...indent, fontStyle: "italic" }}>Write 1, 2, 3… beside the items to put them in the correct order.</p>
      <div style={{ ...indent, breakInside: "avoid" }}>
        {printedItems(q).map((item, i) => (
          <div key={item.id} style={{ display: "flex", alignItems: "baseline", gap: "0.35em", paddingTop: "3pt", breakInside: "avoid" }}>
            {!answerSheet && <Blank width="0.55in" style={{ flexShrink: 0 }} />}
            <span>{String.fromCharCode(65 + i)}.</span>
            <PaperItem item={item} urls={urls} />
          </div>
        ))}
      </div>
    </>
  );
}
