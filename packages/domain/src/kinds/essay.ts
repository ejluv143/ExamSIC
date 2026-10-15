import { Schema } from "effect";
import { similarTexts } from "../similarity.ts";
import { cleanText, plainAnswerText, RubricRow, rubricTotal, studentBase, studentCommon, teacherBase, type QuestionKind } from "./base.ts";

const type = Schema.Literal("essay");

// Rows with points that add up to the question's points. May be empty.
const fields = { rubric: Schema.Array(RubricRow) };

export const EssayBody = Schema.Struct({ type, ...fields });
export const EssayQuestion = Schema.Struct({ ...teacherBase, type, ...fields });
export type EssayQuestion = typeof EssayQuestion.Type;
export const StudentEssayQuestion = Schema.Struct({ ...studentBase, type });
export type StudentEssayQuestion = typeof StudentEssayQuestion.Type;

// An essay is graded by hand, so a student reveal carries no answer key; the rubric (the teacher's criteria) is
// dropped (issue #14).
export const RevealEssayQuestion = Schema.Struct({ ...teacherBase, type });
export type RevealEssayQuestion = typeof RevealEssayQuestion.Type;

// An essay's or a drawing's key: its rubric.
export const rubricKey = (rubric: readonly RubricRow[]) =>
  rubric.length > 0 ? `${rubric.map((r) => `${r.criterion} (${r.points})`).join("; ")}; ${rubricTotal(rubric)} pts in all` : "Graded by hand";

const halves = (n: number) => Math.round(n * 2) / 2;

// Rubric rows whose points are in half steps and add up to `total`, each at least half a point. The model's
// points only set the proportions; rows that don't fit (more than 2 per point) are dropped from the end.
export const fitRubric = (
  rows: readonly { criterion: string; points?: number | null | undefined }[],
  total: number,
  newId: () => string,
): RubricRow[] => {
  const named = rows.map((r) => ({ criterion: r.criterion.trim(), points: r.points })).filter((r) => r.criterion !== "");
  const kept = named.slice(0, Math.max(0, Math.min(12, Math.floor(total * 2))));
  if (kept.length === 0) return [];
  const weights = kept.map((r) => (typeof r.points === "number" && Number.isFinite(r.points) && r.points > 0 ? r.points : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const points = weights.map((w) => Math.max(0.5, halves((w / sum) * total)));
  let diff = halves(total - points.reduce((a, b) => a + b, 0));
  // Move the difference onto rows, largest first, a half point at a time.
  const order = points.map((_, i) => i).sort((a, b) => points[b]! - points[a]!);
  for (let guard = 0; diff !== 0 && guard < 1000; guard++) {
    const step = diff > 0 ? 0.5 : -0.5;
    const i = order.find((j) => points[j]! + step >= 0.5);
    if (i === undefined) break;
    points[i] = points[i]! + step;
    diff = halves(diff - step);
    order.sort((a, b) => (step > 0 ? points[a]! - points[b]! : points[b]! - points[a]!));
  }
  return kept.map((r, i) => ({ id: newId(), criterion: r.criterion, points: points[i]! }));
};

export const essay: QuestionKind<"essay"> = {
  type: "essay",
  toStudent: (q) => ({ ...studentCommon(q), type: q.type }),
  // A reveal drops the rubric; `answerKey` falls back to "graded by hand" when it isn't there.
  toReveal: ({ rubric: _rubric, ...q }) => q,
  cleanAnswer: (_q, v) => cleanText(v),
  autoScore: () => null,
  reviewable: true,
  answerKey: (q) => rubricKey(q.rubric ?? []),
  answerText: (_q, value) => plainAnswerText(value),
  typing: true,
  freeForm: true,
  similarity: {
    kind: "essay_text",
    pairs: (_q, texts) => similarTexts(texts, 0.5),
    detail: (score) => `${Math.round(score * 100)}% of their three-word phrases match.`,
  },
  gameProblem: (questions) => (questions.length > 0 ? "A game can't have essay questions: remove them or use another mode." : null),
  gameTally: () => [],
  gameBuckets: () => null,
  draft: {
    shape: '{"type":"essay","prompt":"...","rubric":[{"criterion":"what a good answer shows","points":2}, ...2 to 5 rows]}',
    decode: (raw, { base, points, newId }) => ({ ...base, type: "essay", rubric: fitRubric(raw.rubric ?? [], points, newId) }),
  },
};
