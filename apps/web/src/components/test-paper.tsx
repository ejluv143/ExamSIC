"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { promptParts } from "@/lib/blanks";
import { paperTitle } from "@/lib/format";
import { maxScore } from "@/lib/scoring";
import type { Assessment, Class, PaperSize, PartSettings, Question, QuestionType } from "@/lib/types";
import { MathText } from "./math-text";
import { PaperHeader } from "./paper-header";

// Measurements follow the school's Word template. Lengths are in inches, as on the printed page.
export const pageSizes: Record<PaperSize, { label: string; width: number; height: number }> = {
  long: { label: "Long (8.5 × 13 in)", width: 8.5, height: 13 },
  letter: { label: "Short / Letter (8.5 × 11 in)", width: 8.5, height: 11 },
  a4: { label: "A4 (8.27 × 11.69 in)", width: 8.27, height: 11.69 },
};
const PX = 96; // CSS pixels per inch, on screen and in print
const body = { left: 0.75, right: 0.7 };
const wide = { left: 0.25, right: 0.2 };
const firstPageTop = 0.4;
const otherPageTop = 0.65;
const footerBottom = 0.17;
const footerSpace = 1.0; // the content area stops this far from the bottom edge

const fonts = {
  sans: 'Calibri, Carlito, "Segoe UI", Arial, sans-serif',
  serif: '"Times New Roman", "Liberation Serif", Tinos, Times, serif',
  narrow: '"Arial Narrow", "Liberation Sans Narrow", "Nimbus Sans Narrow", Arial, sans-serif',
};
const navy = "#002060";
const gray = "1px solid #bfbfbf";

export const defaultParts: Record<QuestionType, PartSettings> = {
  multiple_choice: {
    title: "Multiple Choice",
    instructions: "Read each item carefully and encircle the letter corresponding to the correct answer.",
  },
  true_false: {
    title: "True or False",
    instructions:
      "Write TRUE if the statement is correct and FALSE if it is not. Write your answer on the space provided before each number.",
  },
  identification: {
    title: "Identification",
    instructions:
      "Identify the term, concept, or formula described in each statement. Write your answer on the space provided before each number.",
  },
  fill_in_the_blank: {
    title: "Fill in the Blanks",
    instructions: "Fill in each blank with the correct word or phrase.",
  },
  enumeration: { title: "Enumeration", instructions: "List what is asked in each item." },
  numeric: {
    title: "Problem Solving",
    instructions: "Solve each problem. Write your final answer on the space provided before each number.",
  },
  essay: { title: "Essay", instructions: "Answer each question briefly but completely." },
};

// Instructions when students answer on the separate answer sheet.
const sheetInstructions: Record<QuestionType, string> = {
  multiple_choice: "Read each item carefully and shade the letter of the correct answer on your answer sheet.",
  true_false: "Shade T if the statement is correct and F if it is not on your answer sheet.",
  identification:
    "Identify the term, concept, or formula described in each statement. Write your answer on your answer sheet.",
  fill_in_the_blank: "Write the missing word or phrase for each blank on your answer sheet.",
  enumeration: "List what is asked in each item on your answer sheet.",
  numeric: "Solve each problem. Write your final answer on your answer sheet.",
  essay: "Answer each question on your answer sheet.",
};

export function defaultPart(type: QuestionType, answerSheet: boolean): PartSettings {
  return answerSheet ? { ...defaultParts[type], instructions: sheetInstructions[type] } : defaultParts[type];
}

const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Parts always print in this order, whatever order the questions were added in.
const partOrder: QuestionType[] = [
  "multiple_choice",
  "true_false",
  "identification",
  "fill_in_the_blank",
  "enumeration",
  "numeric",
  "essay",
];

// Each question type becomes one part. Within a part, questions keep their editor order; numbering restarts per part.
export function groupIntoParts(questions: Question[]) {
  return partOrder
    .map((type) => ({ type, questions: questions.filter((q) => q.type === type) }))
    .filter((part) => part.questions.length > 0);
}

export function partSettings(a: Assessment, type: QuestionType): PartSettings {
  const custom = a.paper.parts[type];
  const fallback = defaultPart(type, a.paper.answerSheet);
  return {
    title: custom?.title.trim() || fallback.title,
    instructions: custom?.instructions.trim() || fallback.instructions,
  };
}

type Block = {
  node: ReactNode;
  // Space above the block, in points; part of the block so measuring includes it.
  space?: number;
  inset?: { left: number; right: number };
  // Keep on the same page as the next block (part headings and their instructions).
  keepWithNext?: boolean;
};

