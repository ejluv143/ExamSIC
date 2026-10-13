// Small helpers the types' editor models and editors have in common. No React in here, so the pure parts of the
// editor (defaults, checks, the table's cells, the spreadsheet import) can use them from anywhere.
import { CircleCheckBig, ClipboardCheck, type LucideIcon } from "lucide-react";
import { rubricTotal, type RubricRow } from "@examinus/domain/kinds/base";
import type { Question } from "@examinus/domain/question";
import { unitCount } from "@examinus/domain/scoring";

export const newId = () => crypto.randomUUID().slice(0, 8);

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

// The heading of the answer section in the question editor.
export type AnswerHeading = { icon: LucideIcon; title: string; hint: string };

export const keyHeading: AnswerHeading = { icon: CircleCheckBig, title: "Answer key", hint: "The correct answer. Students never see this." };
// Essays and drawings have no answer key: the teacher grades them with a rubric.
export const rubricHeading: AnswerHeading = { icon: ClipboardCheck, title: "Rubric", hint: "How you grade it. Students never see this." };
export const testsHeading: AnswerHeading = {
  icon: CircleCheckBig,
  title: "Answer and tests",
  hint: "How answers are checked. Hidden tests stay hidden.",
};

export const defaultPlaceholder = "Type the question…";

// Partial credit means something once the points are split over more than one unit (blank, pair, item, test).
export const splitsPoints = (q: Question) => unitCount(q) > 1;

// The answer of an essay or drawing in a few words.
export const rubricSummary = (q: { rubric: readonly RubricRow[] }) =>
  q.rubric.length > 0 ? `Rubric: ${q.rubric.length} rows` : "Graded by the teacher";

// What is wrong with a rubric: no rows is fine (the teacher grades as a whole), but rows must be named and add up.
export function rubricProblem(q: { rubric: readonly RubricRow[]; points: number }): string | null {
  if (q.rubric.length === 0) return null;
  if (q.rubric.some((r) => !r.criterion.trim())) return "has a rubric row with no criterion.";
  return rubricTotal(q.rubric) === q.points ? null : `has a rubric worth ${rubricTotal(q.rubric)} points, not ${q.points}.`;
}
