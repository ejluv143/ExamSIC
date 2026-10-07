// Small helpers for showing quizzes and their sessions.
import type { Session } from "@examora/contract";
import type { QuizStatus } from "./types";

// What a quiz shows in lists: open if any session is running, else scheduled if one is coming, else ended.
// A quiz with no sessions is a draft.
export function quizStatus(sessions: readonly Pick<Session, "status">[]): QuizStatus {
  if (sessions.length === 0) return "draft";
  for (const status of ["running", "lobby", "scheduled"] as const)
    if (sessions.some((s) => s.status === status)) return status;
  return "ended";
}

const modeLabels: Record<Session["mode"], string> = { quiz: "Quiz", exam: "Exam", mastery: "Mastery", game: "Game" };
export const modeLabel = (mode: Session["mode"]) => modeLabels[mode];

export type Availability = "upcoming" | "open" | "closed";

// What a student sees of a session: not open yet, open, or over.
export function availability(status: Session["status"]): Availability {
  return status === "running" ? "open" : status === "ended" ? "closed" : "upcoming";
}

// Whether students may see their score and the answer key yet (the same rule the API applies).
export function resultsVisible(session: Pick<Session, "resultsRelease" | "resultsReleased" | "status">): boolean {
  if (session.resultsRelease === "immediately") return true;
  return session.resultsRelease === "after_close" ? session.status === "ended" : session.resultsReleased;
}
