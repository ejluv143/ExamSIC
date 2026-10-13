// The rules of a game, as plain functions over a `Room`: how answers split and score, the standings, which question
// opens next, and everything a Team Relay decides (teams, password pieces, rescues, hand-overs). Nothing here
// touches the database or the bus; Service.ts calls these under the room's lock and does the writing.
import { type GameBucket, type GameRow, type RelayMember } from "@examinus/contract/game";
import { answerKey } from "@examinus/domain/answer-text";
import { gameAnswerPoints } from "@examinus/domain/game";
import { kindOf } from "@examinus/domain/kinds";
import { type CodeTestResult } from "@examinus/domain/kinds/base";
import { type Question } from "@examinus/domain/question";
import { type AnswerValue } from "@examinus/domain/quiz";
import {
  balanceTeams,
  generatePassword,
  nextTeamName,
  partitionQuestions,
  retryPoints,
  relayTeamPoints,
  shareOut,
  slotOrder,
  slotState,
  splitPassword,
  teamsStartProblem,
  type SlotState,
} from "@examinus/domain/relay";
import { autoScore } from "@examinus/domain/scoring";
import { idRandom, shuffled } from "@examinus/domain/random";
import { attemptPaper, flatQuestions } from "../attempt/rules.ts";
import type { SlotUpdate, TeamRows } from "./Repo.ts";
import { topRows, type Player, type Room, type Team, type TeamSlot } from "./Room.ts";

export const hashSeed = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 1) || 1;
};

// --- How answers split ---

const outcomeLabels = { ok: "Correct", part: "Partly correct", bad: "Wrong" } as const;

// The keys an answer is counted under: the ids of the choices picked, or how it fared. Hand-graded types count none.
export function tallyKeys(q: Question, value: AnswerValue, fraction: number | null): string[] {
  const own = kindOf(q).gameTally;
  if (own) return own(q, value, fraction);
  return [fraction === 1 ? "ok" : fraction !== null && fraction > 0 ? "part" : "bad"];
}

export function buckets(q: Question, tally: ReadonlyMap<string, number>, unanswered: number): GameBucket[] {
  const n = (key: string) => tally.get(key) ?? 0;
  const own = kindOf(q).gameBuckets;
  const out = own
    ? own(q, n)
    : [
        { label: outcomeLabels.ok, count: n("ok"), correct: true },
        { label: outcomeLabels.part, count: n("part"), correct: false },
        { label: outcomeLabels.bad, count: n("bad"), correct: false },
      ];
  if (out === null) return [];
  return unanswered > 0 ? [...out, { label: "No answer", count: unanswered, correct: false }] : out;
}

// The first line of the prompt, cut short, for the presenter's question list (blanks hide the answers).
export function promptOf(q: Question): string {
  const line = q.prompt.replace(/\{\{[^}]*\}\}/g, "____").split("\n").find((l) => l.trim() !== "") ?? "";
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}

// The right answer in words, for the types whose bars don't show it.
export function answerText(q: Question): string | null {
  return kindOf(q).gameAnswer?.(q) ?? null;
}

// What one answer (or a timeout) is worth the player: the share of the question it got right, the points it
// earned (less for a relay retry) and the streak it leaves. `results`: the code or SQL checks, when the question has them.
export function scoreAnswer(
  room: Room,
  p: Player,
  q: Question,
  value: AnswerValue,
  elapsedMs: number,
  timedOut: boolean,
  results: CodeTestResult[] | null,
) {
  const fraction = timedOut ? (kindOf(q).gameUnscored ? null : 0) : autoScore(q, value, results);
  const points = gameAnswerPoints({
    gamePoints: q.gamePoints,
    fraction,
    elapsedMs,
    limitMs: room.seconds * 1000,
    streak: p.streak,
    streakBonus: room.streakBonus,
  });
  const tries = room.relay === null ? 0 : (p.tries.get(q.id) ?? 0);
  const earned = room.relay !== null && tries > 0 ? retryPoints(points.earned, tries, room.relay.retryPenalty) : points.earned;
  const correct = fraction === null ? null : fraction === 1;
  return { fraction, earned, correct, streak: points.streak };
}

