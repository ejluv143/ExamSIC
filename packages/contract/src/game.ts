// Game mode (Kahoot- and Wayground-style). Teacher-paced: the teacher moves the whole room through a lobby,
// question, reveal and leaderboard for each question. Student-paced: each student plays alone while a live
// leaderboard updates. The server owns the clock and the points; the browser only shows a `GameView`.
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Conflict, Forbidden, NotFound } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";
import { GamePoints, StudentQuestion, type QuestionType } from "./question.ts";
import { AnswerValue, SessionMode, SessionPacing, SessionStatus } from "./quiz.ts";

// --- Points ---

export const gameBasePoints: Record<GamePoints, number> = { standard: 1000, double: 2000, none: 0 };
export const streakBonusStep = 100;
export const streakBonusMax = 500;
// Answers that arrive a moment after the timer still count, at the lowest speed score (slow connections).
export const gameGraceMs = 1500;

export type GameAnswerPoints = {
  // Speed points plus the streak bonus: what the player's total goes up by.
  earned: number;
  bonus: number;
  // The streak after this answer (a question worth no points leaves it alone).
  streak: number;
};

// A correct answer earns `base * (1 - elapsed / limit / 2)`: full points at once, half at the last moment. A
// partly correct answer earns that share of it and breaks the streak. Fully correct answers after the first in a
// row add +100 each, up to +500. A wrong answer earns 0 and breaks the streak. `none` questions earn nothing.
export function gameAnswerPoints(input: {
  gamePoints: GamePoints;
  // Fraction correct, 0 to 1 (null: couldn't be checked, counts as wrong).
  fraction: number | null;
  elapsedMs: number;
  limitMs: number;
  // The streak before this answer.
  streak: number;
  streakBonus: boolean;
}): GameAnswerPoints {
  const base = gameBasePoints[input.gamePoints];
  if (base === 0) return { earned: 0, bonus: 0, streak: input.streak };
  const fraction = Math.min(Math.max(input.fraction ?? 0, 0), 1);
  if (fraction === 0) return { earned: 0, bonus: 0, streak: 0 };
  const elapsed = Math.min(Math.max(input.elapsedMs, 0), input.limitMs);
  const speed = Math.round(base * (1 - elapsed / input.limitMs / 2) * fraction);
  if (fraction < 1) return { earned: speed, bonus: 0, streak: 0 };
  const bonus = input.streakBonus ? Math.min(input.streak * streakBonusStep, streakBonusMax) : 0;
  return { earned: speed + bonus, bonus, streak: input.streak + 1 };
}

// --- Which questions a game can run ---

// What stops a quiz from being played as a game: essays need a teacher to read them, code needs time to run so
// only a student-paced game takes it, and a drawing can't be scored for speed so it runs as "No points" (shown to
// the class as a gallery).
export function gameQuestionProblems(
  pacing: "teacher" | "student",
  questions: readonly { type: QuestionType; gamePoints: GamePoints }[],
): string[] {
  const problems: string[] = [];
  if (questions.length === 0) problems.push("The quiz has no questions.");
  if (questions.some((q) => q.type === "essay")) problems.push("A game can't have essay questions: remove them or use another mode.");
  if (pacing === "teacher" && questions.some((q) => q.type === "code"))
    problems.push("Code questions only work in a student-paced game, because running code takes time.");
  if (questions.some((q) => q.type === "drawing" && q.gamePoints !== "none"))
    problems.push('Drawing questions must be set to "No points" in a game; the class sees them as a gallery.');
  return problems;
}

// --- What a screen shows ---

export const GamePhase = Schema.Literals(["lobby", "question", "reveal", "leaderboard", "ended"]);
export type GamePhase = typeof GamePhase.Type;

export const GameRow = Schema.Struct({ rank: Schema.Int, attemptId: Schema.String, name: Schema.String, points: Schema.Int });
export type GameRow = typeof GameRow.Type;

// How the answers split after a question: one bar per choice (or per outcome for the other types).
export const GameBucket = Schema.Struct({ label: Schema.String, count: Schema.Int, correct: Schema.Boolean });
export type GameBucket = typeof GameBucket.Type;

export const GameReveal = Schema.Struct({
  buckets: Schema.Array(GameBucket),
  // The correct answer in words, for types where the buckets don't show it. null for a drawing.
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
  points: Schema.Int,
  rank: Schema.Int,
  streak: Schema.Int,
  // Whether the current question already has this player's answer.
  answered: Schema.Boolean,
  last: Schema.NullOr(GameLast),
});
export type GameMe = typeof GameMe.Type;

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
  showLeaderboard: Schema.Boolean,
  // Players in the room, and how many answered the current question (presenter only; players see 0).
  playerCount: Schema.Int,
  answeredCount: Schema.Int,
  // Who joined (presenter, in the lobby only).
  lobby: Schema.Array(Schema.Struct({ attemptId: Schema.String, name: Schema.String })),
  reveal: Schema.NullOr(GameReveal),
  // The top of the standings. Hidden (empty) while a question is open in a teacher-paced game.
  leaderboard: Schema.Array(GameRow),
  // The signed-in player; null for the presenter, or for someone who hasn't joined.
  me: Schema.NullOr(GameMe),
  // Student-paced: the player finished every question and waits for the others.
  finished: Schema.Boolean,
});
export type GameView = typeof GameView.Type;

// --- Results ---

export const GameStanding = Schema.Struct({
  rank: Schema.Int,
  attemptId: Schema.String,
  // Roster id of the student (e.g. "s9").
  studentId: Schema.NullOr(Schema.String),
  name: Schema.String,
  points: Schema.Int,
  correct: Schema.Int,
  answered: Schema.Int,
  // Average answer time in milliseconds.
  averageMs: Schema.NullOr(Schema.Int),
});
export type GameStanding = typeof GameStanding.Type;

export const GameStandings = Schema.Struct({
  title: Schema.String,
  questionCount: Schema.Int,
  ended: Schema.Boolean,
  standings: Schema.Array(GameStanding),
  // The signed-in student's own row (their attempt id); null for the teacher.
  myAttemptId: Schema.NullOr(Schema.String),
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
  // A student's join code to the session it opens (any mode), if the student is on its roster.
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
  // --- The teacher ---
  // Opens the lobby so students can join with the code.
  Rpc.make("openLobby", { payload: SessionId, error: errors }),
  // Starts the game: the first question (teacher-paced), or everyone's play (student-paced).
  Rpc.make("start", { payload: SessionId, error: errors }),
  // Teacher-paced: closes the question now, then moves reveal, leaderboard, the next question and the podium on.
  Rpc.make("advance", { payload: SessionId, error: errors }),
  // Ends the game now: final standings, and everything is graded.
  Rpc.make("end", { payload: SessionId, error: errors }),
  Rpc.make("kick", { payload: { ...SessionId, attemptId: Schema.String }, error: errors }),
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
