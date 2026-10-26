// What a student can do with a session: how many attempts are left, whether it is open, and which bucket (to do,
// upcoming, done) their list puts it in. Shared by the web app and the mobile app.
import type { Session } from "./quiz.ts";

// How many times a student may take a quiz or exam. Stored as attempts (retakes + 1); null is unlimited.

export const hasAttemptsLeft = (used: number, allowed: number | null) => allowed === null || used < allowed;

// "attempt 2 of 3", or just "attempt 2" when retakes are unlimited.
export const attemptLabel = (attempt: number, allowed: number | null) =>
  allowed === null ? `attempt ${attempt}` : `attempt ${attempt} of ${allowed}`;

export function retakesLabel(allowed: number | null): string {
  if (allowed === null) return "Unlimited retakes";
  const retakes = allowed - 1;
  return retakes === 0 ? "No retakes" : `${retakes} ${retakes === 1 ? "retake" : "retakes"}`;
}

export type Availability = "upcoming" | "lobby" | "open" | "closed";

// What a student sees of a session: not open yet, waiting in the lobby, open, or over.
export function availability(status: Session["status"]): Availability {
  return status === "running" ? "open" : status === "ended" ? "closed" : status === "lobby" ? "lobby" : "upcoming";
}

export type Bucket = "todo" | "upcoming" | "done";

// To do: open with attempts left. Done: submitted, used up, or closed.
export function bucketOf(i: { session: Pick<Session, "mode" | "status" | "attemptsAllowed">; attemptsUsed: number }): Bucket {
  // A game is joined from its lobby, or while it runs; any other session can be joined once its lobby is open.
  if (i.session.mode === "game" && (i.session.status === "lobby" || i.session.status === "running")) return "todo";
  const when = availability(i.session.status);
  if (when === "lobby") return "todo";
  if (when === "open" && hasAttemptsLeft(i.attemptsUsed, i.session.attemptsAllowed)) return "todo";
  if (when === "upcoming") return "upcoming";
  return "done";
}
