// What a session's clock and settings mean. Pure: the row types are the only thing taken from the database layer.
import type { Session, SessionStatus } from "@examinus/contract";
import type { AttemptItem, QuizSessionItem } from "../../database/schemas/index.ts";

// An answer sent a moment after the deadline still counts: slow connections, the browser's own timer.
export const graceMs = 60_000;

// Stored status catches up with the clock only when the background job runs, so every read derives it:
// ended at closesAt, running from opensAt (or once the teacher started it).
export function sessionStatus(r: QuizSessionItem, now: number): SessionStatus {
  if (r.status === "ended") return "ended";
  // While paused the clock is stopped at the moment of the pause.
  const clock = r.pausedAt ? Math.min(now, r.pausedAt.getTime()) : now;
  if (r.closesAt && clock >= r.closesAt.getTime()) return "ended";
  if (r.status === "running") return "running";
  if (r.opensAt && now >= r.opensAt.getTime()) return "running";
  return r.status;
}

// Whether students may see their score and the answer key yet.
export function resultsVisible(session: Session): boolean {
  switch (session.resultsRelease) {
    case "immediately":
      return true;
    case "after_close":
      return session.status === "ended";
    case "manual":
      return session.resultsReleased;
  }
}

// When an attempt stops taking answers (ms): its time limit or the session's close, whichever comes first.
export function attemptDeadline(
  session: Pick<QuizSessionItem, "closesAt" | "timeLimitMinutes">,
  attempt: Pick<AttemptItem, "startedAt" | "extraMs">,
): number | null {
  const limit = session.timeLimitMinutes === null ? null : attempt.startedAt.getTime() + session.timeLimitMinutes * 60_000;
  const close = session.closesAt?.getTime() ?? null;
  const base = limit === null ? close : close === null ? limit : Math.min(limit, close);
  return base === null ? null : base + attempt.extraMs;
}
