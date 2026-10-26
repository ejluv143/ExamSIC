import { languageLabel } from "@examinus/question-kinds-core/code";
import { BoldPrompt, codeBox, indent, plural } from "@/components/question-kinds/shared/print-parts";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"code"> = {
  writingLines: { count: 14, height: "0.28in" },
  sheetKind: () => "long",
};

export function Print({ q, n, urls }: PrintProps<"code">) {
  const samples = q.tests.filter((t) => !t.hidden);
  const pre = codeBox;
  return (
    <>
      <BoldPrompt n={n} prompt={q.prompt} urls={urls} suffix={`${plural(q.points, "pt")}, ${languageLabel[q.language]}`} />
      {samples.map((t, i) => (
        <div key={t.id} style={{ ...indent, paddingTop: "3pt", display: "flex", gap: "0.15in" }}>
          <div style={{ flex: 1 }}>
            Sample input {samples.length > 1 ? i + 1 : ""}
            <pre style={pre}>{t.input || " "}</pre>
          </div>
          <div style={{ flex: 1 }}>
            Sample output {samples.length > 1 ? i + 1 : ""}
            <pre style={pre}>{t.expectedOutput}</pre>
          </div>
        </div>
      ))}
      {q.database?.trim() && (
        <div style={{ ...indent, paddingTop: "3pt" }}>
          Tables (use Laravel&apos;s DB facade or Eloquent)
          <pre style={pre}>{q.database.trim()}</pre>
        </div>
      )}
      {q.starterCode.trim() && (
        <div style={{ ...indent, paddingTop: "3pt" }}>
          Starter code
          <pre style={pre}>{q.starterCode.trimEnd()}</pre>
        </div>
      )}
    </>
  );
}