function Blank({ width, style }: { width: string; style?: CSSProperties }) {
  return <span style={{ display: "inline-block", width, borderBottom: "1px solid #000", ...style }} />;
}

// With an answer sheet, the test paper only asks; answers go on the sheet.
function questionBlocks(q: Question, n: number, answerSheet: boolean): Block[] {
  const bold: CSSProperties = { fontWeight: 700 };
  const indent: CSSProperties = { paddingLeft: "0.2in" };
  switch (q.type) {
    case "multiple_choice":
      return [
        {
          space: 5,
          node: (
            <>
              <p style={bold}>
                {n}. <MathText text={q.prompt} />
              </p>
              {q.choices.map((c, i) => (
                <p key={c.id} style={indent}>
                  {String.fromCharCode(65 + i)}. <MathText text={c.text} />
                </p>
              ))}
            </>
          ),
        },
      ];
    case "true_false":
    case "identification":
    case "numeric":
      return [
        {
          space: 4,
          node: (
            <div style={{ display: "flex" }}>
              {!answerSheet && <Blank width="1.65in" style={{ height: "1.15em", flexShrink: 0 }} />}
              <p style={{ paddingLeft: answerSheet ? 0 : "0.06in" }}>
                {n}. <MathText text={q.prompt} />
                {q.type === "numeric" && q.unit && ` (in ${q.unit})`}
              </p>
            </div>
          ),
        },
      ];
    case "fill_in_the_blank":
      return [
        {
          space: 5,
          node: (
            <p>
              {n}.{" "}
              {promptParts(q.prompt).map((p, i) =>
                "text" in p ? <MathText key={i} text={p.text} /> : <Blank key={i} width="1.3in" />,
              )}
            </p>
          ),
        },
      ];
    case "enumeration":
      return [
        {
          space: 5,
          node: (
            <>
              <p style={bold}>
                {n}. <MathText text={q.prompt} />
              </p>
              {!answerSheet &&
                q.items.map((_, i) => (
                  <p key={i} style={{ ...indent, paddingTop: "4pt" }}>
                    {String.fromCharCode(97 + i)}. <Blank width="3in" />
                  </p>
                ))}
            </>
          ),
        },
      ];
    case "essay":
      return [
        {
          space: 5,
          node: (
            <>
              <p style={bold}>
                {n}. <MathText text={q.prompt} /> ({plural(q.points, "pt")})
              </p>
              {!answerSheet &&
                Array.from({ length: 6 }, (_, i) => (
                  <div key={i} style={{ height: "0.3in", borderBottom: "1px solid #000" }} />
                ))}
            </>
          ),
        },
      ];
  }
}

function InfoTable({ a, classes }: { a: Assessment; classes: Class[] }) {
  const course = classes[0];
  const cell: CSSProperties = { border: gray, padding: "0 0.05in", verticalAlign: "bottom", fontSize: "9.5pt" };
  const strong: CSSProperties = {
    ...cell,
    fontFamily: fonts.narrow,
    fontWeight: 700,
    fontSize: "10.5pt",
    textTransform: "uppercase",
    lineHeight: 1.05,
  };
  const writeOn: CSSProperties = { ...cell, borderBottom: "2px solid #000" };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <colgroup>
        {["1.16in", "2.15in", "0.48in", "0.99in", "auto"].map((w, i) => (
          <col key={i} style={{ width: w }} />
        ))}
      </colgroup>
      <tbody>
        <tr style={{ height: "0.38in" }}>
          <td style={cell}>Name:</td>
          <td style={cell} />
          <td style={cell}>Score</td>
          <td style={cell} />
          <td style={strong}>{course ? `${course.courseCode}: ${course.title}` : ""}</td>
        </tr>
        <tr style={{ height: "0.19in" }}>
          <td style={cell}>Course &amp; Year:</td>
          <td style={writeOn} />
          <td style={cell}>Total</td>
          <td style={{ ...writeOn, textAlign: "center" }}>{maxScore(a.questions)}</td>
          <td style={strong}>{a.paper.instructor}</td>
        </tr>
      </tbody>
    </table>
  );
}

function Rule() {
  return <div style={{ borderTop: "2.25px solid #000" }} />;
}

export type PaperDoc = "paper" | "sheet";

