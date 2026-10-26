import type { StudentQuestion } from "@examinus/domain/question";
import type { AnswerValue } from "@examinus/domain/quiz";
import { maxEdits } from "./typing-analysis.ts";
import type { Typing } from "./types.ts";

// The edits a code editor reports, for the teacher's typing replay.
export type EditHandler = (edits: { from: number; to: number; insert: string }[]) => void;

// Typed answers keep a typing history for the teacher's replay (code and SQL have their own editor hook).
export const typedTypes = new Set<StudentQuestion["type"]>(["essay", "blank", "enumeration"]);
const typedText = (v: AnswerValue | undefined) => (typeof v === "string" ? v : Array.isArray(v) ? v.join("\n") : "");

// Records what changed in a typed answer as one edit: the replaced range of the old text and what went in.
export function logTyped(typing: Typing, questionId: string, startedAt: string, before: AnswerValue | undefined, after: AnswerValue) {
  const a = typedText(before);
  const b = typedText(after);
  let from = 0;
  while (from < a.length && from < b.length && a[from] === b[from]) from++;
  let tail = 0;
  while (tail < a.length - from && tail < b.length - from && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  if (a.length === b.length && from === a.length) return;
  const log = (typing[questionId] ??= []);
  if (log.length < maxEdits) log.push([Math.max(0, Date.now() - Date.parse(startedAt)), from, a.length - tail, b.slice(from, b.length - tail)]);
}

// Records the edits a code editor reports.
export function logEdits(typing: Typing, questionId: string, startedAt: string, edits: Parameters<EditHandler>[0]) {
  const t = Math.max(0, Date.now() - Date.parse(startedAt));
  const log = (typing[questionId] ??= []);
  for (const e of edits) if (log.length < maxEdits) log.push([t, e.from, e.to, e.insert]);
}
