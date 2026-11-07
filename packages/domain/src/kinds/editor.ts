// What the question editor needs to know about a type besides how to draw it, and the small helpers the types'
// authoring facts (creation, validation, the table's cells, the spreadsheet import) have in common. Each type fills
// these in on its kind (`QuestionKind` in ./base.ts). No React in here, so the pure code around the editor
// (defaults, checks, the table's cells, the spreadsheet import) can use them from anywhere.
import type { Question } from "../question.ts";
import { rubricTotal, type RubricRow } from "./base.ts";

export type Parsed<Q> = { question: Q } | { error: string };

// The Answer column of the table, for the types whose answer fits in a cell. The others open the full editor.
export type AnswerCell<Q> = {
  // Missing: always.
  editable?(q: Q): boolean;
  // What the cell starts with when edited, and what copies out of it.
  text(q: Q): string;
  // What typed or pasted text does to the question.
  parse(q: Q, text: string): Parsed<Q>;
  // The cell is a dropdown of these [value, label] pairs instead of typed text.
  options?: readonly (readonly [string, string])[];
  // The cell holds a number: right-aligned, with a decimal keypad.
  numeric?: true;
};

// One row of an imported spreadsheet, read by the columns of the import template.
export type SheetRow = {
  prompt: string;
  points: number;
  // The Points cell as typed; empty when the row has none.
  rawPoints: string;
  // The fields every question has, filled in from the row.
  base: { id: string; prompt: string; points: number; topic?: string; gamePoints: "standard"; partialCredit: true };
  // The Correct Answer cell, and the Option cells that are filled in.
  answer: string;
  options: string[];
  // The option a number in Correct Answer names ("2" is the Option 2 cell), or null when it isn't a number or names a blank cell.
  optionByNumber(answer: string): string | null;
  // Any other cell of the row, by its column name.
  at(column: string): string;
};

// The spreadsheet import: the type names a row may carry, and how a row becomes a question.
export type Sheet<Q> = {
  aliases: readonly string[];
  // The points of a row without any. Missing: 1.
  defaultPoints?: number;
  parse(row: SheetRow): Q | { error: string };
};

// The heading of the answer section in the question editor.
// `icon` names an icon; each client maps names to its own icon set (web: components/question-kinds/shared/answer-icons.ts).
export type AnswerIcon = "key" | "rubric" | "tests";
export type AnswerHeading = { icon: AnswerIcon; title: string; hint: string };

// How the editor presents a type.
export type Editor<Q> = {
  // The hint in the empty question text.
  promptPlaceholder: string | ((q: Q) => string);
  // The question text marks blanks with {{…}}.
  readonly promptBlanks?: true;
  // The heading above the answer's editor.
  readonly answer: AnswerHeading;
  // What the points are split over, named in the weights list. `labels`: the units have weights the teacher may set.
  readonly unit?: { noun: string; labels?(q: Q): string[] };
  // The Partial credit switch and what it does when on (default: each unit's share). Missing: no switch.
  // `applies` missing: it makes sense once the points are split over more than one unit (see `partialCreditApplies`).
  readonly partialCredit?: { applies?(q: Q): boolean; hint?: string };
  // The answer in a few words: what the table's Answer column shows.
  summary(q: Q): string;
  readonly answerCell?: AnswerCell<Q>;
};

export const newId = () => globalThis.crypto.randomUUID().slice(0, 8);

// The fields every new question starts with.
export const newBase = (id: string | undefined) => ({
  id: id ?? newId(),
  prompt: "",
  points: 1,
  gamePoints: "standard" as const,
  partialCredit: true,
});

// The points a part is worth: whole or half points.
export const validPoints = (n: number) => Number.isFinite(n) && n >= 0 && Number.isInteger(n * 2);

// Weights follow the units (blanks, pairs, items, tests): when the editor adds or removes one, so do they.
export type Weighted = Extract<Question, { type: "blank" | "matching" | "enumeration" | "code" | "categorization" }>;
export const weightsAdd = (q: Weighted) => (q.weights?.length ? { weights: [...q.weights, 1] } : {});
export const weightsRemove = (q: Weighted, i: number) =>
  q.weights?.length ? { weights: q.weights.filter((_, j) => j !== i) } : {};

export const pts = (n: number) => `${n} ${n === 1 ? "pt" : "pts"}`;

// Hides floating-point noise like 50.230000000000004.
export const tidy = (n: number) => Number(n.toPrecision(12));

// A, B, C… for the nth choice.
export const letter = (i: number) => String.fromCharCode(65 + i);

// What typed or pasted text says yes or no with.
export const yes = /^(y|yes|true|t|1|✓|x)$/i;
export const no = /^(n|no|false|f|0)$/i;

// Rescales the rows in proportion so they add up to `target`, in half points.
export function matchRubric(rows: readonly RubricRow[], target: number): RubricRow[] {
  const total = rubricTotal(rows);
  const next = rows.map((r, i) => ({
    ...r,
    points: total > 0 ? Math.round((r.points / total) * target * 2) / 2 : i === 0 ? target : 0,
  }));
  const biggest = next.reduce((best, r, i) => (r.points > next[best]!.points ? i : best), 0);
  const rest = target - rubricTotal(next);
  next[biggest]!.points = Math.max(0, next[biggest]!.points + rest);
  return next;
}

const roundHalf = (n: number) => Math.round(n * 2) / 2;

// The question with new points, its rubric scaled so the rows still add up to them.
export function rescaleRubric<Q extends { points: number; rubric: readonly RubricRow[] }>(q: Q, points: number): Q {
  if (q.rubric.length === 0) return { ...q, points };
  const ratio = points / q.points;
  let before = 0;
  let cumulative = 0;
  const rubric = q.rubric.map((row) => {
    cumulative += row.points;
    const target = roundHalf(cumulative * ratio);
    const scaled = { ...row, points: target - before };
    before = target;
    return scaled;
  });
  const last = rubric.length - 1;
  rubric[last] = { ...rubric[last]!, points: rubric[last]!.points + (points - before) };
  return { ...q, points, rubric };
}

export const keyHeading: AnswerHeading = { icon: "key", title: "Answer key", hint: "The correct answer. Students never see this." };
// Essays and drawings have no answer key: the teacher grades them with a rubric.
export const rubricHeading: AnswerHeading = { icon: "rubric", title: "Rubric", hint: "How you grade it. Students never see this." };
export const testsHeading: AnswerHeading = {
  icon: "tests",
  title: "Answer and tests",
  hint: "How answers are checked. Hidden tests stay hidden.",
};

export const defaultPlaceholder = "Type the question…";

// The answer of an essay or drawing in a few words.
export const rubricSummary = (q: { rubric: readonly RubricRow[] }) =>
  q.rubric.length > 0 ? `Rubric: ${q.rubric.length} rows` : "Graded by the teacher";

// What is wrong with a rubric: no rows is fine (the teacher grades as a whole), but rows must be named and add up.
export function rubricProblem(q: { rubric: readonly RubricRow[]; points: number }): string | null {
  if (q.rubric.length === 0) return null;
  if (q.rubric.some((r) => !r.criterion.trim())) return "has a rubric row with no criterion.";
  return rubricTotal(q.rubric) === q.points ? null : `has a rubric worth ${rubricTotal(q.rubric)} points, not ${q.points}.`;
}
