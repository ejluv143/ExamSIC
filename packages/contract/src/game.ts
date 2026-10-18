// Game mode (Kahoot- and Wayground-style). Teacher-paced: the teacher moves the whole room through a lobby,
// question, reveal and leaderboard for each question. Student-paced: each student plays alone while a live
// leaderboard updates. The server owns the clock and the points; the browser only shows a `GameView`.
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Avatar } from "@examinus/domain/avatar";
import { GamePoints } from "@examinus/domain/kinds/base";
import { StudentQuestion } from "@examinus/domain/question";
import { AnswerValue, gameMaxSeconds, gameMinSeconds, RelayPieceKind, SessionMode, SessionPacing, SessionStatus } from "@examinus/domain/quiz";
import { Conflict, Forbidden, NotFound } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";

export const GamePhase = Schema.Literals(["lobby", "question", "reveal", "leaderboard", "ended"]);
export type GamePhase = typeof GamePhase.Type;

export const GameRow = Schema.Struct({ rank: Schema.Int, attemptId: Schema.String, name: Schema.String, avatar: Avatar, points: Schema.Int });
export type GameRow = typeof GameRow.Type;

// How the answers split after a question: one bar per choice (or per outcome for the other types).
export const GameBucket = Schema.Struct({ label: Schema.String, count: Schema.Int, correct: Schema.Boolean });
export type GameBucket = typeof GameBucket.Type;

export const GameReveal = Schema.Struct({
  buckets: Schema.Array(GameBucket),
  // The correct answer in words, for types where the buckets don't show it. null for an essay or a drawing.
  answer: Schema.NullOr(Schema.String),
  answered: Schema.Int,
});
export type GameReveal = typeof GameReveal.Type;

// What the signed-in player did with the question: shown when it closes.
export const GameLast = Schema.Struct({
  // null: nothing could be checked (a drawing).
  correct: Schema.NullOr(Schema.Boolean),
  answered: Schema.Boolean,
  earned: Schema.Int,
});
export type GameLast = typeof GameLast.Type;

export const GameMe = Schema.Struct({
  attemptId: Schema.String,
  name: Schema.String,
  avatar: Avatar,
  points: Schema.Int,
  rank: Schema.Int,
  streak: Schema.Int,
  // Whether the current question already has this player's answer.
  answered: Schema.Boolean,
  last: Schema.NullOr(GameLast),
});
export type GameMe = typeof GameMe.Type;

export const GamePlayer = Schema.Struct({ attemptId: Schema.String, name: Schema.String, avatar: Avatar, online: Schema.Boolean });
export type GamePlayer = typeof GamePlayer.Type;

export const GameRemoved = Schema.Struct({ userId: Schema.String, name: Schema.String, avatar: Avatar });
export type GameRemoved = typeof GameRemoved.Type;

// --- Team Relay ---

export const RelayMember = Schema.Struct({ attemptId: Schema.String, name: Schema.String, avatar: Avatar });
export type RelayMember = typeof RelayMember.Type;

// One team as every screen in the room sees it. Progress and points are 0 in the lobby; `password` is null until the
// team's round is over (solved, out of guesses, or the game ended), and then only for the presenter and that team.
export const RelayTeamSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  members: Schema.Array(RelayMember),
  unlocked: Schema.Int,
  pieces: Schema.Int,
  wrongGuesses: Schema.Int,
  solvedAt: Schema.NullOr(Schema.String),
  // The team's round is over: solved, out of guesses, or the time ran out.
  finished: Schema.Boolean,
  points: Schema.Int,
  rank: Schema.Int,
  password: Schema.NullOr(Schema.String),
});
export type RelayTeamSummary = typeof RelayTeamSummary.Type;

export const RelaySlotState = Schema.Literals(["unlocked", "open", "retry", "rescue", "rescuing", "locked"]);
export type RelaySlotState = typeof RelaySlotState.Type;

// One piece on the team's board. `position` (1-based place in the password) is null for a scrambled ("coordinate")
// piece until it is unlocked; `text` is null until it is unlocked.
export const RelayPiece = Schema.Struct({
  position: Schema.NullOr(Schema.Int),
  text: Schema.NullOr(Schema.String),
  owner: Schema.String,
  state: RelaySlotState,
});
export type RelayPiece = typeof RelayPiece.Type;

