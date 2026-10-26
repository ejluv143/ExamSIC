// How a quiz's status is named to people.
import type { SessionStatus } from "@examinus/domain/quiz";

export type QuizStatus = SessionStatus | "draft";

export const statusLabel: Record<QuizStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  lobby: "Lobby",
  running: "Open",
  ended: "Ended",
};
