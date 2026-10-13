import { Markdown } from "@/components/markdown";
import { Blank, BoldPrompt, PaperItem, gray, indent } from "@/components/paper/parts";
import { printedItems } from "../shared/print-items";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"categorization"> = {
  sheetKind: () => "lines",
  sheetLines: (q) => printedItems(q).map((_, i) => ({ label: `${i + 1}.`, width: "0.7in" })),
};

export function Print({ q, n, answerSheet, urls }: PrintProps<"categorization">) {
  const items = printedItems(q);
  return (
    <>
      <BoldPrompt n={n} prompt={q.prompt} urls={urls} />
      <div style={{ ...indent, paddingTop: "3pt", breakInside: "avoid" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "inherit" }}>
          <thead>
            <tr>
              <th style={{ border: gray, padding: "2pt 5pt", width: "0.5in", textAlign: "left" }}>Letter</th>
              <th style={{ border: gray, padding: "2pt 5pt", textAlign: "left" }}>Category</th>
            </tr>
          </thead>
          <tbody>
            {q.categories.map((c, i) => (
              <tr key={c.id}>
                <td style={{ border: gray, padding: "2pt 5pt", fontWeight: 700 }}>{String.fromCharCode(65 + i)}</td>
                <td style={{ border: gray, padding: "2pt 5pt" }}>
                  <b>{c.name}</b>
                  {c.description?.trim() && (
                    <Markdown assetUrls={urls} eager>
                      {c.description}
                    </Markdown>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontStyle: "italic", paddingTop: "3pt" }}>
          Write the letter of the category beside each item. Leave an item blank if it belongs to none.
        </p>
        {items.map((item, i) => (
          <div key={item.id} style={{ display: "flex", alignItems: "baseline", gap: "0.35em", paddingTop: "3pt", breakInside: "avoid" }}>
            {!answerSheet && <Blank width="0.55in" style={{ flexShrink: 0 }} />}
            <span>{i + 1}.</span>
            <PaperItem item={item} urls={urls} />
          </div>
        ))}
      </div>
    </>
  );
}