// A teammate's locked question this player may rescue (they finished their own questions).
export const RelayRescuable = Schema.Struct({ questionId: Schema.String, prompt: Schema.String, owner: Schema.String });
export type RelayRescuable = typeof RelayRescuable.Type;

// One question in the debrief, once the team's round is over.
export const RelayDebriefItem = Schema.Struct({
  questionId: Schema.String,
  prompt: Schema.String,
  owner: Schema.String,
  // What the owner answered, in words ("" when blank or timed out); null when they never got to it.
  answer: Schema.NullOr(Schema.String),
  correct: Schema.NullOr(Schema.Boolean),
  correctAnswer: Schema.String,
  explanation: Schema.NullOr(Schema.String),
  retries: Schema.Int,
  rescuedBy: Schema.NullOr(Schema.String),
  rescueCorrect: Schema.NullOr(Schema.Boolean),
});
export type RelayDebriefItem = typeof RelayDebriefItem.Type;

// A password a member proposed, waiting for every member to confirm it (when the teacher asked for consensus).
export const RelayProposal = Schema.Struct({
  guess: Schema.String,
  by: Schema.String,
  confirmed: Schema.Array(Schema.String),
  needed: Schema.Int,
});
export type RelayProposal = typeof RelayProposal.Type;

// The signed-in player's own team, in full.
export const RelayMyTeam = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  members: Schema.Array(RelayMember),
  // Ordered by place in the password ("letter", "word", "clue") or scrambled ("coordinate").
  board: Schema.Array(RelayPiece),
  guessesLeft: Schema.Int,
  solved: Schema.Boolean,
  finished: Schema.Boolean,
  password: Schema.NullOr(Schema.String),
  proposal: Schema.NullOr(RelayProposal),
  // The team's last checked guess, for the "wrong password" message.
  lastGuess: Schema.NullOr(Schema.Struct({ guess: Schema.String, by: Schema.String, correct: Schema.Boolean })),
  // The player may answer their current question again: tries left, and the share of the points it still earns.
  retry: Schema.NullOr(Schema.Struct({ left: Schema.Int, percent: Schema.Int })),
  rescuable: Schema.Array(RelayRescuable),
  // The question this player is rescuing (it is `GameView.question`).
  rescuing: Schema.NullOr(Schema.String),
  debrief: Schema.NullOr(Schema.Array(RelayDebriefItem)),
});
export type RelayMyTeam = typeof RelayMyTeam.Type;

export const RelayView = Schema.Struct({
  pieceKind: RelayPieceKind,
  teamSize: Schema.Int,
  studentPick: Schema.Boolean,
  retry: Schema.Boolean,
  rescue: Schema.Boolean,
  requireConsensus: Schema.Boolean,
  // When the round ends (null before the start).
  roundEndsAt: Schema.NullOr(Schema.String),
  teams: Schema.Array(RelayTeamSummary),
  // Players in no team yet (lobby).
  unassigned: Schema.Array(RelayMember),
  myTeamId: Schema.NullOr(Schema.String),
  team: Schema.NullOr(RelayMyTeam),
  // Every team's debrief, for the presenter once the game ended.
  debriefs: Schema.Array(Schema.Struct({ teamId: Schema.String, teamName: Schema.String, items: Schema.Array(RelayDebriefItem) })),
});
export type RelayView = typeof RelayView.Type;

