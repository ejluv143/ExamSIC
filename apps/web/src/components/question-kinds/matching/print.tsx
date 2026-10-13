import { Blank, BoldPrompt, PaperItem, indent } from "@/components/question-kinds/shared/print-parts";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"matching"> = {
  sheetKind: () => "lines",
  sheetLines: (q) => q.left.map((_, i) => ({ label: `${i + 1}.`, width: "0.7in" })),
};

export function Print({ q, n, answerSheet, urls }: PrintProps<"matching">) {
  return (
    <>
      <BoldPrompt n={n} prompt={q.prompt} urls={urls} />
      <div style={{ ...indent, display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "0.3in", paddingTop: "3pt" }}>
        <div>
          {q.left.map((l, i) => (
            <div key={l.id} style={{ display: "flex", alignItems: "baseline", gap: "0.35em", paddingTop: "3pt" }}>
              {!answerSheet && <Blank width="0.55in" style={{ flexShrink: 0 }} />}
              <span>{i + 1}.</span>
              <PaperItem item={l} urls={urls} />
            </div>
          ))}
        </div>
        <div>
          {q.right.map((r, i) => (
            <div key={r.id} style={{ display: "flex", gap: "0.35em", paddingTop: "3pt" }}>
              <span>{String.fromCharCode(65 + i)}.</span>
              <PaperItem item={r} urls={urls} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
