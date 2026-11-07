// What a session's schedule means. Pure: the row types are the only thing taken from the database layer.
import type { SessionStatus } from "@examinus/domain/quiz";
import type { QuizSessionItem } from "../../database/schemas/index.ts";
import { sessionClock } from "./clock.ts";

// Stored status catches up with the clock only when the background job runs, so every read derives it:
// ended at closesAt, in the lobby from opensAt. Running only once the teacher started it: every session has a
// lobby, like a game, where students gather until the teacher presses Start.
export function sessionStatus(r: QuizSessionItem, now: number): SessionStatus {
  if (r.status === "ended") return "ended";
  if (r.closesAt && sessionClock(r, now) >= r.closesAt.getTime()) return "ended";
  if (r.status === "scheduled" && r.opensAt && now >= r.opensAt.getTime()) return "lobby";
  return r.status;
}
