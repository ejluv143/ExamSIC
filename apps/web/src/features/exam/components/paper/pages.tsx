"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { paperTitle } from "@/lib/format";
import type { PaperSize } from "@examinus/domain/quiz";
import { paperKind, type EditorQuiz } from "@/features/quiz/quiz-editor";
import {
  PX,
  body,
  firstPageTop,
  fonts,
  footerBottom,
  footerSpace,
  navy,
  otherPageTop,
  pageSizes,
  type Block,
  type PaperDoc,
} from "./layout";
import { gray } from "@/components/question-kinds/shared/print-parts";
import { AlignmentMarks, sheetCode } from "./sheet-marks";

function BlockView({ block }: { block: Block }) {
  const inset = block.inset ?? body;
  return (
    <div style={{ padding: `${block.space ?? 0}pt ${inset.right}in 0 ${inset.left}in` }}>{block.node}</div>
  );
}

function Footer({ a, page, pages }: { a: EditorQuiz; page: number; pages: number }) {
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
    // Pictures arrive after the first measure and change the height of their blocks (load doesn't bubble, so
    // listen while it travels down).
    el.addEventListener("load", measure, true);
    // Fallback fonts change line breaks, so measure again once the real ones are ready.
    let live = true;
    document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
      el.removeEventListener("load", measure, true);
    };
  }, [blocks, height]);

  const measurer = (
    <div
      ref={measureRef}
      className="paper-text"
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

export function PaperPages({
  assessment: a,
  blocks,
  pages,
  doc = "paper",
  gap = "0",
}: {
  assessment: EditorQuiz;
  blocks: Block[];
  pages: number[][];
  doc?: PaperDoc;
  gap?: string;
}) {
  const code = sheetCode(a.id);
  const sheetTitle = [paperTitle(paperKind(a.header), a.header.period), "Answer Sheet", a.header.academicYear, `(${code})`]
    .filter(Boolean)
    .join(" ");
  const { width, height } = pageSizes[a.paper.size];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {pages.map((indices, p) => (
        <div
          key={p}
          className="paper-page paper-text"
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
