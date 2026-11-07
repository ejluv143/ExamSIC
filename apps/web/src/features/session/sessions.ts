// Small helpers for showing quizzes and their sessions.
import type { Session } from "@examinus/domain/quiz";
import type { QuizStatus } from "@examinus/copy/status";

// What a quiz shows in lists: open if any session is running, else scheduled if one is coming, else ended.
// A quiz with no sessions is a draft.
export function quizStatus(sessions: readonly Pick<Session, "status">[]): QuizStatus {
  if (sessions.length === 0) return "draft";
  for (const status of ["running", "lobby", "scheduled"] as const)
    if (sessions.some((s) => s.status === status)) return status;
  return "ended";
}

// The session that sums a quiz up: a live one (running or lobby), else the next scheduled one, else the newest; null
// for a draft. Expects sessions newest first, as the API lists them.
export function headlineSession<S extends Pick<Session, "status">>(sessions: readonly S[]): S | null {
  return sessions.find((s) => s.status === "running" || s.status === "lobby") ?? sessions.find((s) => s.status === "scheduled") ?? sessions[0] ?? null;
}