export function buildBlocks(a: Assessment, classes: Class[], dates: string, doc: PaperDoc = "paper"): Block[] {
  const blocks: Block[] = [
    { inset: wide, node: <PaperHeader header={a.header} kind={a.kind} dates={dates} /> },
    { inset: { left: body.left, right: wide.right }, space: 27, node: <InfoTable a={a} classes={classes} /> },
    { space: 7, node: <Rule /> },
  ];

  const instructions = a.paper.generalInstructions.map((x) => x.trim()).filter(Boolean);
  if (instructions.length) {
    blocks.push({
      space: 14,
      keepWithNext: true,
      node: <p style={{ fontFamily: fonts.narrow, fontWeight: 700, fontSize: "12pt" }}>General Instructions:</p>,
    });
    for (const line of instructions) {
      const [first, ...rest] = line.split(" ");
      blocks.push({
        space: 5,
        node: (
          <p style={{ paddingLeft: "0.33in", fontFamily: fonts.serif, fontSize: "11pt" }}>
            <span style={{ color: "#44546a", fontFamily: fonts.sans, fontSize: "13pt", marginRight: "0.12in" }}>✔</span>
            <span style={{ color: "#ff0000" }}>{first}</span> {rest.join(" ")}
          </p>
        ),
      });
    }
    blocks.push({ space: 12, node: <Rule /> });
  }

  if (a.questions.length === 0) {
    const message = doc === "sheet" ? "Add questions to see the answer sheet." : "No questions yet.";
    blocks.push({ space: 24, node: <p style={{ textAlign: "center", color: "#7f7f7f" }}>{message}</p> });
    return blocks;
  }
  if (doc === "sheet") return [...blocks, ...answerSheetBlocks(a)];

  groupIntoParts(a.questions).forEach((part, p) => {
    const { title, instructions } = partSettings(a, part.type);
    const total = maxScore(part.questions);
    const each = new Set(part.questions.map((q) => q.points)).size === 1 ? part.questions[0].points : null;
    const summary = [
      plural(part.questions.length, "Item"),
      `${plural(total, "Point")}${each !== null && part.questions.length > 1 ? ` - ${plural(each, "pt")} each` : ""}`,
    ].join(" | ");
    blocks.push({
      space: p === 0 ? 14 : 12,
      keepWithNext: true,
      node: (
        <p style={{ fontWeight: 700 }}>
          PART {roman[p] ?? p + 1}: {title.toUpperCase()} ({summary})
        </p>
      ),
    });
    blocks.push({ keepWithNext: true, node: <p>Instructions: {instructions}</p> });
    part.questions.forEach((q, i) => blocks.push(...questionBlocks(q, i + 1, a.paper.answerSheet)));
  });

  return blocks;
}

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

function answerSheetBlocks(a: Assessment): Block[] {
  const blocks: Block[] = [
    {
      space: 10,
      node: (
        <p style={{ display: "flex", alignItems: "center", gap: "0.08in", fontSize: "10pt" }}>
          Shade one circle completely for each item:
          <span style={{ display: "inline-block", width: "0.16in", height: "0.16in", borderRadius: "50%", background: "#000" }} />
          Use a black or blue pen. Write other answers on the lines.
        </p>
      ),
    },
  ];
  groupIntoParts(a.questions).forEach((part, p) => {
    const { title } = partSettings(a, part.type);
    blocks.push({
      space: 14,
      keepWithNext: true,
      node: (
        <p style={{ fontWeight: 700 }}>
          PART {roman[p] ?? p + 1}: {title.toUpperCase()} ({plural(part.questions.length, "Item")})
        </p>
      ),
    });
    const qs = part.questions;
    const numbered = qs.map((q, i) => ({ q, n: i + 1 }));
    const line = (width: string) => <Blank width={width} style={{ height: "1em" }} />;
    switch (part.type) {
      case "multiple_choice":
      case "true_false": {
        const labels =
          part.type === "true_false"
            ? ["T", "F"]
            : Array.from(
                { length: Math.max(...qs.map((q) => (q.type === "multiple_choice" ? q.choices.length : 0))) },
                (_, i) => String.fromCharCode(65 + i),
              );
        const columns = part.type === "true_false" ? 5 : 3;
        // At most 15 rows per block so a long part can continue on the next page.
        chunk(numbered, columns * 15).forEach((group) =>
          blocks.push({
            space: 6,
            node: <BubbleGrid start={group[0].n} count={group.length} labels={labels} columns={columns} />,
          }),
        );
        break;
      }
      case "identification":
      case "numeric":
        // Small chunks (two columns of five) so a part can start at the bottom of a page.
        chunk(numbered, 10).forEach((group) =>
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
                {group.map(({ q, n }) => (
                  <p key={q.id} style={{ display: "flex", alignItems: "end", gap: "0.06in" }}>
                    <span style={{ width: "0.3in", textAlign: "right", fontWeight: 700 }}>{n}.</span>
                    {line("2.6in")}
                    {q.type === "numeric" && q.unit && <span>{q.unit}</span>}
                  </p>
                ))}
              </div>
            ),
          }),
        );
        break;
      case "fill_in_the_blank":
        numbered.forEach(({ q, n }) =>
          blocks.push({
            space: 6,
            node: (
              <p style={{ display: "flex", flexWrap: "wrap", alignItems: "end", columnGap: "0.15in", rowGap: "6pt" }}>
                <span style={{ width: "0.3in", textAlign: "right", fontWeight: 700 }}>{n}.</span>
                {promptParts(q.prompt)
                  .filter((x) => "answers" in x)
                  .map((_, i) => (
                    <span key={i} style={{ display: "inline-flex", alignItems: "end", gap: "0.04in" }}>
                      ({String.fromCharCode(97 + i)}) {line("1.8in")}
                    </span>
                  ))}
              </p>
            ),
          }),
        );
        break;
      case "enumeration":
        numbered.forEach(({ q, n }) =>
          blocks.push({
            space: 6,
            node: (
              <div style={{ display: "flex", gap: "0.06in" }}>
                <span style={{ width: "0.3in", textAlign: "right", fontWeight: 700, flexShrink: 0 }}>{n}.</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, max-content)", columnGap: "0.4in", rowGap: "8pt" }}>
                  {q.type === "enumeration" &&
                    q.items.map((_, i) => (
                      <span key={i} style={{ display: "inline-flex", alignItems: "end", gap: "0.04in" }}>
                        {String.fromCharCode(97 + i)}. {line("2.6in")}
                      </span>
                    ))}
                </div>
              </div>
            ),
          }),
        );
        break;
      case "essay":
        numbered.forEach(({ q, n }) =>
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
  });
  return blocks;
}

