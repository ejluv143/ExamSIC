// SQL questions: checking a student's query and comparing its rows with the teacher's answer.
// Shared by the server (grading) and the browser (the Run button).

export type SqlValue = string | number | null | Uint8Array;
export type SqlResult = { columns: string[]; rows: SqlValue[][] };

// Results bigger than this are cut off for display; grading compares only this many rows.
export const maxRows = 200;

// One SELECT (or WITH … SELECT). Comments and a trailing semicolon are fine; a second statement isn't.
export function checkQuery(sql: string): string | null {
  const body = sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim()
    .replace(/;+\s*$/, "")
    .trim();
  if (!body) return "Write a query first.";
  if (!/^(select|with)\b/i.test(body)) return "Write a SELECT query (it can start with WITH).";
  // A semicolon outside quotes means a second statement.
  if (/;/.test(body.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"/g, ""))) return "Write one query only.";
  return null;
}

const cell = (v: SqlValue) =>
  v === null ? "NULL" : v instanceof Uint8Array ? "(blob)" : typeof v === "number" ? String(Number(v.toFixed(6))) : v;

// A plain-text table for logs and the teacher's review.
export function formatTable(r: SqlResult): string {
  if (r.columns.length === 0) return "(no result)";
  const lines = [r.columns.join(" | "), ...r.rows.map((row) => row.map(cell).join(" | "))];
  if (r.rows.length === 0) lines.push("(no rows)");
  return lines.join("\n");
}

// Same rows with the same values; column names don't matter (aliases differ). Floats match to 6 decimals.
export function sameResult(actual: SqlResult, expected: SqlResult, orderMatters: boolean): boolean {
  if (actual.columns.length !== expected.columns.length || actual.rows.length !== expected.rows.length) return false;
  const key = (row: SqlValue[]) => JSON.stringify(row.map(cell));
  const a = actual.rows.map(key);
  const e = expected.rows.map(key);
  if (!orderMatters) {
    a.sort();
    e.sort();
  }
  return a.every((x, i) => x === e[i]);
}
