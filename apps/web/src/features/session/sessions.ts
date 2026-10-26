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

// Whether students may see their score and the answer key yet (the same rule the API applies).
export function resultsVisible(session: Pick<Session, "resultsRelease" | "resultsReleased" | "status">): boolean {
  if (session.resultsRelease === "immediately") return true;
  return session.resultsRelease === "after_close" ? session.status === "ended" : session.resultsReleased;
}
