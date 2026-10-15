import { Schema } from "effect";
import {
  cleanText,
  maxCodeLength,
  plainAnswerText,
  studentBase,
  studentCommon,
  teacherBase,
  weightedFraction,
  type QuestionKind,
} from "./base.ts";

// What the answer query returns on the sample data, shown to students as the expected result.
export const SqlSampleResult = Schema.Struct({
  columns: Schema.Array(Schema.String),
  rows: Schema.Array(Schema.Array(Schema.NullOr(Schema.Union([Schema.String, Schema.Number])))),
});
export type SqlSampleResult = typeof SqlSampleResult.Type;

const type = Schema.Literal("sql");

// Students write a SELECT query against tables made by setupSql. It's right when it returns the same rows
// as answerSql. With hiddenDataSql, both run again after it adds rows, so a hard-coded answer fails.
const fields = {
  // CREATE TABLE and INSERT statements. Shown to students.
  setupSql: Schema.String,
  // The teacher's query. Never sent to students.
  answerSql: Schema.String,
  // Extra statements (more INSERTs) for a second, hidden check. Empty: only the sample data is checked.
  hiddenDataSql: Schema.String,
  orderMatters: Schema.Boolean,
  starterCode: Schema.String,
  rubric: Schema.String,
  // Filled in by the server for students.
  sampleResult: Schema.optionalKey(SqlSampleResult),
};

export const SqlBody = Schema.Struct({ type, ...fields });
export const SqlQuestion = Schema.Struct({ ...teacherBase, type, ...fields });
export type SqlQuestion = typeof SqlQuestion.Type;
export const StudentSqlQuestion = Schema.Struct({
  ...studentBase,
  type,
  setupSql: Schema.String,
  orderMatters: Schema.Boolean,
  starterCode: Schema.String,
  sampleResult: Schema.optionalKey(SqlSampleResult),
});
export type StudentSqlQuestion = typeof StudentSqlQuestion.Type;

// What a student may see once the answer is revealed: the question and the reference query, but never the teacher's
// rubric and never the hidden data used for the second, anti-hard-coding check (issue #14).
export const RevealSqlQuestion = Schema.Struct({
  ...teacherBase,
  type,
  setupSql: Schema.String,
  answerSql: Schema.String,
  orderMatters: Schema.Boolean,
  starterCode: Schema.String,
  sampleResult: Schema.optionalKey(SqlSampleResult),
});
export type RevealSqlQuestion = typeof RevealSqlQuestion.Type;

export const sql: QuestionKind<"sql"> = {
  type: "sql",
  toStudent: (q) => ({
    ...studentCommon(q),
    type: q.type,
    setupSql: q.setupSql,
    orderMatters: q.orderMatters,
    starterCode: q.starterCode,
    ...(q.sampleResult === undefined ? {} : { sampleResult: q.sampleResult }),
  }),
  // The reveal keeps the reference query but drops the rubric and the hidden data for the second check.
  toReveal: ({ rubric: _rubric, hiddenDataSql: _hiddenDataSql, ...q }) => q,
  cleanAnswer: (_q, v) => cleanText(v, maxCodeLength),
  // Each SQL check (sample data, and hidden data if any) is worth an equal share.
  autoScore: (q, _answer, results) =>
    results?.length
      ? weightedFraction(
          results.map((r) => r.passed),
          undefined,
          q.partialCredit,
        )
      : null,
  reviewable: true,
  checker: "sql",
  sampleResult: true,
  answerKey: (q) => q.answerSql.trim() || "Returns the expected rows",
  answerText: (_q, value) => plainAnswerText(value),
  // Untouched starter code doesn't count.
  answerGiven: (q, v) => typeof v === "string" && v.trim() !== "" && v.trim() !== q.starterCode.trim(),
  summary: (_q, v) => {
    const lines = String(v).trim().split("\n").length;
    return `${lines} ${lines === 1 ? "line" : "lines"} of SQL`;
  },
  typing: true,
  freeForm: true,
  gameAnswer: (q) => q.answerSql,
};
