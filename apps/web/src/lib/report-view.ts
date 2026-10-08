// Shared by the printable integrity report and its Excel export: the same rows in both.
import type { Incident, IntegrityEventType, Question } from "@examora/contract";
import type { AttemptReport } from "./data/reports";
import { answerText } from "./answers";
import { incidentText } from "./incidents";
import { formatDuration, integrityEventLabel } from "./integrity";

const stamp = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Manila",
});
export const formatStamp = (iso: string) => stamp.format(new Date(iso));

export const eventTypeName = (type: IntegrityEventType) => type.replaceAll("_", " ");

// The actions the teacher took on this attempt, plus the ones that touched the whole session (pauses).
export const attemptIncidents = (r: AttemptReport, name: string): { incident: Incident; text: string }[] =>
  r.record.incidents
    .filter((i) => i.attemptId === r.record.detail.attempt.id || i.attemptId === null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((incident) => ({ incident, text: incidentText(incident, incident.attemptId ? name : null) }));

export type TimelineRow = { at: string; source: "Student" | "Teacher"; what: string };

// Anti-cheat events and the teacher's actions in one list, oldest first.
export function reportTimeline(r: AttemptReport, name: string): TimelineRow[] {
  const events = r.report.timeline.map((e): TimelineRow => ({
    at: e.at,
    source: "Student",
    what: `${integrityEventLabel[e.type]}${e.durationMs ? ` (${formatDuration(e.durationMs)})` : ""}`,
  }));
  const actions = attemptIncidents(r, name).map(({ incident, text }): TimelineRow => ({ at: incident.at, source: "Teacher", what: text }));
  return [...events, ...actions].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

const questionById = (r: AttemptReport) => new Map(r.questions.map((q, i) => [q.id, { q, number: i + 1 }]));

// Every saved version of every answer, oldest first, with the question's number in the quiz.
export function answerHistoryRows(r: AttemptReport) {
  const byId = questionById(r);
  return [...r.record.history]
    .sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt))
    .map((h) => {
      const found = byId.get(h.questionId);
      return { at: h.savedAt, number: found?.number ?? 0, question: found?.q, answer: found ? answerText(found.q, h.value) : "" };
    });
}

export function gradeChangeRows(r: AttemptReport) {
  const byId = questionById(r);
  return [...r.record.gradeChanges]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((c) => ({ ...c, number: byId.get(c.questionId)?.number ?? 0 }));
}

// A short label for a question: its prompt on one line.
export function shortPrompt(q: Pick<Question, "prompt">, max = 40): string {
  const text = q.prompt.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
