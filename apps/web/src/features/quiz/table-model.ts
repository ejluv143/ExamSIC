// What the table view's cells hold, and how typed or pasted text becomes a change to a question.
import { parseNumber } from "@/lib/math";
import { answerEditableInTable, moveQuestion, withPoints, withPoolPoints, type EditorPart } from "@/features/quiz/quiz-editor";
import { type GamePoints } from "@examinus/domain/kinds/base";
import { type Question } from "@examinus/domain/question";
import { modelOf, type Parsed } from "@/components/question-kinds/views/editor-model";
import { no, yes } from "@/components/question-kinds/shared/editor-model";

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
      return modelOf(q).answerCell?.text(q) ?? "";
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
      return modelOf(q).answerCell?.parse(q, t) ?? { error: "Use Edit to change this answer." };
  }
}

// The parts with `text` put in the cell: an error message, or the new parts.
export function applyCell(
  parts: EditorPart[],
  questionId: string,
  col: Col,
  text: string,
): { parts: EditorPart[] } | { error: string } {
  const owner = parts.find((p) => p.questions.some((q) => q.id === questionId));
  const q = owner?.questions.find((x) => x.id === questionId);
  if (!owner || !q) return { error: "That question is gone." };
  const result = parseCell(q, col, text);
  return "error" in result ? result : { parts: replaceQuestion(parts, result.question) };
}

// The parts with a question swapped for its edited version. In a pool, every question follows its new points.
export function replaceQuestion(parts: EditorPart[], next: Question): EditorPart[] {
  return parts.map((p) =>
    p.questions.some((x) => x.id === next.id)
      ? withPoolPoints({ ...p, questions: p.questions.map((x) => (x.id === next.id ? next : x)) }, next.points)
      : p,
  );
}

// One step up or down the table: within the part, and past its edge into the neighbouring part.
export function stepQuestion(parts: EditorPart[], questionId: string, delta: -1 | 1): EditorPart[] {
  const pi = parts.findIndex((p) => p.questions.some((q) => q.id === questionId));
  if (pi < 0) return parts;
  const qi = parts[pi]!.questions.findIndex((q) => q.id === questionId);
  const part = parts[pi]!;
  if (delta === -1) {
    if (qi > 0) return moveQuestion(parts, questionId, part.id, qi - 1);
    const previous = parts[pi - 1];
    return previous ? moveQuestion(parts, questionId, previous.id) : parts;
  }
  if (qi < part.questions.length - 1) return moveQuestion(parts, questionId, part.id, qi + 2);
  const next = parts[pi + 1];
  return next ? moveQuestion(parts, questionId, next.id, 0) : parts;
}
