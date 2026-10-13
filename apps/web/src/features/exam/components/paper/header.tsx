import type { CSSProperties } from "react";
import { quizPaperTotals, paperKind, type EditorQuiz } from "@/features/quiz/quiz-editor";
import type { Class } from "@/features/classes/types";
import { PaperHeader } from "../paper-header";
import { body, fonts, wide, type Block } from "./layout";
import { gray } from "@/components/question-kinds/shared/print-parts";

function InfoTable({ a, classes }: { a: EditorQuiz; classes: Class[] }) {
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
          <td style={{ ...writeOn, textAlign: "center" }}>{quizPaperTotals(a).totalPoints}</td>
          <td style={strong}>{a.paper.instructor}</td>
        </tr>
      </tbody>
    </table>
  );
}

function Rule() {
  return <div style={{ borderTop: "2.25px solid #000" }} />;
}

// What opens both documents: the letterhead, the info table and the general instructions.
export function headerBlocks(a: EditorQuiz, classes: Class[], dates: string): Block[] {
  const blocks: Block[] = [
    { inset: wide, node: <PaperHeader header={a.header} kind={paperKind(a.header)} dates={dates} /> },
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
  return blocks;
}
