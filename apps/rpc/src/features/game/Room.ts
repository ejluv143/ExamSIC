// What a `Room` in memory is made of. A room is a cache of the game's rows (see RoomStore.ts); the rules that read
// and change it are in Engine.ts, what each screen sees of it in Views.ts.
import type { GameLast, GamePhase, GameRemoved, GameRow, RelayDebriefItem } from "@examinus/contract/game";
import type { QuizDetail } from "@examinus/contract/quiz";
import type { Avatar } from "@examinus/domain/avatar";
import type { Question } from "@examinus/domain/question";
import type { RelaySettings, SessionStatus } from "@examinus/domain/quiz";
import type { Semaphore } from "effect";

// Milliseconds the standings of a finished game stay in memory.
export const keepEndedMs = 30 * 60_000;
export const topRows = 20;
export const playerRows = 10;
// Signed image URLs last ten minutes; ask again after five.
export const urlsFreshMs = 5 * 60_000;
// A connected screen refreshes its presence this often; one that stops (a crashed API) drops out after `presenceTtlMs`.
export const presenceEveryMs = 10_000;
export const presenceTtlMs = 30_000;
// The least time between two guesses of a relay team's password.
export const guessGapMs = 2000;
// How long a closing teacher-paced question waits for answers still on their way: briefly for ordinary ones, long
// for code and SQL whose scoring runs on the server (runner or grader).
export const inflightWaitMs = 2000;
export const checkWaitMs = 30_000;
export const inflightPollMs = 20;

// The game's bus is a Dragonfly channel; screens of the game listen on it. Who is connected is kept there too.
export const channelOf = (sessionId: string) => `game:${sessionId}`;
export const presenceOf = (sessionId: string) => `game:${sessionId}:online`;

export type Done = { correct: boolean | null; earned: number };

export type Player = {
  attemptId: string;
  userId: string;
  name: string;
  avatar: Avatar;
  seed: number;
  points: number;
  streak: number;
  // Teacher-paced: the streak before the open question was answered. Shown while the clock runs, so the flame
  // doesn't give away whether the answer was right before the reveal.
  streakBefore: number;
  // What this player did with each question they got an answer (or a timeout) for.
  done: Map<string, Done>;
  // Student-paced: the question the player is on and when it was shown. `startedAt` null: hasn't pressed Play.
  index: number;
  startedAt: number | null;
  finished: boolean;
  paper: Question[] | null;
  // Team Relay: the team the player is in (null: none yet), and the retries used on each question.
  teamId: string | null;
  tries: Map<string, number>;
};

// One question of a relay team: who answers it, which password piece it unlocks, and a teammate's rescue of it.
export type TeamSlot = {
  questionId: string;
  // Attempt id of the member who answers it; null: nobody (they left and no teammate could take it).
  owner: string | null;
  shareIndex: number;
  piece: number | null;
  boardIndex: number;
  rescuer: string | null;
  // null while the rescuer is answering.
  rescueCorrect: boolean | null;
  rescueClaimedAt: number | null;
  // The rescue answer is being scored.
  scoring: boolean;
};

export type Team = {
  id: string;
  name: string;
  position: number;
  password: string | null;
  // The password cut into pieces (empty before the start).
  pieces: string[];
  wrongGuesses: number;
  solvedAt: number | null;
  // Attempt ids, in the order they joined.
  members: string[];
  slots: Map<string, TeamSlot>;
  lastGuessAt: number;
  lastGuess: { guess: string; by: string; correct: boolean } | null;
  // A guess waiting for every member to confirm it (attempt ids).
  proposal: { guess: string; by: string; confirmed: string[] } | null;
  debrief: { version: number; items: RelayDebriefItem[] } | null;
};

// Who a published change is for.
export type Signal = { to: "all" } | { to: "presenter" } | { to: "user"; userId: string };

export type Viewer = { kind: "presenter" } | { kind: "player"; userId: string };

export type Room = {
  id: string;
  title: string;
  pacing: "teacher" | "student";
  seconds: number;
  leaderboard: boolean;
  streakBonus: boolean;
  lateJoinMinutes: number | null;
  joinCode: string | null;
  status: SessionStatus;
  startedAt: number | null;
  endedAt: number | null;
  detail: QuizDetail;
  seed: number;
  // The questions in the order of `seed`: the order of a teacher-paced game.
  questions: Question[];
  byId: Map<string, Question>;
  phase: GamePhase;
  index: number;
  questionStartedAt: number | null;
  // Teacher-paced: the clock stopped at this time (quiz_sessions.paused_at); resuming moves questionStartedAt on.
  pausedAt: number | null;
  // Teacher-paced: indexes (in `questions`) that were opened, so a jump can't replay one.
  played: Set<number>;
  // The question is being closed: answers are refused, those already in flight finish.
  closing: boolean;
  inflight: number;
  players: Map<string, Player>;
  byUser: Map<string, Player>;
  // Attempt ids that answered the open teacher-paced question.
  answeredNow: Set<string>;
  // How the open (or just closed) question's answers split, by choice id or outcome.
  tally: Map<string, number>;
  // What each player did on the question that just closed (teacher-paced).
  lastResult: Map<string, GameLast>;
  // Standings as of now (student-paced) or as of the last closed question (teacher-paced).
  board: GameRow[];
  ranks: Map<string, { rank: number; points: number }>;
  boardDirty: boolean;
  presenterDirty: boolean;
  // Held while the room's phase or teams change; each room has its own.
  lock: Semaphore.Semaphore;
  // Players the teacher removed, by user id, until they are allowed back.
  removed: Map<string, GameRemoved>;
  // Team Relay: its settings (null: a classic game), the teacher's password and clues, and the teams.
  relay: RelaySettings | null;
  relayPassword: string | null;
  relayClues: string[];
  teams: Map<string, Team>;
  // Counts the changes to the teams' answers, so a debrief is only built again when something changed.
  relayVersion: number;
};
