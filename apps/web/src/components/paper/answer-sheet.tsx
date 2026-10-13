import type { Question } from "@examinus/domain/question";
import type { EditorQuiz } from "@/lib/quiz-editor";
import { printTraitsOf, type SheetKind } from "@/features/question-kinds/views/print";
import type { Block } from "./layout";
import { Blank, plural } from "./parts";
import { partHeading, printedParts } from "./printed";

function Bubble({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: "0.21in",
        height: "0.21in",
        borderRadius: "50%",
        border: "1.2px solid #000",
        fontSize: "7pt",
        lineHeight: 1,
      }}
    >
      {label}
    </span>
  );
}

const chunk = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

// Numbers run down each column first, like a scan sheet.
function BubbleGrid({ start, count, labels, columns }: { start: number; count: number; labels: string[]; columns: number }) {
  const rows = Math.ceil(count / columns);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: `repeat(${rows}, 0.3in)`,
        gridAutoFlow: "column",
        gridAutoColumns: "max-content",
        columnGap: "0.35in",
        paddingLeft: "0.15in",
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.06in" }}>
          <span style={{ width: "0.28in", textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {start + i}
          </span>
          {labels.map((l) => (
            <Bubble key={l} label={l} />
          ))}
        </div>
      ))}
    </div>
  );
}

// The answer sheet: the same parts and numbers as the test paper, but the answers are marked here. Consecutive
// questions of the same kind share one block of bubbles or lines.
export function answerSheetBlocks(a: EditorQuiz): Block[] {
  const blocks: Block[] = [
    {
      space: 10,
      node: (
        <p style={{ display: "flex", alignItems: "center", gap: "0.08in", fontSize: "10pt" }}>
          Shade one circle completely for each item (every correct circle when it says select all that apply):
          <span style={{ display: "inline-block", width: "0.16in", height: "0.16in", borderRadius: "50%", background: "#000" }} />
          Use a black or blue pen. Write other answers on the lines.
        </p>
      ),
    },
  ];
  for (const p of printedParts(a)) {
    blocks.push(partHeading(p, 14));
    const runs: { kind: SheetKind; items: { q: Question; n: number }[] }[] = [];
    p.questions.forEach((q, i) => {
      const kind = printTraitsOf(q).sheetKind(q);
      const last = runs.at(-1);
      if (last && last.kind === kind) last.items.push({ q, n: p.start + i });
      else runs.push({ kind, items: [{ q, n: p.start + i }] });
    });
    const line = (width: string) => <Blank width={width} style={{ height: "1em" }} />;
    for (const { kind, items } of runs) {
      switch (kind) {
        case "mc":
        case "tf": {
          // The run gets as many bubbles per item as its longest question needs.
          const labels = items
            .map(({ q }) => printTraitsOf(q).sheetBubbles?.(q) ?? [])
            .reduce((longest, l) => (l.length > longest.length ? l : longest), [] as string[]);
          const columns = kind === "tf" ? 5 : 3;
          // At most 15 rows per block so a long part can continue on the next page.
          chunk(items, columns * 15).forEach((group) =>
            blocks.push({
              space: 6,
              node: <BubbleGrid start={group[0].n} count={group.length} labels={labels} columns={columns} />,
            }),
          );
          break;
        }
        case "short":
          // Small chunks (two columns of five) so a part can start at the bottom of a page.
          chunk(items, 10).forEach((group) =>
            blocks.push({
              space: 4,
              node: (
                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: `repeat(${Math.ceil(group.length / 2)}, 0.32in)`,
                    gridAutoFlow: "column",
                    columnGap: "0.4in",
                  }}
                >
                  {group.map(({ q, n }) => {
                    const unit = printTraitsOf(q).sheetUnit?.(q);
                    return (
                      <p key={q.id} style={{ display: "flex", alignItems: "end", gap: "0.06in" }}>
                        <span style={{ width: "0.3in", textAlign: "right", fontWeight: 700 }}>{n}.</span>
                        {line("2.6in")}
                        {unit && <span>{unit}</span>}
                      </p>
                    );
                  })}
                </div>
              ),
            }),
          );
          break;
        case "lines":
          items.forEach(({ q, n }) =>
            blocks.push({
              space: 6,
              node: (
                <div style={{ display: "flex", gap: "0.06in" }}>
                  <span style={{ width: "0.3in", textAlign: "right", fontWeight: 700, flexShrink: 0 }}>{n}.</span>
                  <div style={{ display: "flex", flexWrap: "wrap", columnGap: "0.4in", rowGap: "8pt" }}>
                    {(printTraitsOf(q).sheetLines?.(q) ?? []).map(({ label, width }) => (
                      <span key={label} style={{ display: "inline-flex", alignItems: "end", gap: "0.04in" }}>
                        {label} {line(width)}
                      </span>
                    ))}
                  </div>
                </div>
              ),
            }),
          );
          break;
        case "long":
          items.forEach(({ q, n }) =>
            blocks.push({
              space: 8,
              node: (
                <>
                  <p style={{ fontWeight: 700 }}>
                    {n}. <span style={{ fontWeight: 400 }}>({plural(q.points, "pt")})</span>
                  </p>
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} style={{ height: "0.3in", borderBottom: "1px solid #000", marginLeft: "0.36in" }} />
                  ))}
                </>
              ),
            }),
          );
          break;
      }
    }
  }
  return blocks;
}