// One screen's whole picture, sent as the first event and again whenever something it shows changes. The
// presenter (the teacher) and each player get their own: a player never sees other players' answers, and never
// sees the answer to a question before it closes.
export const GameView = Schema.Struct({
  sessionId: Schema.String,
  title: Schema.String,
  joinCode: Schema.NullOr(Schema.String),
  pacing: SessionPacing,
  status: SessionStatus,
  phase: GamePhase,
  // The question on screen (0-based) out of `questionCount`.
  questionIndex: Schema.Int,
  questionCount: Schema.Int,
  question: Schema.NullOr(StudentQuestion),
  // Signed URLs of the images on the question, by asset id.
  assetUrls: Schema.Record(Schema.String, Schema.String),
  // The server's clock, and when the question closes (null outside a question), so a browser can count down.
  serverNow: Schema.String,
  endsAt: Schema.NullOr(Schema.String),
  questionSeconds: Schema.Int,
  // Teacher-paced: the clock is stopped, with this much left on the open question.
  paused: Schema.Boolean,
  pausedRemainingMs: Schema.NullOr(Schema.Int),
  // Teacher-paced: the question's time is up but code or SQL answers are still being checked (presenter only).
  checking: Schema.Boolean,
  // The questions in play order (presenter only; players get an empty list): for jumping to one.
  outline: Schema.Array(Schema.Struct({ index: Schema.Int, prompt: Schema.String, played: Schema.Boolean })),
  showLeaderboard: Schema.Boolean,
  // Players in the room, and how many answered the current question (presenter only; players see 0).
  playerCount: Schema.Int,
  answeredCount: Schema.Int,
  // Everyone with a seat, in every phase (presenter only): `online` while one of their screens is connected.
  players: Schema.Array(GamePlayer),
  // Players the teacher removed (presenter only). `game.allowRejoin` lets them join again with the key.
  removed: Schema.Array(GameRemoved),
  reveal: Schema.NullOr(GameReveal),
  // The top of the standings. Hidden (empty) while a question is open in a teacher-paced game.
  leaderboard: Schema.Array(GameRow),
  // The signed-in player; null for the presenter, or for someone who hasn't joined.
  me: Schema.NullOr(GameMe),
  // Student-paced: the player finished every question and waits for the others.
  finished: Schema.Boolean,
  // Team Relay games only; null in a classic game.
  relay: Schema.NullOr(RelayView),
});
export type GameView = typeof GameView.Type;

// --- Results ---

export const GameStanding = Schema.Struct({
  rank: Schema.Int,
  attemptId: Schema.String,
  // Roster id of the student (e.g. "s9").
  studentId: Schema.NullOr(Schema.String),
  name: Schema.String,
  avatar: Avatar,
  points: Schema.Int,
  correct: Schema.Int,
  answered: Schema.Int,
  // Average answer time in milliseconds.
  averageMs: Schema.NullOr(Schema.Int),
  // Team Relay: the player's team name (null: classic game, or no team), and the teammates' questions they rescued.
  team: Schema.NullOr(Schema.String),
  rescues: Schema.Int,
});
export type GameStanding = typeof GameStanding.Type;

// Team Relay results for one team, best first: solved teams by solve time, then by points.
export const RelayTeamStanding = Schema.Struct({
  rank: Schema.Int,
  name: Schema.String,
  members: Schema.Array(Schema.String),
  points: Schema.Int,
  // Milliseconds from the start to the solve; null: not solved.
  solvedMs: Schema.NullOr(Schema.Int),
  wrongGuesses: Schema.Int,
  unlocked: Schema.Int,
  pieces: Schema.Int,
  password: Schema.String,
});
export type RelayTeamStanding = typeof RelayTeamStanding.Type;

export const GameStandings = Schema.Struct({
  title: Schema.String,
  questionCount: Schema.Int,
  ended: Schema.Boolean,
  standings: Schema.Array(GameStanding),
  // The signed-in student's own row (their attempt id); null for the teacher.
  myAttemptId: Schema.NullOr(Schema.String),
  // Team Relay only (empty otherwise): the teams, and the questions most often answered wrong (most first).
  teams: Schema.Array(RelayTeamStanding),
  missed: Schema.Array(Schema.Struct({ questionId: Schema.String, prompt: Schema.String, wrong: Schema.Int, answered: Schema.Int })),
});
export type GameStandings = typeof GameStandings.Type;

export const GalleryItem = Schema.Struct({ attemptId: Schema.String, name: Schema.String, value: AnswerValue });
export type GalleryItem = typeof GalleryItem.Type;

export const GameFound = Schema.Struct({
  sessionId: Schema.String,
  title: Schema.String,
  mode: SessionMode,
  pacing: SessionPacing,
  status: SessionStatus,
});
export type GameFound = typeof GameFound.Type;

// --- RPC ---

const SessionId = { sessionId: Schema.String };
const errors = Schema.Union([Forbidden, NotFound, Conflict]);

