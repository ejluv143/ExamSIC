import type { LiveStudent } from "@examinus/contract/live";
import { Badge } from "@/components/ui";

// A student with no check-in for this long while taking the exam is shown as offline.
export const offlineAfterMs = 30_000;

export type RowStatus =
  | "not_started"
  | "in_lobby"
  | "arrived"
  | "in_progress"
  | "offline"
  | "waiting"
  | "submitted"
  | "needs_grading"
  | "graded";

// A student with no attempt yet: not here, in the lobby, or arrived (opened the session, hasn't started).
export const hasNoAttempt = (status: RowStatus) => status === "not_started" || status === "in_lobby" || status === "arrived";

// `waiting`: an exam student whose attempt is held until the teacher approves their device.
// `lobby`: the session hasn't started, so a student who has opened it is in the lobby.
export function rowStatus(s: LiveStudent, now: number, waiting = false, lobby = false): RowStatus {
  if (s.status === null) return s.joinedAt === null ? "not_started" : lobby ? "in_lobby" : "arrived";
  if (s.status === "needs_grading") return "needs_grading";
  if (s.status === "graded") return "graded";
  if (s.submittedAt) return "submitted";
  if (waiting) return "waiting";
  return s.lastSeenAt !== null && now - Date.parse(s.lastSeenAt) > offlineAfterMs ? "offline" : "in_progress";
}

export const isTaking = (status: RowStatus) => status === "in_progress" || status === "offline" || status === "waiting";

const statusStyle: Record<RowStatus, { label: string; tone: "neutral" | "primary" | "success" | "warning" | "danger" | "info" }> = {
  not_started: { label: "Not started", tone: "neutral" },
  in_lobby: { label: "In lobby", tone: "success" },
  arrived: { label: "Arrived", tone: "info" },
  in_progress: { label: "In progress", tone: "info" },
  offline: { label: "Offline", tone: "danger" },
  waiting: { label: "Waiting for approval", tone: "danger" },
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
  joinedAt: null,
  attemptId: null,
  status: null,
  startedAt: null,
  submittedAt: null,
  lastSeenAt: null,
  answered: 0,
  questionCount,
  marked: 0,
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
  accommodations: null,
});

const timeOnly = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Manila" });
export const formatClock = (iso: string) => timeOnly.format(new Date(iso));