// --- Standings ---

// The players by points (ties by name) with their ranks, and the top of the list as the screens show it.
export function rankPlayers(players: Iterable<Player>): { board: GameRow[]; ranks: Map<string, { rank: number; points: number }> } {
  const sorted = [...players].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const ranks = new Map<string, { rank: number; points: number }>();
  const board: GameRow[] = [];
  let rank = 0;
  let previous = -1;
  sorted.forEach((p, i) => {
    if (p.points !== previous) {
      rank = i + 1;
      previous = p.points;
    }
    ranks.set(p.attemptId, { rank, points: p.points });
    if (i < topRows) board.push({ rank, attemptId: p.attemptId, name: p.name, avatar: p.avatar, points: p.points });
  });
  return { board, ranks };
}

// Brings the room's standings up to date.
export const recomputeBoard = (room: Room) => {
  const { board, ranks } = rankPlayers(room.players.values());
  room.board = board;
  room.ranks = ranks;
  room.boardDirty = false;
};

// The question to open after the current one: the first unplayed one after it, else the first unplayed one
// at all (a jump may have skipped some); null when every question was played.
export const nextIndex = (room: Room): number | null => {
  const unplayed = room.questions.map((_, i) => i).filter((i) => !room.played.has(i));
  return unplayed.find((i) => i > room.index) ?? unplayed[0] ?? null;
};

// --- Papers ---

export const teamOf = (room: Room, p: Player): Team | undefined => (p.teamId === null ? undefined : room.teams.get(p.teamId));

// A relay player's paper: the questions their team gave them, in the order they answer them.
const relayPaper = (room: Room, p: Player): Question[] => {
  const team = teamOf(room, p);
  if (!team) return [];
  return [...team.slots.values()]
    .filter((s) => s.owner === p.attemptId)
    .sort((a, b) => a.shareIndex - b.shareIndex)
    .flatMap((s) => {
      const q = room.byId.get(s.questionId);
      return q ? [q] : [];
    });
};

export const paperOf = (room: Room, p: Player) =>
  (p.paper ??= room.relay !== null ? relayPaper(room, p) : room.pacing === "teacher" ? room.questions : flatQuestions(attemptPaper(room.detail, p.seed)));

// --- Team Relay: where a team stands ---

export const roundEndsAt = (room: Room): number | null =>
  room.relay === null || room.startedAt === null ? null : room.startedAt + room.relay.roundMinutes * 60_000;

// A team's round is over: it solved the password, used its guesses, or the time ran out.
export const teamOver = (room: Room, team: Team, now = Date.now()): boolean => {
  const relay = room.relay;
  if (relay === null) return false;
  if (team.solvedAt !== null || team.wrongGuesses >= relay.passwordAttempts || room.status === "ended") return true;
  const end = roundEndsAt(room);
  return end !== null && now >= end;
};

// Where a question of a team stands: whether its piece is unlocked, can still be, or never will be.
export const slotStateOf = (room: Room, slot: TeamSlot): SlotState => {
  const owner = slot.owner === null ? undefined : room.players.get(slot.owner);
  const done = owner?.done.get(slot.questionId);
  const ownerOn =
    owner !== undefined && !owner.finished && owner.startedAt !== null && paperOf(room, owner)[owner.index]?.id === slot.questionId;
  return slotState({
    owner: owner && done ? { correct: done.correct, retries: owner.tries.get(slot.questionId) ?? 0 } : null,
    ownerOn,
    ownerless: slot.owner === null,
    rescue: slot.rescuer !== null || slot.rescueCorrect !== null ? { correct: slot.rescueCorrect } : null,
    settings: room.relay!,
  });
};

export const unlockedPieces = (room: Room, team: Team): number =>
  [...team.slots.values()].filter((s) => s.piece !== null && slotStateOf(room, s) === "unlocked").length;

export const teamPoints = (room: Room, team: Team): number => {
  const relay = room.relay!;
  return relayTeamPoints({
    memberPoints: team.members.reduce((sum, id) => sum + (room.players.get(id)?.points ?? 0), 0),
    solvedAfterMs: team.solvedAt === null || room.startedAt === null ? null : team.solvedAt - room.startedAt,
    roundMs: relay.roundMinutes * 60_000,
    solveBonus: relay.solveBonus,
    wrongGuesses: team.wrongGuesses,
  });
};

