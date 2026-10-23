// What a session's clock and settings mean. Pure: the row types are the only thing taken from the database layer.
import type { Accommodations } from "@examinus/domain/accommodations";
import type { Session, SessionStatus } from "@examinus/domain/quiz";
import type { AttemptItem, QuizSessionItem } from "../../database/schemas/index.ts";

// An answer sent a moment after the deadline still counts: slow connections, the browser's own timer.
export const graceMs = 60_000;

// Stored status catches up with the clock only when the background job runs, so every read derives it:
// ended at closesAt, in the lobby from opensAt. Running only once the teacher started it: every session has a
// lobby, like a game, where students gather until the teacher presses Start.
export function sessionStatus(r: QuizSessionItem, now: number): SessionStatus {
  if (r.status === "ended") return "ended";
  // While paused the clock is stopped at the moment of the pause.
  const clock = r.pausedAt ? Math.min(now, r.pausedAt.getTime()) : now;
  if (r.closesAt && clock >= r.closesAt.getTime()) return "ended";
  if (r.status === "scheduled" && r.opensAt && now >= r.opensAt.getTime()) return "lobby";
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

// Whether a student's visible result may include the answer key (issue #15). While they can still take the session
// again, the key would let them retake it for full marks, so it waits until the session has ended or they have used
// every attempt, and never shows while an attempt is in progress. `session` carries this student's allowance, with
// the retakes granted to them.
export function answerKeyVisible(session: Session, attemptsUsed: number, inProgress: boolean): boolean {
  if (!resultsVisible(session) || inProgress) return false;
  return session.status === "ended" || (session.attemptsAllowed !== null && attemptsUsed >= session.attemptsAllowed);
}

// When an attempt stops taking answers (ms): its time limit (scaled by the student's time multiplier) or the session's
// close, whichever comes first, plus the time added live and the student's extra minutes, which run past the close.
export function attemptDeadline(
  session: Pick<QuizSessionItem, "closesAt" | "timeLimitMinutes">,
  attempt: Pick<AttemptItem, "startedAt" | "extraMs">,
  accommodations?: Pick<Accommodations, "timeMultiplier" | "extraMinutes"> | null,
): number | null {
  const multiplier = accommodations?.timeMultiplier ?? 1;
  const limit =
    session.timeLimitMinutes === null ? null : attempt.startedAt.getTime() + session.timeLimitMinutes * 60_000 * multiplier;
  const close = session.closesAt?.getTime() ?? null;
  const base = limit === null ? close : close === null ? limit : Math.min(limit, close);
  return base === null ? null : base + attempt.extraMs + (accommodations?.extraMinutes ?? 0) * 60_000;
}
