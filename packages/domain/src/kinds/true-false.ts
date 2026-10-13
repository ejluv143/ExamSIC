import { Schema } from "effect";
import { studentBase, studentCommon, teacherBase, type QuestionKind } from "./base.ts";

const type = Schema.Literal("true_false");

const fields = { answer: Schema.Boolean };

export const TrueFalseBody = Schema.Struct({ type, ...fields });
export const TrueFalseQuestion = Schema.Struct({ ...teacherBase, type, ...fields });
export type TrueFalseQuestion = typeof TrueFalseQuestion.Type;
export const StudentTrueFalseQuestion = Schema.Struct({ ...studentBase, type });
export type StudentTrueFalseQuestion = typeof StudentTrueFalseQuestion.Type;

export const trueFalse: QuestionKind<"true_false"> = {
  type: "true_false",
  toStudent: (q) => ({ ...studentCommon(q), type: q.type }),
  cleanAnswer: (_q, v) => (typeof v === "boolean" ? v : null),
  autoScore: (q, answer) => (answer === q.answer ? 1 : 0),
  reviewable: false,
  answerKey: (q) => (q.answer ? "True" : "False"),
  answerText: (_q, value) => (typeof value === "boolean" ? (value ? "True" : "False") : ""),
  summary: (_q, v) => (v === true ? "True" : "False"),
  typing: false,
  optionKey: (q) => String(q.answer),
  gameTally: (_q, value) => (typeof value === "boolean" ? [value ? "true" : "false"] : []),
  gameBuckets: (q, count) => [
    { label: "True", count: count("true"), correct: q.answer },
    { label: "False", count: count("false"), correct: !q.answer },
  ],
  gameAnswer: (q) => (q.answer ? "True" : "False"),
  draft: {
    shape: '{"type":"true_false","prompt":"a statement","answer":true}',
    decode: (raw, { base }) => {
      if (typeof raw.answer === "boolean") return { ...base, type: "true_false", answer: raw.answer };
      if (typeof raw.answer === "string" && /^(true|false)$/i.test(raw.answer.trim()))
        return { ...base, type: "true_false", answer: raw.answer.trim().toLowerCase() === "true" };
      return null;
    },
  },
};