// The teams best first: solved ones by solve time, then by points. Before the start they stay in screen order.
export const rankedTeams = (room: Room): { team: Team; points: number; rank: number }[] => {
  const started = room.startedAt !== null;
  const rows = [...room.teams.values()].map((team) => ({ team, points: started ? teamPoints(room, team) : 0, rank: 0 }));
  if (!started) return rows.sort((a, b) => a.team.position - b.team.position);
  rows.sort(
    (a, b) =>
      Number(a.team.solvedAt === null) - Number(b.team.solvedAt === null) ||
      (a.team.solvedAt ?? 0) - (b.team.solvedAt ?? 0) ||
      b.points - a.points ||
      a.team.position - b.team.position,
  );
  rows.forEach((row, i) => {
    const before = rows[i - 1];
    row.rank = before && before.team.solvedAt === row.team.solvedAt && before.points === row.points ? before.rank : i + 1;
  });
  return rows;
};

export const memberView = (p: Player): RelayMember => ({ attemptId: p.attemptId, name: p.name, avatar: p.avatar });

export const membersOf = (room: Room, team: Team): RelayMember[] =>
  team.members.flatMap((id) => {
    const p = room.players.get(id);
    return p ? [memberView(p)] : [];
  });

// Every team's round is over (or has nobody left): the game is done.
export const relayAllOver = (room: Room): boolean =>
  room.relay !== null &&
  room.status === "running" &&
  room.teams.size > 0 &&
  [...room.teams.values()].every((t) => t.members.length === 0 || teamOver(room, t));

// The team's board for its own members: a piece's text (and, scrambled, its place) only once it is unlocked.
export const boardOf = (room: Room, team: Team) => {
  const relay = room.relay!;
  const slots = [...team.slots.values()].filter((s) => s.piece !== null).sort((a, b) => a.piece! - b.piece!);
  const scrambled = relay.pieceKind === "coordinate";
  const ordered = scrambled ? shuffled(slots, idRandom(`${team.id}:board`)) : slots;
  return ordered.map((s) => {
    const state = slotStateOf(room, s);
    const open = state === "unlocked";
    return {
      position: scrambled && !open ? null : s.piece! + 1,
      text: open ? (team.pieces[s.piece!] ?? "") : null,
      owner: (s.owner === null ? undefined : room.players.get(s.owner)?.name) ?? "",
      state,
    };
  });
};

// --- Team Relay: building and restoring teams ---

export const blankTeam = (row: { id: string; name: string; position: number }): Team => ({
  id: row.id,
  name: row.name,
  position: row.position,
  password: null,
  pieces: [],
  wrongGuesses: 0,
  solvedAt: null,
  members: [],
  slots: new Map(),
  lastGuessAt: 0,
  lastGuess: null,
  proposal: null,
  debrief: null,
});

// Rebuilds the teams of a relay from the database rows: members, questions, the password's pieces, guesses.
export function restoreTeams(room: Room, { teamRows, memberRows, slotRows, guessRows }: TeamRows) {
  const relay = room.relay;
  if (relay === null) return;
  for (const t of teamRows) {
    const team = blankTeam(t);
    team.password = t.password;
    team.wrongGuesses = t.wrongGuesses;
    team.solvedAt = t.solvedAt?.getTime() ?? null;
    room.teams.set(team.id, team);
  }
  for (const m of memberRows) {
    const p = room.players.get(m.attemptId);
    const team = room.teams.get(m.teamId);
    if (!p || !team) continue;
    p.teamId = team.id;
    team.members.push(p.attemptId);
  }
  for (const s of slotRows)
    room.teams.get(s.teamId)?.slots.set(s.questionId, {
      questionId: s.questionId,
      owner: s.ownerAttemptId,
      shareIndex: s.shareIndex,
      piece: s.piece,
      boardIndex: s.boardIndex,
      rescuer: s.rescuerAttemptId,
      rescueCorrect: s.rescueCorrect,
      rescueClaimedAt: s.rescueClaimedAt?.getTime() ?? null,
      scoring: false,
    });
  for (const team of room.teams.values())
    if (team.password !== null && team.slots.size > 0)
      team.pieces = splitPassword(team.password, room.relayClues, relay.pieceKind, room.questions.length);
  for (const g of guessRows) {
    const team = room.teams.get(g.teamId);
    if (!team) continue;
    team.lastGuessAt = g.createdAt.getTime();
    team.lastGuess = { guess: g.guess, by: (g.attemptId === null ? undefined : room.players.get(g.attemptId)?.name) ?? "", correct: g.correct };
  }
}

