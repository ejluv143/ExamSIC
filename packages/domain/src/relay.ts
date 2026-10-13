// Team Relay: the pure rules behind the game format (teams, sharing out the questions, the password pieces,
// whether a piece can still be unlocked, and the points). The API applies them; tests pin them down.
import type { RelayPieceKind, RelaySettings } from "./quiz.ts";
import { idRandom, mulberry32, shuffled } from "./random.ts";

// --- Teams ---

const teamNames = ["Red", "Blue", "Green", "Yellow", "Purple", "Orange", "Pink", "Teal", "Gold", "Silver", "Navy", "Lime"];

// The first team name not taken yet: colours first, then "Team 13", "Team 14"...
export function nextTeamName(taken: Iterable<string>): string {
  const used = new Set(taken);
  const free = teamNames.find((n) => !used.has(n));
  if (free) return free;
  for (let i = teamNames.length + 1; ; i++) if (!used.has(`Team ${i}`)) return `Team ${i}`;
}

export type Teams = Readonly<Record<string, readonly string[]>>;

// Every player (in a team or not) dealt into the teams in a seeded random order: sizes differ by at most 1.
// null when there are more players than places.
export function randomizeTeams(players: readonly string[], teamIds: readonly string[], maxSize: number, seed: number): Record<string, string[]> | null {
  if (teamIds.length === 0 || players.length > teamIds.length * maxSize) return null;
  const out: Record<string, string[]> = Object.fromEntries(teamIds.map((id) => [id, []]));
  shuffled(players, mulberry32(seed)).forEach((p, i) => out[teamIds[i % teamIds.length]!]!.push(p));
  return out;
}

// Evens out team sizes (differing by at most 1, never over `maxSize`) with the fewest moves: teams that are too big
// give up their most recent members, and the unassigned players fill the smallest teams first. Players who don't fit
// anywhere stay in `unassigned`.
export function balanceTeams(
  teams: Teams,
  unassigned: readonly string[],
  maxSize: number,
): { teams: Record<string, string[]>; unassigned: string[]; moved: number } {
  const ids = Object.keys(teams);
  const out: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, [...teams[id]!]]));
  if (ids.length === 0) return { teams: out, unassigned: [...unassigned], moved: 0 };
  const total = ids.reduce((n, id) => n + out[id]!.length, 0) + unassigned.length;
  const base = Math.floor(total / ids.length);
  const extra = total % ids.length;
  // The biggest teams keep the extra places, so they lose the fewest members.
  const bySize = [...ids].sort((a, b) => out[b]!.length - out[a]!.length);
  const target = new Map(bySize.map((id, i) => [id, Math.min(base + (i < extra ? 1 : 0), maxSize)]));
  const pool: string[] = [];
  let moved = 0;
  for (const id of ids) {
    const members = out[id]!;
    while (members.length > target.get(id)!) {
      pool.push(members.pop()!);
      moved++;
    }
  }
  const waiting = [...unassigned, ...pool];
  while (waiting.length > 0) {
    const open = ids.filter((id) => out[id]!.length < target.get(id)!);
    if (open.length === 0) break;
    const smallest = open.reduce((a, b) => (out[b]!.length < out[a]!.length ? b : a));
    out[smallest]!.push(waiting.shift()!);
  }
  // Players left over (only when every team is full) stay unassigned.
  return { teams: out, unassigned: waiting, moved };
}

// What stops the teams from starting, as words for the teacher; null when fine. Empty teams are ignored (they are
// dropped at the start).
export function teamsStartProblem(teams: readonly { name: string; members: readonly string[] }[], maxSize: number): string | null {
  const playing = teams.filter((t) => t.members.length > 0);
  if (playing.length === 0) return "Wait for a player to join.";
  const full = playing.find((t) => t.members.length > maxSize);
  if (full) return `${full.name} has more than ${maxSize} players.`;
  return null;
}

// --- Questions ---

// The team's questions dealt to its members in a seeded random order: no question twice, none left out, shares
// differing by at most 1. null when the team has more members than questions.
export function partitionQuestions(questionIds: readonly string[], members: readonly string[], seed: number): Record<string, string[]> | null {
  if (members.length === 0 || members.length > questionIds.length) return null;
  const out: Record<string, string[]> = Object.fromEntries(members.map((m) => [m, []]));
  shuffled(questionIds, mulberry32(seed)).forEach((q, i) => out[members[i % members.length]!]!.push(q));
  return out;
}

