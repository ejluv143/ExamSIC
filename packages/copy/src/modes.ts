// How a session's mode is named to people.
import type { Session } from "@examinus/domain/quiz";

export const modeLabels: Record<Session["mode"], string> = { quiz: "Quiz", exam: "Exam", mastery: "Mastery", game: "Game" };
export const modeLabel = (mode: Session["mode"]) => modeLabels[mode];
