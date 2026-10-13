// What a game session's settings must look like, and the session columns a game sets. Pure: the session feature
// calls these when a session is created or edited.
import { type RelaySettings } from "@examinus/domain/quiz";
import { relayPasswordProblem, relaySettingsProblem } from "@examinus/domain/relay";

// A game's settings problem, as words for the teacher; null when fine.
export function gameSettingsProblem(
  mode: string,
  pacing: "teacher" | "student",
  game: { questionSeconds: number; relay: RelaySettings | null } | null,
  relayPassword: string | null,
  relayClues: readonly string[],
): string | null {
  if (mode !== "game") return pacing === "teacher" ? "Only a game can be teacher-paced." : null;
  if (game === null) return "Choose the game settings.";
  const relayProblem = relaySettingsProblem(pacing, game.relay);
  if (relayProblem !== null) return relayProblem;
  if (game.relay === null) return null;
  const password = (relayPassword ?? "").trim();
  return relayPasswordProblem(password === "" ? null : password, relayClues.map((c) => c.trim()).filter(Boolean), game.relay.pieceKind);
}

// The session columns a game sets. Everything else keeps "student" pacing and no game settings. A game has no time
// limit of its own: questions run on the game's per-question clock, every player gets one go. The relay columns are
// empty unless the game is a relay.
export function gameColumns(
  mode: string,
  pacing: "teacher" | "student",
  game: { questionSeconds: number; showLeaderboard: boolean; streakBonus: boolean; relay: RelaySettings | null } | null,
  relayPassword: string | null,
  relayClues: readonly string[],
) {
  if (mode !== "game" || game === null) return { pacing: "student" as const, relay: null, relayPassword: null, relayClues: [] as string[] };
  const password = (relayPassword ?? "").trim();
  return {
    pacing,
    gameQuestionSeconds: game.questionSeconds,
    gameLeaderboard: game.showLeaderboard,
    gameStreakBonus: game.streakBonus,
    relay: game.relay,
    relayPassword: game.relay !== null && password !== "" ? password : null,
    relayClues: game.relay !== null ? relayClues.map((c) => c.trim()).filter(Boolean) : [],
    timeLimitMinutes: null,
    attemptsAllowed: 1,
    oneQuestionAtATime: false,
    navigation: "free" as const,
    maxMarked: 0,
    questionTimeLimitSeconds: null,
  };
}
