// When students may see their score and the answer key. One place, so the API and the teacher's pages agree on
// what a student can see.
import type { Session } from "./quiz.ts";

// Whether students may see their score yet.
export function resultsVisible(session: Pick<Session, "resultsRelease" | "resultsReleased" | "status">): boolean {
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
export function answerKeyVisible(
  session: Pick<Session, "resultsRelease" | "resultsReleased" | "status" | "attemptsAllowed">,
  attemptsUsed: number,
  inProgress: boolean,
): boolean {
  if (!resultsVisible(session) || inProgress) return false;
  return session.status === "ended" || (session.attemptsAllowed !== null && attemptsUsed >= session.attemptsAllowed);
}
