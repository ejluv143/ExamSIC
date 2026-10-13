import { Schema } from "effect";
import { shuffled } from "../random.ts";
import type { AnswerValue } from "../quiz.ts";
import {
  asList,
  cleanList,
  image,
  imageRefs,
  MatchItem,
  shown,
  studentBase,
  studentCommon,
  teacherBase,
  weightedFraction,
  weights,
  type QuestionKind,
} from "./base.ts";

// A left item and the id of the right item it goes with. Several left items may share a right item.
export const MatchLeft = Schema.Struct({ id: Schema.String, text: Schema.String, rightId: Schema.String, ...image });
export type MatchLeft = typeof MatchLeft.Type;

const type = Schema.Literal("matching");

// Students pair each left item with one right item (the right column may hold extra wrong options).
const fields = {
  left: Schema.Array(MatchLeft),
  right: Schema.Array(MatchItem),
  ...weights,
};

export const MatchingBody = Schema.Struct({ type, ...fields });
export const MatchingQuestion = Schema.Struct({ ...teacherBase, type, ...fields });
export type MatchingQuestion = typeof MatchingQuestion.Type;
export const StudentMatchingQuestion = Schema.Struct({
  ...studentBase,
  type,
  left: Schema.Array(MatchItem),
  right: Schema.Array(MatchItem),
});
export type StudentMatchingQuestion = typeof StudentMatchingQuestion.Type;

const partResults = (q: MatchingQuestion, answer: AnswerValue) => {
  const given = asList(answer);
  return q.left.map((l, i) => {
    const id = given[i] ?? "";
    return { given: q.right.find((r) => r.id === id)?.text ?? "", correct: id !== "" && id === l.rightId };
  });
};

export const matching: QuestionKind<"matching"> = {
  type: "matching",
  toStudent: (q) => ({ ...studentCommon(q), type: q.type, left: q.left.map(shown), right: q.right.map(shown) }),
  shuffle: (q, random) => ({ ...q, right: shuffled(q.right, random) }),
  images: (q) => imageRefs([...q.left.map((c, i) => [c.imageId, c.alt, `left item ${i + 1}`] as const), ...q.right.map((c, i) => [c.imageId, c.alt, `right item ${i + 1}`] as const)]),
  cleanAnswer: (_q, v) => cleanList(v),
  autoScore: (q, answer) =>
    weightedFraction(
      partResults(q, answer).map((p) => p.correct),
      q.weights,
      q.partialCredit,
    ),
  units: (q) => q.left.length,
  partResults,
  reviewable: false,
  answerKey: (q) => q.left.map((l) => `${l.text} → ${q.right.find((r) => r.id === l.rightId)?.text ?? "—"}`).join("; "),
  answerText: (q, value) => {
    const ids = Array.isArray(value) ? value : [];
    if (!ids.some((id) => id !== "")) return "";
    return q.left.map((l, i) => `${l.text} → ${q.right.find((r) => r.id === ids[i])?.text ?? "—"}`).join("; ");
  },
  summary: (q, v) => {
    const given = Array.isArray(v) ? v : [];
    const done = q.left.filter((_, i) => (given[i] ?? "") !== "").length;
    return `${done} of ${q.left.length} matched`;
  },
  typing: false,
  gameAnswer: (q) => q.left.map((l) => `${l.text} → ${q.right.find((r) => r.id === l.rightId)?.text ?? ""}`).join("; "),
};