export class GameRpcs extends RpcGroup.make(
  // A student's join key to the session it opens (any mode). A classless session adds the student to its roster
  // (they need a roster entry, made when they first join a class); a class session needs them to be on it or a
  // member of its class.
  Rpc.make("find", { payload: { code: Schema.String }, success: GameFound, error: errors }),
  // The student takes a seat in the game. Conflict when the game isn't open or the late-join cutoff passed.
  Rpc.make("join", { payload: SessionId, error: errors }),
  // The player's answer to the question on screen.
  Rpc.make("answer", {
    payload: { ...SessionId, questionId: Schema.String, value: AnswerValue },
    error: errors,
  }),
  // Student-paced: starts, or moves on to the next question once this one is closed.
  Rpc.make("next", { payload: SessionId, error: errors }),
  // --- Team Relay: players ---
  // Lobby, when the teacher lets students pick: join or switch to a team that isn't full.
  Rpc.make("pickTeam", { payload: { ...SessionId, teamId: Schema.String }, error: errors }),
  // After a wrong answer, when retries are on and left: the current question opens again with a fresh clock.
  Rpc.make("retry", { payload: SessionId, error: errors }),
  // A player who finished their questions claims a teammate's locked question (first claim wins, one try each).
  Rpc.make("claimRescue", { payload: { ...SessionId, questionId: Schema.String }, error: errors }),
  // The answer to the claimed rescue question.
  Rpc.make("rescue", { payload: { ...SessionId, questionId: Schema.String, value: AnswerValue }, error: errors }),
  // The team's password guess. With consensus on it becomes a proposal every member must confirm.
  Rpc.make("submitPassword", { payload: { ...SessionId, guess: Schema.String.check(Schema.isMaxLength(200)) }, error: errors }),
  Rpc.make("confirmPassword", { payload: SessionId, error: errors }),
  Rpc.make("rejectPassword", { payload: SessionId, error: errors }),
  // --- The teacher ---
  // Opens the lobby so students can join with the code.
  Rpc.make("openLobby", { payload: SessionId, error: errors }),
  // Starts the game: the first question (teacher-paced), or everyone's play (student-paced).
  Rpc.make("start", { payload: SessionId, error: errors }),
  // Teacher-paced: closes the question now, then moves reveal, leaderboard, the next question and the podium on.
  Rpc.make("advance", { payload: SessionId, error: errors }),
  // Teacher-paced, while a question is open: stops the clock (answers are refused) and starts it again.
  Rpc.make("pause", { payload: SessionId, error: errors }),
  Rpc.make("resume", { payload: SessionId, error: errors }),
  // Teacher-paced, between questions: opens the question at `index` (0-based, not played yet) instead of the next one.
  Rpc.make("goTo", { payload: { ...SessionId, index: Schema.Int }, error: errors }),
  // Teacher-paced: seconds per question from now on. An open question keeps its start and gets the new length.
  Rpc.make("setSeconds", {
    payload: { ...SessionId, seconds: Schema.Int.check(Schema.isBetween({ minimum: gameMinSeconds, maximum: gameMaxSeconds })) },
    error: errors,
  }),
  // Ends the game now: final standings, and everything is graded.
  Rpc.make("end", { payload: SessionId, error: errors }),
  Rpc.make("kick", { payload: { ...SessionId, attemptId: Schema.String }, error: errors }),
  // --- Team Relay: the teacher, in the lobby ---
  // Puts a player in a team, or back with the unassigned (teamId null). Overrides the student's own pick.
  Rpc.make("assignTeam", { payload: { ...SessionId, attemptId: Schema.String, teamId: Schema.NullOr(Schema.String) }, error: errors }),
  // Deals every player in the lobby into the teams in a random order.
  Rpc.make("randomizeTeams", { payload: SessionId, error: errors }),
  // Evens out the team sizes with the fewest moves and places the unassigned players.
  Rpc.make("balanceTeams", { payload: SessionId, error: errors }),
  Rpc.make("addTeam", { payload: SessionId, error: errors }),
  // Its members go back to the unassigned. The last team can't be removed.
  Rpc.make("removeTeam", { payload: { ...SessionId, teamId: Schema.String }, error: errors }),
  Rpc.make("setStudentPick", { payload: { ...SessionId, allowed: Schema.Boolean }, error: errors }),
  // Lets a removed player (by user id) join again with the key. Their points from before the removal are gone.
  Rpc.make("allowRejoin", { payload: { ...SessionId, userId: Schema.String }, error: errors }),
  // Final standings for the teacher, or for a student on the roster once the game ended.
  Rpc.make("standings", { payload: SessionId, success: GameStandings, error: errors }),
  // The class gallery for one drawing question, with signed picture URLs by asset id.
  Rpc.make("gallery", {
    payload: { ...SessionId, questionId: Schema.String },
    success: Schema.Struct({ items: Schema.Array(GalleryItem), assetUrls: Schema.Record(Schema.String, Schema.String) }),
    error: errors,
  }),
)
  .prefix("game.")
  .middleware(AuthMiddleware) {}