// Questions handed over (a player left, or a late player arrived) go one at a time to the member with the fewest
// questions still to answer (`loads`); ties go to the member listed first.
export function shareOut(questionIds: readonly string[], loads: Readonly<Record<string, number>>): Record<string, string[]> {
  const members = Object.keys(loads);
  const load = new Map(members.map((m) => [m, loads[m]!]));
  const out: Record<string, string[]> = Object.fromEntries(members.map((m) => [m, []]));
  if (members.length === 0) return out;
  for (const q of questionIds) {
    const least = members.reduce((a, b) => (load.get(b)! < load.get(a)! ? b : a));
    out[least]!.push(q);
    load.set(least, load.get(least)! + 1);
  }
  return out;
}

// --- The password ---

export const relayPasswordMaxLength = 64;
export const relayClueMaxLength = 200;
export const relayMaxClues = 100;

// What two guesses must share to match: the letters and digits, in lower case (accents kept: "Ñ" isn't "N").
export const normalizePassword = (input: string): string =>
  input.normalize("NFC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]/gu, "");

const unitsOf = (password: string, clues: readonly string[], kind: RelayPieceKind): string[] => {
  switch (kind) {
    case "letter":
    case "coordinate":
      return [...password.normalize("NFC")].filter((c) => /[\p{L}\p{N}]/u.test(c)).map((c) => c.toLocaleUpperCase("en"));
    case "word":
      return password.trim().split(/\s+/).filter(Boolean);
    case "clue":
      return clues.map((c) => c.trim()).filter(Boolean);
  }
};

// The pieces of the password in order, one per question slot at most: with more letters (words, clues) than
// questions, neighbouring ones share a piece (sizes differing by at most 1); with fewer, some questions carry no piece.
export function splitPassword(password: string, clues: readonly string[], kind: RelayPieceKind, slots: number): string[] {
  const units = unitsOf(password, clues, kind);
  const count = Math.min(units.length, Math.max(slots, 0));
  if (count === 0) return [];
  const glue = kind === "word" ? " " : kind === "clue" ? " / " : "";
  const base = Math.floor(units.length / count);
  const extra = units.length % count;
  const pieces: string[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const size = base + (i < extra ? 1 : 0);
    pieces.push(units.slice(at, at + size).join(glue));
    at += size;
  }
  return pieces;
}

// What is wrong with the teacher's password and clues, as words; null when fine. A null password means each team
// gets a generated word, which needs a kind other than "clue".
export function relayPasswordProblem(password: string | null, clues: readonly string[], kind: RelayPieceKind): string | null {
  if (password !== null) {
    if (password.length > relayPasswordMaxLength) return `The team password can have at most ${relayPasswordMaxLength} characters.`;
    if (normalizePassword(password) === "") return "The team password needs at least one letter or number.";
  }
  if (kind !== "clue") return null;
  if (password === null) return "Clue pieces need a password for the clues to lead to.";
  const filled = clues.map((c) => c.trim()).filter(Boolean);
  if (filled.length === 0) return "Write at least one clue.";
  if (filled.length > relayMaxClues) return `At most ${relayMaxClues} clues.`;
  if (filled.some((c) => c.length > relayClueMaxLength)) return `A clue can have at most ${relayClueMaxLength} characters.`;
  return null;
}

const words = [
  "atom", "bridge", "canyon", "comet", "delta", "eclipse", "falcon", "forest", "galaxy", "glacier", "harbor", "horizon",
  "island", "jungle", "lantern", "magnet", "meadow", "meteor", "nebula", "ocean", "orbit", "palace", "pebble", "planet",
  "prism", "quartz", "rocket", "saturn", "signal", "spiral", "summit", "thunder", "tornado", "tunnel", "valley",
  "volcano", "window", "wizard", "anchor", "beacon", "cipher", "compass", "crystal", "dolphin", "emerald", "fountain",
  "harmony", "journey", "kingdom", "labyrinth", "mosaic", "phoenix", "pyramid", "rainbow", "sapphire", "telescope",
];

// A password for one team when the teacher didn't set one: a word about as long as the team has questions (letters),
// or up to three words (words). Seeded, so a restart gives the same word.
export function generatePassword(seed: number, kind: Exclude<RelayPieceKind, "clue">, slots: number): string {
  const random = mulberry32(seed);
  if (kind === "word") return shuffled(words, random).slice(0, Math.max(1, Math.min(slots, 3))).join(" ");
  const want = Math.max(4, Math.min(slots, 9));
  const gap = (w: string) => Math.abs(w.length - want);
  const best = Math.min(...words.map(gap));
  const close = words.filter((w) => gap(w) === best);
  return close[Math.floor(random() * close.length)]!;
}

// Seeded order of a team's question slots (which question carries which piece): differs between teams.
export const slotOrder = <T>(items: readonly T[], teamId: string): T[] => shuffled(items, idRandom(teamId));

// --- Whether a piece can still be unlocked ---

export type SlotState =
  // The piece is revealed.
  | "unlocked"
  // The owner hasn't answered yet.
  | "open"
  // The owner answered wrong and may try again.
  | "retry"
  // Locked for the owner; a teammate who finished may rescue it.
  | "rescue"
  // A teammate claimed the rescue and is answering it.
  | "rescuing"
  // No way left to unlock it.
  | "locked";

export function slotState(input: {
  // The owner's latest answer (a timeout counts as a wrong answer); null: not answered yet.
  owner: { correct: boolean | null; retries: number } | null;
  // The owner is still on this question (they haven't moved on).
  ownerOn: boolean;
  // Nobody owns the question any more (its owner left and no teammate could take it).
  ownerless: boolean;
  // A teammate's rescue: correct null while it is being answered.
  rescue: { correct: boolean | null } | null;
  settings: Pick<RelaySettings, "retry" | "retryLimit" | "rescue">;
}): SlotState {
  const { owner, rescue, settings } = input;
  if (owner?.correct === true || rescue?.correct === true) return "unlocked";
  if (rescue) return rescue.correct === null ? "rescuing" : "locked";
  if (owner === null) return input.ownerless ? (settings.rescue ? "rescue" : "locked") : "open";
  if (settings.retry && input.ownerOn && owner.retries < settings.retryLimit) return "retry";
  return settings.rescue ? "rescue" : "locked";
}

// --- Points ---

export const relayWrongGuessPenalty = 100;

// A member's points for a retried answer: `penalty` percent less for every retry, never below 0.
export const retryPoints = (earned: number, retries: number, penalty: number): number =>
  Math.round(earned * Math.max(0, 1 - (penalty * retries) / 100));

// A rescuer's share of what the answer would have earned.
export const rescuePoints = (earned: number, percent: number): number => Math.round((earned * percent) / 100);

// The team's score: its members' game points (retries and rescues already applied), plus the solve bonus (all of
// it at once, half at the last moment of the round), less 100 per wrong password guess. Never below 0.
export function relayTeamPoints(input: {
  memberPoints: number;
  solvedAfterMs: number | null;
  roundMs: number;
  solveBonus: number;
  wrongGuesses: number;
}): number {
  const elapsed = input.solvedAfterMs === null ? null : Math.min(Math.max(input.solvedAfterMs, 0), input.roundMs);
  const bonus = elapsed === null ? 0 : Math.round(input.solveBonus * (1 - elapsed / input.roundMs / 2));
  return Math.max(0, input.memberPoints + bonus - input.wrongGuesses * relayWrongGuessPenalty);
}

// --- Settings ---

// What is wrong with the relay settings for this pacing, as words for the teacher; null when fine.
export function relaySettingsProblem(pacing: "teacher" | "student", relay: RelaySettings | null): string | null {
  if (relay === null) return null;
  if (pacing === "teacher") return "Team Relay only works in a student-paced game: each member gets different questions.";
  const within = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if (!within(relay.teamSize, 1, 4)) return "A relay team has 1 to 4 members.";
  if (!within(relay.teamCount, 1, 50)) return "Make 1 to 50 teams.";
  if (!within(relay.passwordAttempts, 1, 20)) return "Teams need 1 to 20 password guesses.";
  if (!within(relay.solveBonus, 0, 10000)) return "The solve bonus must be 0 to 10000 points.";
  if (!within(relay.roundMinutes, 1, 120)) return "A relay round lasts 1 to 120 minutes.";
  if (!within(relay.retryLimit, 1, 3)) return "Allow 1 to 3 retries.";
  if (!within(relay.retryPenalty, 0, 100)) return "The retry penalty must be 0 to 100 percent.";
  if (!within(relay.rescuePoints, 0, 100)) return "Rescue points must be 0 to 100 percent.";
  return null;
}
