import type { Incident, LiveStudent } from "@examora/contract";
import { Badge } from "@/components/ui";
import { formatDuration } from "@/lib/integrity";

// A student with no check-in for this long while taking the exam is shown as offline.
export const offlineAfterMs = 30_000;

export type RowStatus = "not_started" | "in_progress" | "offline" | "submitted" | "needs_grading" | "graded";

export function rowStatus(s: LiveStudent, now: number): RowStatus {
  if (s.status === null) return "not_started";
  if (s.status === "needs_grading") return "needs_grading";
  if (s.status === "graded") return "graded";
  if (s.submittedAt) return "submitted";
  return s.lastSeenAt !== null && now - Date.parse(s.lastSeenAt) > offlineAfterMs ? "offline" : "in_progress";
}

export const isTaking = (status: RowStatus) => status === "in_progress" || status === "offline";

const statusStyle: Record<RowStatus, { label: string; tone: "neutral" | "primary" | "success" | "warning" | "danger" | "info" }> = {
  not_started: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  offline: { label: "Offline", tone: "danger" },
  submitted: { label: "Submitted", tone: "primary" },
  needs_grading: { label: "Needs grading", tone: "warning" },
  graded: { label: "Graded", tone: "success" },
};

export function RowStatusBadge({ status }: { status: RowStatus }) {
  const { label, tone } = statusStyle[status];
  return <Badge tone={tone}>{label}</Badge>;
}

// A student who hasn't started has no attempt yet.
export const placeholderStudent = (studentId: string, questionCount: number): LiveStudent => ({
  studentId,
  attemptId: null,
  status: null,
  startedAt: null,
  submittedAt: null,
  lastSeenAt: null,
  answered: 0,
  questionCount,
  questionIndex: 0,
  questionStartedAt: null,
  currentQuestionId: null,
  score: 0,
  max: 0,
  alerts: 0,
  awayMs: 0,
  level: "low",
  locked: false,
  extraSeconds: 0,
});

const minutes = (seconds: number | null) => {
  const m = Math.round((seconds ?? 0) / 60);
  return `${m} ${m === 1 ? "minute" : "minutes"}`;
};

// One line for an action the teacher took. `name` is the student it was aimed at, null for the whole session.
export function incidentText(incident: Incident, name: string | null): string {
  const who = name ?? "everyone";
  switch (incident.kind) {
    case "pause":
      return "Paused the session";
    case "resume":
      return incident.seconds ? `Resumed the session after ${formatDuration(incident.seconds * 1000)}` : "Resumed the session";
    case "add_time":
      return `Added ${minutes(incident.seconds)} for ${who}`;
    case "warn":
      return `Warned ${who}${incident.message ? `: “${incident.message}”` : ""}`;
    case "lock":
      return `Locked ${who}'s screen`;
    case "unlock":
      return `Unlocked ${who}'s screen`;
    case "force_submit":
      return `Submitted ${who}'s attempt`;
    case "allow_back_in":
      return `Let ${who} back in`;
  }
}

const timeOnly = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Manila" });
export const formatClock = (iso: string) => timeOnly.format(new Date(iso));
