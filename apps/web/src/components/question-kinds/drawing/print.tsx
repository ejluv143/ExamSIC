import { BoldPrompt, indent, plural } from "@/components/question-kinds/shared/print-parts";
import type { PrintProps, PrintTraits } from "../views/print";

export const traits: PrintTraits<"drawing"> = {
  // Drawn in the box under the question on the test paper, so the sheet has no lines for it.
  sheetKind: () => "drawing",
};

export function Print({ q, n, urls }: PrintProps<"drawing">) {
  // The answer box has the canvas's proportions, at most 5 in wide and 4 in tall so it fits a page. The
  // background picture, if any, is printed inside it for students to draw on.
  const boxWidth = Math.min(5, (4 * q.canvasWidth) / q.canvasHeight);
  const background = q.backgroundImageId === undefined ? undefined : urls[q.backgroundImageId];
  return (
    <>
      <BoldPrompt n={n} prompt={q.prompt} urls={urls} suffix={plural(q.points, "pt")} />
      <div style={{ ...indent, paddingTop: "4pt" }}>
        <div
          style={{
            position: "relative",
            width: `${boxWidth}in`,
            aspectRatio: `${q.canvasWidth} / ${q.canvasHeight}`,
            border: "1px solid #000",
            breakInside: "avoid",
          }}
        >
          {q.backgroundImageId !== undefined &&
            (background ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={background}
                alt={q.backgroundAlt ?? ""}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", maxHeight: "none", objectFit: "contain" }}
              />
            ) : (
              <span style={{ display: "block", padding: "3pt", fontSize: "9pt" }}>
                [image: {q.backgroundAlt || "no description"}]
              </span>
            ))}
        </div>
      </div>
    </>
  );
}