// The rows for `count` more teams, named after the ones there are.
export function newTeamRows(room: Room, count: number): { sessionId: string; name: string; position: number }[] {
  const taken = [...room.teams.values()].map((t) => t.name);
  let position = Math.max(-1, ...[...room.teams.values()].map((t) => t.position)) + 1;
  const rows: { sessionId: string; name: string; position: number }[] = [];
  for (let i = 0; i < count; i++) {
    const name = nextTeamName(taken);
    taken.push(name);
    rows.push({ sessionId: room.id, name, position: position++ });
  }
  return rows;
}

// Puts a player in a team (or in none) in memory.
export const placeIn = (room: Room, p: Player, teamId: string | null) => {
  const from = teamOf(room, p);
  if (from) from.members = from.members.filter((id) => id !== p.attemptId);
  p.teamId = teamId;
  p.paper = null;
  if (teamId !== null) room.teams.get(teamId)!.members.push(p.attemptId);
};

// Deals every player into the given teams (an attempt-id list per team id); players not listed have none.
export const applyTeams = (room: Room, teams: Record<string, string[]>) => {
  for (const p of room.players.values()) {
    p.teamId = null;
    p.paper = null;
  }
  for (const team of room.teams.values()) team.members = [];
  for (const [teamId, ids] of Object.entries(teams)) for (const id of ids) placeIn(room, room.players.get(id)!, teamId);
};

export const membership = (room: Room): Record<string, string[]> =>
  Object.fromEntries([...room.teams.values()].map((t) => [t.id, [...t.members]]));

// The rows of players that are in a team, for writing to the database.
export const memberRowsOf = (room: Room, attemptIds: string[]): { attemptId: string; teamId: string }[] =>
  attemptIds.flatMap((attemptId) => {
    const teamId = room.players.get(attemptId)?.teamId;
    return teamId ? [{ attemptId, teamId }] : [];
  });

// --- Team Relay: the start ---

export type RelayPlan = { team: Team; members: string[]; password: string; pieces: string[]; slots: Map<string, TeamSlot> };

// Plans a relay's start: who plays in which team, the password and its pieces, and who answers which question.
// `problem`: what stops it, in words for the teacher. Players still without a team are placed to even out the sizes.
export function planRelayStart(room: Room): { problem: string } | { problem: null; teams: Team[]; playing: Team[]; plans: RelayPlan[] } {
  const relay = room.relay!;
  const teams = [...room.teams.values()].sort((a, b) => a.position - b.position);
  const unassigned = [...room.players.values()].filter((p) => p.teamId === null).map((p) => p.attemptId);
  let members = membership(room);
  if (unassigned.length > 0) {
    const placed = balanceTeams(members, unassigned, relay.teamSize);
    if (placed.unassigned.length > 0) return { problem: "There isn't room for everyone: add a team." };
    members = placed.teams;
  }
  const problem = teamsStartProblem(teams.map((t) => ({ name: t.name, members: members[t.id]! })), relay.teamSize);
  if (problem !== null) return { problem };
  const playing = teams.filter((t) => members[t.id]!.length > 0);
  const questionIds = room.questions.map((q) => q.id);
  const plans: RelayPlan[] = [];
  for (const team of playing) {
    const mine = members[team.id]!;
    const shares = partitionQuestions(questionIds, mine, hashSeed(`${team.id}:questions`));
    if (shares === null) return { problem: `${team.name} has more players than the quiz has questions.` };
    const password =
      room.relayPassword ??
      (relay.pieceKind === "clue" ? null : generatePassword(hashSeed(`${team.id}:password`), relay.pieceKind, questionIds.length));
    if (password === null) return { problem: "Clue pieces need a password for the clues to lead to." };
    const pieces = splitPassword(password, room.relayClues, relay.pieceKind, questionIds.length);
    const ownerOf = new Map<string, { owner: string; shareIndex: number }>();
    for (const member of mine) shares[member]!.forEach((questionId, shareIndex) => ownerOf.set(questionId, { owner: member, shareIndex }));
    // The first questions of this team's own order carry the pieces: it differs between teams.
    const slots = new Map<string, TeamSlot>();
    slotOrder(questionIds, team.id).forEach((questionId, boardIndex) => {
      const dealt = ownerOf.get(questionId)!;
      slots.set(questionId, {
        questionId,
        owner: dealt.owner,
        shareIndex: dealt.shareIndex,
        piece: boardIndex < pieces.length ? boardIndex : null,
        boardIndex,
        rescuer: null,
        rescueCorrect: null,
        rescueClaimedAt: null,
        scoring: false,
      });
    });
    plans.push({ team, members: mine, password, pieces, slots });
  }
  return { problem: null, teams, playing, plans };
}

