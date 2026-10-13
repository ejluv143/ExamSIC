import { BoldPrompt, PaperItem, indent } from "@/components/paper/parts";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"multiple_choice"> = {
  sheetKind: () => "mc",
  sheetBubbles: (q) => q.choices.map((_, i) => String.fromCharCode(65 + i)),
};

export function Print({ q, n, urls }: PrintProps<"multiple_choice">) {
  return (
    <>
      <BoldPrompt n={n} prompt={q.prompt} urls={urls} />
      {q.multipleCorrect && <p style={{ ...indent, fontStyle: "italic" }}>Select all that apply.</p>}
      {/* With pictures the choices sit in two columns, so they take less of the page. */}
      <div
        style={
          q.choices.some((c) => c.imageId !== undefined)
            ? { ...indent, display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "0.3in", rowGap: "4pt", paddingTop: "3pt" }
            : undefined
        }
      >
        {q.choices.map((c, i) => (
          <div key={c.id} style={{ ...(q.choices.some((x) => x.imageId !== undefined) ? {} : indent), display: "flex", gap: "0.35em", breakInside: "avoid" }}>
            <span>{String.fromCharCode(65 + i)}.</span>
            <PaperItem item={c} urls={urls} />
          </div>
        ))}
      </div>
    </>
  );
}