function BlockView({ block }: { block: Block }) {
  const inset = block.inset ?? body;
  return (
    <div style={{ padding: `${block.space ?? 0}pt ${inset.right}in 0 ${inset.left}in` }}>{block.node}</div>
  );
}

function Footer({ a, page, pages }: { a: Assessment; page: number; pages: number }) {
  const f = a.paper.footer;
  const top: CSSProperties = { border: `1.5px solid ${navy}`, textAlign: "center", color: navy, lineHeight: 1.1 };
  const label: CSSProperties = { ...top, fontSize: "5.5pt", borderBottom: "none" };
  const value: CSSProperties = { ...top, fontSize: "8.5pt", borderTop: "none" };
  const below: CSSProperties = { border: gray, textAlign: "center", color: navy, fontSize: "7.5pt", lineHeight: 1.2 };
  return (
    <div style={{ position: "absolute", left: "0.67in", right: "0.64in", bottom: `${footerBottom}in` }}>
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontFamily: fonts.sans }}>
      <tbody>
        <tr style={{ height: "0.11in" }}>
          {["Document No.", "Effectivity Date", "Revision No.", "Page No"].map((x) => (
            <td key={x} style={label}>
              {x}
            </td>
          ))}
        </tr>
        <tr style={{ height: "0.15in" }}>
          {[f.documentNo, f.effectivityDate, f.revisionNo, `${page} of ${pages}`].map((x, i) => (
            <td key={i} style={value}>
              {x}
            </td>
          ))}
        </tr>
        <tr style={{ height: "0.15in" }}>
          <td colSpan={4} style={{ ...below, fontWeight: 700 }}>
            {f.member}
          </td>
        </tr>
        <tr style={{ height: "0.15in" }}>
          <td colSpan={4} style={{ ...below, fontStyle: "italic" }}>
            {f.motto}
          </td>
        </tr>
      </tbody>
    </table>
    </div>
  );
}

const pageText: CSSProperties = {
  fontFamily: fonts.sans,
  fontSize: "11pt",
  lineHeight: 1.18,
  color: "#000",
  printColorAdjust: "exact",
  WebkitPrintColorAdjust: "exact",
};

