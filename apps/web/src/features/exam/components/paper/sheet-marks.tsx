import type { CSSProperties } from "react";
import { fonts } from "./layout";

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
export function AlignmentMarks({ title, code }: { title: string; code: number }) {
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
        EXAMINUS
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