// Puts a planned start in the room (after it was written to the database).
export function applyRelayStart(room: Room, teams: Team[], playing: Team[], plans: RelayPlan[]) {
  for (const team of teams) if (!playing.includes(team)) room.teams.delete(team.id);
  for (const p of room.players.values()) {
    p.teamId = null;
    p.paper = null;
  }
  for (const plan of plans) {
    plan.team.members = [];
    plan.team.password = plan.password;
    plan.team.pieces = plan.pieces;
    plan.team.slots = plan.slots;
    for (const id of plan.members) placeIn(room, room.players.get(id)!, plan.team.id);
  }
}

// --- Team Relay: players arriving and leaving ---

// The team a late player joins: the smallest one with a free place whose round is still on.
export const pickLateTeam = (room: Room): Team | null => {
  let best: Team | null = null;
  for (const team of [...room.teams.values()].sort((a, b) => a.position - b.position)) {
    if (team.members.length >= room.relay!.teamSize || teamOver(room, team)) continue;
    if (best === null || team.members.length < best.members.length) best = team;
  }
  return best;
};

// The newcomer takes over questions the teammates haven't been shown yet: those are dealt again among the
// teammates still playing and the newcomer, each question going to whoever has the fewest left.
export const handOver = (room: Room, team: Team, joiner: Player): SlotUpdate[] => {
  const mates = team.members.flatMap((id) => {
    const m = room.players.get(id);
    return m && !m.finished ? [m] : [];
  });
  const pool: string[] = [];
  const loads: Record<string, number> = { [joiner.attemptId]: 0 };
  const nextShare = new Map<string, number>();
  for (const m of mates) {
    const paper = paperOf(room, m);
    const shown = m.startedAt === null ? 0 : m.index + 1;
    pool.push(...paper.slice(shown).map((q) => q.id));
    const current = shown > 0 ? paper[m.index] : undefined;
    loads[m.attemptId] = current && !m.done.has(current.id) ? 1 : 0;
    const indexes = paper.slice(0, shown).map((q) => team.slots.get(q.id)?.shareIndex ?? 0);
    nextShare.set(m.attemptId, indexes.length > 0 ? Math.max(...indexes) + 1 : 0);
  }
  const updates: SlotUpdate[] = [];
  for (const [attemptId, questionIds] of Object.entries(shareOut(pool, loads))) {
    let shareIndex = nextShare.get(attemptId) ?? 0;
    for (const questionId of questionIds) {
      const slot = team.slots.get(questionId)!;
      slot.owner = attemptId;
      slot.shareIndex = shareIndex;
      updates.push({ teamId: team.id, questionId, set: { ownerAttemptId: attemptId, shareIndex } });
      shareIndex++;
    }
  }
  for (const m of mates) m.paper = null;
  joiner.paper = null;
  joiner.teamId = team.id;
  team.members.push(joiner.attemptId);
  team.proposal = null;
  return updates;
};

