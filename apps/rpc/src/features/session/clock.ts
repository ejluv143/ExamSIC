// Time as a session and its attempts keep it: when an attempt stops taking answers, whether it still may, and how
// long a student may be away. Pure: the row types are the only thing taken from the database layer.
import type { Accommodations } from "@examinus/domain/accommodations";
import { examDefaults } from "@examinus/domain/exam";
import type { ExamSettings } from "@examinus/domain/quiz";
import type { AttemptItem, QuizSessionItem } from "../../database/schemas/index.ts";

// An answer sent a moment after the deadline still counts: slow connections, the browser's own timer.
export const graceMs = 60_000;

// The same for one question of a one-question-at-a-time paper, which has a much shorter deadline.
export const questionGraceMs = 3000;

// The session's clock in ms: while it is paused the clock is stopped at the moment of the pause.
export const sessionClock = (session: Pick<QuizSessionItem, "pausedAt">, now: number): number =>
  session.pausedAt ? Math.min(now, session.pausedAt.getTime()) : now;

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

// Where an attempt is on its clock: `open` until its deadline, `grace` for the minute after it (answers still count),
// `expired` after that. A session the teacher ended is a deadline too: the end plus the student's extra time.
export type AttemptClock = "open" | "grace" | "expired";

export function attemptClock(
  session: Pick<QuizSessionItem, "pausedAt" | "closesAt" | "timeLimitMinutes" | "status" | "endedAt">,
  attempt: Pick<AttemptItem, "startedAt" | "extraMs">,
  accommodations: Pick<Accommodations, "timeMultiplier" | "extraMinutes"> | null | undefined,
  now: number,
): AttemptClock {
  const deadline = attemptDeadline(session, attempt, accommodations);
  const ended =
    session.status === "ended" && session.endedAt
      ? session.endedAt.getTime() + attempt.extraMs + (accommodations?.extraMinutes ?? 0) * 60_000
      : null;
  const cutoff = deadline === null ? ended : ended === null ? deadline : Math.min(deadline, ended);
  if (cutoff === null) return "open";
  const clock = sessionClock(session, now);
  if (clock > cutoff + graceMs) return "expired";
  return clock > cutoff ? "grace" : "open";
}

// An exam attempt may resume without the teacher only on its own device and within the grace period after its
// last check-in. `lastSeen` null: never checked in, treated as fresh.
export function withinDeviceGrace(exam: ExamSettings | null, lastSeen: Date | null, now: Date): boolean {
  if (lastSeen === null) return true;
  const graceMinutes = exam?.deviceGraceMinutes ?? examDefaults.deviceGraceMinutes;
  return now.getTime() - lastSeen.getTime() <= graceMinutes * 60_000;
}
