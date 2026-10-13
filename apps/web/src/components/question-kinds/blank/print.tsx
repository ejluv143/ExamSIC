import { blankKey, blankStyle } from "@examinus/domain/kinds/blank";
import { Markdown } from "@/components/markdown";
import { Blank, Numbered, ShortQuestion, byText } from "@/components/question-kinds/shared/print-parts";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"blank"> = {
  space: (q) => (blankStyle(q) === "single" ? 4 : 5),
  sheetKind: (q) => (blankStyle(q) === "single" ? "short" : "lines"),
  sheetLines: (q) => blankKey(q).map((_, i) => ({ label: `(${String.fromCharCode(97 + i)})`, width: "1.8in" })),
};

export function Print({ q, n, answerSheet, urls }: PrintProps<"blank">) {
  if (blankStyle(q) === "single") return <ShortQuestion n={n} prompt={q.prompt} urls={urls} answerSheet={answerSheet} />;
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