// A player leaves their team (kicked). Their unanswered questions go to the teammates still playing, the one
// with the fewest left first; with none to take them they have no owner (and may be rescued). A piece they
// unlocked stays unlocked. Runs with the room lock held; returns the question rows to update.
export const releaseSlots = (room: Room, p: Player): SlotUpdate[] => {
  const team = teamOf(room, p);
  if (!team) return [];
  const updates: SlotUpdate[] = [];
  const update = (slot: TeamSlot, set: SlotUpdate["set"]) => updates.push({ teamId: team.id, questionId: slot.questionId, set });
  if (room.status === "running") {
    const pool: TeamSlot[] = [];
    const mine = [...team.slots.values()].filter((s) => s.owner === p.attemptId).sort((a, b) => a.shareIndex - b.shareIndex);
    for (const slot of mine) {
      const done = p.done.get(slot.questionId);
      if (done === undefined) {
        pool.push(slot);
      } else if (done.correct === true) {
        // Kept as unlocked: the answer goes with the player, so the unlock is recorded as a rescue.
        slot.owner = null;
        slot.rescuer = null;
        slot.rescueCorrect = true;
        slot.rescueClaimedAt = slot.rescueClaimedAt ?? Date.now();
        update(slot, { ownerAttemptId: null, rescuerAttemptId: null, rescueCorrect: true, rescuePoints: 0, rescueClaimedAt: new Date(slot.rescueClaimedAt) });
      } else {
        slot.owner = null;
        update(slot, { ownerAttemptId: null });
      }
    }
    const takers = team.members.flatMap((id) => {
      const m = room.players.get(id);
      return id !== p.attemptId && m && !m.finished ? [m] : [];
    });
    if (pool.length > 0 && takers.length > 0) {
      const loads = Object.fromEntries(takers.map((m) => [m.attemptId, paperOf(room, m).filter((q) => !m.done.has(q.id)).length]));
      const given = shareOut(pool.map((s) => s.questionId), loads);
      for (const m of takers) {
        const owned = [...team.slots.values()].filter((s) => s.owner === m.attemptId).map((s) => s.shareIndex);
        let shareIndex = owned.length > 0 ? Math.max(...owned) + 1 : 0;
        for (const questionId of given[m.attemptId] ?? []) {
          const slot = team.slots.get(questionId)!;
          slot.owner = m.attemptId;
          slot.shareIndex = shareIndex;
          update(slot, { ownerAttemptId: m.attemptId, shareIndex });
          shareIndex++;
        }
        m.paper = null;
      }
    } else {
      for (const slot of pool) {
        slot.owner = null;
        update(slot, { ownerAttemptId: null });
      }
    }
    // A rescue they were answering can be claimed again; one they finished keeps its result.
    for (const slot of team.slots.values()) {
      if (slot.rescuer !== p.attemptId) continue;
      slot.rescuer = null;
      if (slot.rescueCorrect === null) {
        slot.rescueClaimedAt = null;
        update(slot, { rescuerAttemptId: null, rescueClaimedAt: null });
      } else {
        update(slot, { rescuerAttemptId: null });
      }
    }
  }
  team.members = team.members.filter((id) => id !== p.attemptId);
  team.proposal = null;
  p.teamId = null;
  room.relayVersion++;
  return updates;
};

// --- Team Relay: what stops a move ---

// Why the teams can't change now (words for the teacher), or null in the lobby of a relay.
export const lobbyProblem = (room: Room): string | null => {
  if (room.relay === null) return "This isn't a Team Relay game.";
  if (room.status === "ended") return "This game is over.";
  if (room.status === "running") return "The teams are locked: the game already started.";
  if (room.status !== "lobby") return "Open the lobby first.";
  return null;
};

// The player's team while its round is on, or why they can't play.
export const playingTeam = (room: Room, p: Player): { team: Team } | { problem: string } => {
  if (room.status === "ended") return { problem: "The game is over." };
  if (room.status !== "running") return { problem: "The game isn't running." };
  const team = teamOf(room, p);
  if (!team) return { problem: "You aren't in a team." };
  if (teamOver(room, team)) return { problem: "Your team's round is over." };
  return { team };
};
