import { blankBoxes } from "@examinus/domain/blanks";
import { blankKey } from "@examinus/domain/kinds/blank";
import { Markdown } from "@/components/markdown";
import { Blank, Numbered, byText } from "@/components/question-kinds/shared/print-parts";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"blank"> = {
  space: () => 5,
  sheetKind: () => "lines",
  sheetLines: (q) => blankKey(q).map((_, i) => ({ label: `(${String.fromCharCode(97 + i)})`, width: "1.8in" })),
};

// A blank on paper: a line, or one square per letter with a gap between words.
function BlankSpace({ lengths }: { lengths: readonly number[] | null }) {
  if (!lengths) return <Blank width="1.3in" />;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "2pt 8pt", margin: "0 3pt", verticalAlign: "middle" }}>
      {lengths.map((count, w) => (
        <span key={w} style={{ display: "inline-flex", gap: "2pt" }}>
          {Array.from({ length: count }, (_, i) => (
            <span key={i} style={{ display: "inline-block", width: "0.22in", height: "0.22in", border: "1px solid #000" }} />
          ))}
        </span>
      ))}
    </span>
  );
}

export function Print({ q, n, urls }: PrintProps<"blank">) {
  const dropdown = q.clozeInput === "dropdown";
  const bank =
    q.clozeInput === "bank"
      ? [...blankKey(q).map((answers) => answers[0] ?? "").filter(Boolean), ...q.extraWords].sort(byText)
      : [];
  const boxes = blankBoxes(q.prompt);
  return (
    <>
      <Numbered n={n}>
        <Markdown
          assetUrls={urls} eager
          renderBlank={(i, { answers }) => (
            <>
              <BlankSpace lengths={boxes[i] ?? null} />
              {dropdown && (
                <span> ({[answers[0] ?? "", ...(q.wrongOptions[i] ?? [])].filter(Boolean).sort(byText).join(" / ")}) </span>
              )}
            </>
          )}
        >
          {q.prompt}
        </Markdown>
      </Numbered>
      {bank.length > 0 && (
        <div
          style={{
            marginTop: "4pt",
            marginLeft: "0.2in",
            border: "1px solid #000",
            padding: "3pt 6pt",
            display: "flex",
            flexWrap: "wrap",
            gap: "2pt 14pt",
          }}
        >
          {bank.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
      )}
    </>
  );
}