// Measures every block offscreen at real size and packs them into pages.
export function usePaperPages(blocks: Block[], size: PaperSize) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][]>([]);
  const { width, height } = pageSizes[size];

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const measure = () => {
      const heights = [...el.children].map((c) => c.getBoundingClientRect().height);
      const limit = (height - footerSpace) * PX;
      const result: number[][] = [[]];
      let y = firstPageTop * PX;
      heights.forEach((h, i) => {
        // A heading moves to the next page together with the block it introduces.
        let need = h;
        for (let j = i; blocks[j]?.keepWithNext && j + 1 < heights.length; j++) need += heights[j + 1];
        if (result.at(-1)!.length > 0 && y + need > limit) {
          result.push([]);
          y = otherPageTop * PX;
        }
        result.at(-1)!.push(i);
        y += h;
      });
      setPages((prev) => (JSON.stringify(prev) === JSON.stringify(result) ? prev : result));
    };
    measure();
    // Fallback fonts change line breaks, so measure again once the real ones are ready.
    let live = true;
    document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
    };
  }, [blocks, height]);

  const measurer = (
    <div
      ref={measureRef}
      aria-hidden
      style={{
        ...pageText,
        position: "fixed",
        left: -10000,
        top: 0,
        width: `${width}in`,
        visibility: "hidden",
        pointerEvents: "none",
      }}
    >
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );

  return { pages, measurer };
}

// A 4-digit code that tells answer sheets of different exams apart.
export function sheetCode(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 9000;
  return 1000 + h;
}

// The sheet code as 14 black-or-white blocks between two solid end blocks, read top to bottom.
function CodeStrip({ code }: { code: number }) {
  const bits = code.toString(2).padStart(14, "0").split("");
  const block = (on: boolean, key: string | number) => (
    <div key={key} style={{ width: "0.16in", height: "0.1in", background: on ? "#000" : "transparent" }} />
  );
  return (
    <div
      style={{
        position: "absolute",
        left: "0.33in",
        bottom: "1.35in",
        display: "flex",
        flexDirection: "column",
        gap: "0.03in",
      }}
    >
      {block(true, "start")}
      {bits.map((b, i) => block(b === "1", i))}
      {block(true, "end")}
    </div>
  );
}

// Solid squares near the corners, for lining the sheet up when it is checked or scanned.
function AlignmentMarks({ title, code }: { title: string; code: number }) {
  const mark: CSSProperties = { position: "absolute", width: "0.22in", height: "0.22in", background: "#000" };
  return (
    <>
      <div style={{ ...mark, top: "0.1in", left: "0.3in" }} />
      <div style={{ ...mark, top: "0.1in", right: "0.3in" }} />
      <div style={{ ...mark, bottom: "0.85in", left: "0.3in" }} />
      <div style={{ ...mark, bottom: "0.85in", right: "0.3in" }} />
      <p
        style={{
          position: "absolute",
          left: "0.3in",
          top: "50%",
          transform: "translateY(-50%) rotate(180deg)",
          writingMode: "vertical-rl",
          fontFamily: fonts.sans,
          fontWeight: 700,
          fontSize: "15pt",
          letterSpacing: "0.12em",
        }}
      >
        EXAMORA
      </p>
      <CodeStrip code={code} />
      <p
        style={{
          position: "absolute",
          right: "0.24in",
          top: "50%",
          transform: "translateY(-50%) rotate(180deg)",
          writingMode: "vertical-rl",
          fontSize: "11pt",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </p>
    </>
  );
}

export function PaperPages({
  assessment: a,
  blocks,
  pages,
  doc = "paper",
  gap = "0",
}: {
  assessment: Assessment;
  blocks: Block[];
  pages: number[][];
  doc?: PaperDoc;
  gap?: string;
}) {
  const code = sheetCode(a.id);
  const sheetTitle = [paperTitle(a.kind, a.header.period), "Answer Sheet", a.header.academicYear, `(${code})`]
    .filter(Boolean)
    .join(" ");
  const { width, height } = pageSizes[a.paper.size];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {pages.map((indices, p) => (
        <div
          key={p}
          className="paper-page"
          style={{
            ...pageText,
            position: "relative",
            width: `${width}in`,
            height: `${height}in`,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "0.04in",
              right: "0.9in",
              width: "1.18in",
              height: "0.23in",
              border: "1px solid #a6a6a6",
            }}
          />
          <div style={{ position: "absolute", top: `${p === 0 ? firstPageTop : otherPageTop}in`, left: 0, right: 0 }}>
            {indices.map((i) => (
              <BlockView key={i} block={blocks[i]} />
            ))}
          </div>
          {doc === "sheet" && <AlignmentMarks title={sheetTitle} code={code} />}
          <Footer a={a} page={p + 1} pages={pages.length} />
        </div>
      ))}
    </div>
  );
}

export function useTestPaper(a: Assessment, classes: Class[], dates: string, doc: PaperDoc = "paper") {
  const blocks = useMemo(() => buildBlocks(a, classes, dates, doc), [a, classes, dates, doc]);
  const { pages, measurer } = usePaperPages(blocks, a.paper.size);
  return { blocks, pages, measurer };
}
