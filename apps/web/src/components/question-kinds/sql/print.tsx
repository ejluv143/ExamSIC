import { BoldPrompt, codeBox, indent, plural } from "@/components/question-kinds/shared/print-parts";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"sql"> = {
  writingLines: { count: 6, height: "0.28in" },
  sheetKind: () => "long",
};

export function Print({ q, n, urls }: PrintProps<"sql">) {
  return (
    <>
      <BoldPrompt n={n} prompt={q.prompt} urls={urls} suffix={plural(q.points, "pt")} />
      <div style={{ ...indent, paddingTop: "3pt" }}>
        Tables
        <pre style={codeBox}>{q.setupSql.trim()}</pre>
      </div>
    </>
  );
}
