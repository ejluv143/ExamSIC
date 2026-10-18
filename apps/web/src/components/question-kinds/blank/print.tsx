import { answerBoxLengths, blankKey, blankStyle } from "@examinus/domain/kinds/blank";
import { Markdown } from "@/components/markdown";
import { Blank, Numbered, ShortQuestion, byText } from "@/components/question-kinds/shared/print-parts";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"blank"> = {
  space: (q) => (blankStyle(q) === "single" ? 4 : 5),
  sheetKind: (q) => (blankStyle(q) === "single" ? "short" : "lines"),
  sheetLines: (q) => blankKey(q).map((_, i) => ({ label: `(${String.fromCharCode(97 + i)})`, width: "1.8in" })),
};

export function Print({ q, n, answerSheet, urls }: PrintProps<"blank">) {
  if (blankStyle(q) === "single") {
    const boxes = answerBoxLengths(q);
    if (!boxes || answerSheet) return <ShortQuestion n={n} prompt={q.prompt} urls={urls} answerSheet={answerSheet} />;
    // One box per letter under the question, words apart.
    return (
      <>
        <Numbered n={n}>
          <Markdown assetUrls={urls} eager>{q.prompt}</Markdown>
        </Numbered>
        <div style={{ marginTop: "3pt", marginLeft: "0.2in", display: "flex", flexWrap: "wrap", gap: "4pt 12pt" }}>
          {boxes.map((count, w) => (
            <span key={w} style={{ display: "inline-flex", gap: "2pt" }}>
              {Array.from({ length: count }, (_, i) => (
                <span key={i} style={{ display: "inline-block", width: "0.22in", height: "0.22in", border: "1px solid #000" }} />
              ))}
            </span>
          ))}
        </div>
      </>
    );
  }
  const dropdown = q.mode === "cloze" && q.clozeInput === "dropdown";
  const bank =
    q.mode === "cloze" && q.clozeInput === "bank"
      ? [...blankKey(q).map((answers) => answers[0] ?? "").filter(Boolean), ...q.extraWords].sort(byText)
      : [];
  return (
    <>
      <Numbered n={n}>
        <Markdown
          assetUrls={urls} eager
          renderBlank={(i, answers) => (
            <>
              <Blank width="1.3in" />
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
