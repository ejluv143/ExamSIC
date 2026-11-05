// What the table view's cells hold, and how typed or pasted text becomes a change to a question.
import { parseNumber } from "@examinus/domain/numbers";
import { answerEditableInTable, withPoints } from "@/features/quiz/quiz-editor";
import { type GamePoints } from "@examinus/domain/kinds/base";
import { type Question } from "@examinus/domain/question";
import { kindOf } from "@examinus/domain/kinds";
import { no, yes, type Parsed } from "@examinus/domain/kinds/editor";

// The cells a teacher can move between, left to right. (Number and type are shown but not selectable.) Each part
// has its own table, so the part is not a column.
export const dataCols = ["prompt", "answer", "points", "partial", "game", "topic"] as const;
export type Col = (typeof dataCols)[number];

export const colLabel: Record<Col, string> = {
  prompt: "Prompt",
  answer: "Answer",
  points: "Points",
  partial: "Partial credit",
  game: "Game points",
  topic: "Topic",
};

// Cells that edit with a dropdown; the rest take typed text.
export const selectCols: readonly Col[] = ["partial", "game"];

export const gameLabel: Record<GamePoints, string> = { standard: "Standard (1000)", double: "Double (2000)", none: "None" };

// Whether the cell can be changed in the table. Points of a pool's questions follow the pool; most answers
// are too big for a cell and open in the full editor.
export function cellEditable(q: Question, col: Col, pool: boolean): boolean {
  if (col === "points") return !pool;
  if (col === "answer") return answerEditableInTable(q);
  return true;
}

// The text a cell starts with when it is edited (also what copies out of it).
export function cellText(q: Question, col: Col): string {
  switch (col) {
    case "prompt":
      return q.prompt;
    case "points":
      return String(q.points);
    case "partial":
      return q.partialCredit ? "yes" : "no";
    case "game":
      return q.gamePoints;
    case "topic":
      return q.topic ?? "";
    case "answer":
      return kindOf(q).editor.answerCell?.text(q) ?? "";
  }
}


// What `text` does to the question when it is typed or pasted into the cell of `col`.
export function parseCell(q: Question, col: Col, text: string): Parsed<Question> {
  const t = text.trim();
  switch (col) {
    case "prompt":
      return { question: { ...q, prompt: text } };

    case "topic": {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { topic: _previous, ...without } = q;
      return { question: (t === "" ? without : { ...without, topic: t }) as Question };
    }

    case "points": {
      const n = parseNumber(t);
      if (n === null || n <= 0 || !Number.isInteger(n * 2)) return { error: `“${t}” is not valid points. Use a whole or half number above 0.` };
      return { question: withPoints(q, n) };
    }

    case "partial":
      if (yes.test(t)) return { question: { ...q, partialCredit: true } };
      if (no.test(t)) return { question: { ...q, partialCredit: false } };
      return { error: `“${t}” is not Yes or No.` };

    case "game": {
      const s = t.toLowerCase();
      if (/^(standard|std|normal|1000)$/.test(s)) return { question: { ...q, gamePoints: "standard" } };
      if (/^(double|2x|2000)$/.test(s)) return { question: { ...q, gamePoints: "double" } };
      if (/^(none|no|no points|0)$/.test(s)) return { question: { ...q, gamePoints: "none" } };
      return { error: `“${t}” is not a game points setting. Use Standard, Double or None.` };
    }

    case "answer":
      return kindOf(q).editor.answerCell?.parse(q, t) ?? { error: "Use Edit to change this answer." };
  }
}
