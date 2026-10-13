import { Schema } from "effect";
import { parseNumber } from "../numbers.ts";
import { cleanText, plainAnswerText, studentBase, studentCommon, teacherBase, type QuestionKind } from "./base.ts";

const type = Schema.Literal("numeric");

// Students type a number (decimals, fractions like 3/4, mixed numbers like 1 1/2).
const fields = {
  answer: Schema.Number,
  // How far off still counts as correct, e.g. 0.01. 0 means exact.
  tolerance: Schema.Number,
  // Shown after the answer box, e.g. "cm". May be empty.
  unit: Schema.String,
};

export const NumericBody = Schema.Struct({ type, ...fields });
export const NumericQuestion = Schema.Struct({ ...teacherBase, type, ...fields });
export type NumericQuestion = typeof NumericQuestion.Type;
export const StudentNumericQuestion = Schema.Struct({ ...studentBase, type, unit: Schema.String });
export type StudentNumericQuestion = typeof StudentNumericQuestion.Type;

export const numeric: QuestionKind<"numeric"> = {
  type: "numeric",
  toStudent: (q) => ({ ...studentCommon(q), type: q.type, unit: q.unit }),
  cleanAnswer: (_q, v) => cleanText(v),
  autoScore: (q, answer) => {
    const given = typeof answer === "string" ? parseNumber(answer) : null;
    // A little slack so 0.1 + 0.2 style rounding never costs a point.
    return given !== null && Math.abs(given - q.answer) <= q.tolerance + 1e-9 ? 1 : 0;
  },
  reviewable: false,
  answerKey: (q) => `${q.answer}${q.tolerance ? ` ± ${q.tolerance}` : ""}${q.unit ? ` ${q.unit}` : ""}`,
  answerText: (_q, value) => plainAnswerText(value),
  typing: false,
  gameAnswer: (q) => `${q.answer}${q.unit ? ` ${q.unit}` : ""}`,
  draft: {
    shape: '{"type":"numeric","prompt":"...","answer":42,"tolerance":0,"unit":""}',
    decode: (raw, { base }) => {
      const answer = typeof raw.answer === "number" ? raw.answer : typeof raw.answer === "string" ? Number(raw.answer) : NaN;
      if (!Number.isFinite(answer) || (typeof raw.answer === "string" && raw.answer.trim() === "")) return null;
      const tolerance = raw.tolerance ?? 0;
      return { ...base, type: "numeric", answer, tolerance: Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0, unit: raw.unit?.trim() ?? "" };
    },
  },
};
