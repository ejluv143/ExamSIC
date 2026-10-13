import { BoldPrompt, indent } from "@/components/question-kinds/shared/print-parts";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"hotspot"> = {
  // Marked on the picture itself on the test paper.
  sheetKind: () => "drawing",
};

export function Print({ q, n, urls }: PrintProps<"hotspot">) {
  const url = urls[q.imageId];
  return (
    <>
      <BoldPrompt n={n} prompt={q.prompt} urls={urls} />
      <p style={{ ...indent, fontStyle: "italic" }}>
        Mark the correct area on the image{q.maxClicks > 1 ? ` (up to ${q.maxClicks} marks)` : ""}.
      </p>
      <div style={{ ...indent, paddingTop: "4pt", breakInside: "avoid" }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={q.alt} style={{ display: "block", maxWidth: "5in", maxHeight: "3.6in", border: "1px solid #000" }} />
        ) : (
          <span>[image: {q.alt || "no description"}]</span>
        )}
      </div>
    </>
  );
}
