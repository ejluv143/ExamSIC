import { Schema } from "effect";
import { splitAlternatives } from "../blanks.ts";
import type { AnswerValue } from "../quiz.ts";
import {
  asList,
  cleanList,
  matches,
  oneLine,
  plainAnswerText,
  studentBase,
  studentCommon,
  teacherBase,
  weightedFraction,
  weights,
  type PartResult,
  type QuestionKind,
} from "./base.ts";

const type = Schema.Literal("enumeration");

// Students list items.length answers. Each item may hold alternatives as "1NF|First Normal Form".
const fields = {
  items: Schema.Array(Schema.String),
  orderMatters: Schema.Boolean,
  caseSensitive: Schema.Boolean,
  ...weights,
};

export const EnumerationBody = Schema.Struct({ type, ...fields });
export const EnumerationQuestion = Schema.Struct({ ...teacherBase, type, ...fields });
export type EnumerationQuestion = typeof EnumerationQuestion.Type;
export const StudentEnumerationQuestion = Schema.Struct({
  ...studentBase,
  type,
  // How many answer boxes to show.
  itemCount: Schema.Int,
  orderMatters: Schema.Boolean,
});
export type StudentEnumerationQuestion = typeof StudentEnumerationQuestion.Type;

const first = (alternatives: string) => alternatives.split("|")[0]!.trim();

function partResults(q: EnumerationQuestion, answer: AnswerValue): PartResult[] {
  const given = asList(answer);
  const items = q.items.map(splitAlternatives);
  if (q.orderMatters) {
    return items.map((accepted, i) => ({
      given: given[i] ?? "",
      correct: matches(given[i] ?? "", accepted, q.caseSensitive),
    }));
  }
  // Each item can be credited once, so repeating an answer doesn't score twice.
  const unused = [...items];
  return items.map((_, i) => {
    const g = given[i] ?? "";
    const hit = unused.findIndex((accepted) => matches(g, accepted, q.caseSensitive));
    if (hit !== -1) unused.splice(hit, 1);
    return { given: g, correct: hit !== -1 };
  });
}

export const enumeration: QuestionKind<"enumeration"> = {
  type: "enumeration",
  toStudent: (q) => ({ ...studentCommon(q), type: q.type, itemCount: q.items.length, orderMatters: q.orderMatters }),
  cleanAnswer: (_q, v) => cleanList(v),
  autoScore: (q, answer) =>
    weightedFraction(
      partResults(q, answer).map((p) => p.correct),
      q.weights,
      q.partialCredit,
    ),
  units: (q) => q.items.length,
  partResults,
  reviewable: true,
  answerKey: (q) => q.items.map((x) => splitAlternatives(x).join(" / ")).join("; ") + (q.orderMatters ? " (in order)" : ""),
  answerText: (_q, value) => plainAnswerText(value),
  summary: (_q, v) => oneLine((Array.isArray(v) ? v : [String(v)]).map((x) => x.trim() || "—").join(" · ")),
  typing: true,
  gameAnswer: (q) => q.items.map(first).join(", "),
  draft: {
    shape: '{"type":"enumeration","prompt":"asks the student to list items","items":["item 1","item 2", ...],"orderMatters":false}',
    decode: (raw, { base }) => {
      const items = (raw.items ?? []).map((i) => i.trim()).filter(Boolean);
      if (items.length < 2) return null;
      return { ...base, type: "enumeration", items, orderMatters: raw.orderMatters ?? false, caseSensitive: false };
    },
  },
};
