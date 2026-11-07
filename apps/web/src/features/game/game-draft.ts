import {
  defaultGame,
  defaultRelay,
  gameMaxSeconds,
  gameMinSeconds,
  type GameSettings,
  type RelayPieceKind,
} from "@examinus/domain/quiz";
import { relayPasswordProblem, relaySettingsProblem } from "@examinus/domain/relay";

export type GamePacing = "teacher" | "student";

// The game settings as the form holds them while the teacher types.
export type GameDraft = {
  pacing: GamePacing;
  questionSeconds: string;
  showLeaderboard: boolean;
  streakBonus: boolean;
  // Team Relay: `relay` is the format toggle; the rest are the relay fields.
  relay: boolean;
  teamSize: string;
  teamCount: string;
  studentPick: boolean;
  pieceKind: RelayPieceKind;
  // Blank: each team gets a generated word.
  relayPassword: string;
  // One clue per line.
  relayClues: string;
  passwordAttempts: string;
  solveBonus: string;
  roundMinutes: string;
  requireConsensus: boolean;
  retry: boolean;
  retryLimit: string;
  retryPenalty: string;
  rescue: boolean;
  rescuePoints: string;
};

export const gameDraft = (
  saved: GameSettings | null | undefined,
  pacing: GamePacing | undefined,
  secrets?: { relayPassword: string | null; relayClues: readonly string[] },
): GameDraft => {
  const s = saved ?? defaultGame;
  const r = s.relay ?? defaultRelay;
  return {
    pacing: pacing ?? "teacher",
    questionSeconds: String(s.questionSeconds),
    showLeaderboard: s.showLeaderboard,
    streakBonus: s.streakBonus,
    relay: s.relay !== null,
    teamSize: String(r.teamSize),
    teamCount: String(r.teamCount),
    studentPick: r.studentPick,
    pieceKind: r.pieceKind,
    relayPassword: secrets?.relayPassword ?? "",
    relayClues: (secrets?.relayClues ?? []).join("\n"),
    passwordAttempts: String(r.passwordAttempts),
    solveBonus: String(r.solveBonus),
    roundMinutes: String(r.roundMinutes),
    requireConsensus: r.requireConsensus,
    retry: r.retry,
    retryLimit: String(r.retryLimit),
    retryPenalty: String(r.retryPenalty),
    rescue: r.rescue,
    rescuePoints: String(r.rescuePoints),
  };
};

// The settings to save (with the relay password and clues, which are stored apart), or the problems to show the teacher.
export function gameFromDraft(
  d: GameDraft,
): { settings: GameSettings; relayPassword: string | null; relayClues: string[] } | { problems: string[] } {
  const questionSeconds = Number(d.questionSeconds);
  if (!Number.isInteger(questionSeconds) || questionSeconds < gameMinSeconds || questionSeconds > gameMaxSeconds)
    return { problems: [`Time per question must be a whole number from ${gameMinSeconds} to ${gameMaxSeconds} seconds.`] };
  const base = { questionSeconds, showLeaderboard: d.showLeaderboard, streakBonus: d.streakBonus };
  if (!d.relay) return { settings: { ...base, relay: null }, relayPassword: null, relayClues: [] };
  const relay = {
    teamSize: Number(d.teamSize),
    teamCount: Number(d.teamCount),
    studentPick: d.studentPick,
    pieceKind: d.pieceKind,
    passwordAttempts: Number(d.passwordAttempts),
    solveBonus: Number(d.solveBonus),
    roundMinutes: Number(d.roundMinutes),
    requireConsensus: d.requireConsensus,
    retry: d.retry,
    retryLimit: Number(d.retryLimit),
    retryPenalty: Number(d.retryPenalty),
    rescue: d.rescue,
    rescuePoints: Number(d.rescuePoints),
  };
  const password = d.relayPassword.trim() === "" ? null : d.relayPassword.trim();
  const clues = d.pieceKind === "clue" ? d.relayClues.split("\n").map((c) => c.trim()).filter(Boolean) : [];
  const problem = relaySettingsProblem(d.pacing, relay) ?? relayPasswordProblem(password, clues, d.pieceKind);
  if (problem) return { problems: [problem] };
  return { settings: { ...base, relay }, relayPassword: password, relayClues: clues };
}
