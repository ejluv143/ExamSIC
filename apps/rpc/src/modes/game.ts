// Game mode: Kahoot-style (teacher-paced) and Wayground-style (student-paced) live games.
//
// Where the state lives. The position of a teacher-paced game (phase, question, when it opened) is on
// `quiz_sessions`; each player's points and streak are on `attempts`; every answer is an `answers` row with the
// points it earned. A `Room` in memory is a cache of that, rebuilt from the database the first time anything
// touches the session after a restart, so the same question carries on with the time it had left. Screens get a
// `GameView` from the room and never see more than their role allows.
import {
  Conflict,
  Forbidden,
  NotFound,
  relayPasswordProblem,
  relaySettingsProblem,
  answerKey,
  answerText as valueText,
  balanceTeams,
  generatePassword,
  idRandom,
  nextTeamName,
  normalizePassword,
  partitionQuestions,
  randomizeTeams,
  relayLimits,
  relayTeamPoints,
  rescuePoints,
  retryPoints,
  shareOut,
  shuffled,
  slotOrder,
  slotState,
  splitPassword,
  teamsStartProblem,
  assetIdsIn,
  autoScore,
  blankKey,
  gameAnswerPoints,
  gameGraceMs,
  gameQuestionProblems,
  paperRandom,
  toStudentQuestion,
  type AnswerValue,
  type Avatar,
  type CodeTestResult,
  type GalleryItem,
  type GameBucket,
  type GameLast,
  type GamePhase,
  type GameRow,
  type GameStanding,
  type GameRemoved,
  type GameStandings,
  type GameView,
  type Question,
  type RelayDebriefItem,
  type RelayMember,
  type RelayMyTeam,
  type RelayPiece,
  type RelayRescuable,
  type RelaySettings,
  type RelayView,
  type SlotState,
  type QuizDetail,
  type SessionStatus,
  type SessionUser,
  type SqlSampleResult,
  type StudentQuestion,
  normalizeJoinKey,
} from "@examinus/contract";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { Context, Deferred, Effect, Layer, Schedule, Semaphore, Stream } from "effect";
import { Assets } from "../Assets.ts";
import { avatarOf } from "../features/auth/avatar.ts";
import { Cache } from "../platform/Cache.ts";
import { Database } from "../platform/Database.ts";
import {
  answers,
  attempts,
  classMembers,
  quizSessions,
  quizzes,
  sessionStudents,
  sessionTeamGuesses,
  sessionTeamMembers,
  sessionTeamQuestions,
  sessionTeams,
  students,
  users,
} from "../database/schemas/index.ts";
import { LiveHub } from "../features/live/Service.ts";
import { LiveBus } from "../platform/LiveBus.ts";
import { keepOwnPictures } from "../features/attempt/Repo.ts";
import { attemptPaper, cleanAnswer, flatQuestions } from "../features/attempt/rules.ts";
import { AttemptService } from "../features/attempt/Service.ts";
import { loadQuizDetail } from "../features/quiz/Repo.ts";
import { toSession } from "../features/session/mappers.ts";
import { Runner } from "../platform/Runner.ts";
import { runSqlChecks, sampleResult } from "../platform/sql-grader.ts";

// Seconds the standings of a finished game stay in memory.
const keepEndedMs = 30 * 60_000;
const topRows = 20;
const playerRows = 10;
// Signed image URLs last ten minutes; ask again after five.
const urlsFreshMs = 5 * 60_000;
// A connected screen refreshes its presence this often; one that stops (a crashed API) drops out after `presenceTtlMs`.
const presenceEveryMs = 10_000;
const presenceTtlMs = 30_000;

type Done = { correct: boolean | null; earned: number };

type Player = {
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
type TeamSlot = {
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

type Team = {
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

// A change to one row of `session_team_questions`.
type SlotUpdate = { teamId: string; questionId: string; set: Partial<typeof sessionTeamQuestions.$inferInsert> };

// Who a published change is for.
type Signal = { to: "all" } | { to: "presenter" } | { to: "user"; userId: string };

type Extras = { sample: SqlSampleResult | null; urls: Record<string, string> };

type Room = {
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
  lock: Semaphore.Semaphore;
  // Question extras being looked up right now, so every screen asking at once shares one lookup (the result itself
  // is cached in Dragonfly).
  pending: Map<string, Deferred.Deferred<Extras>>;
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

export type Viewer = { kind: "presenter" } | { kind: "player"; userId: string };

const hashSeed = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 1) || 1;
};

const noGame = new NotFound({ message: "That game doesn't exist." });

// --- How answers split ---

const outcomeLabels = { ok: "Correct", part: "Partly correct", bad: "Wrong" } as const;

function tallyKeys(q: Question, value: AnswerValue, fraction: number | null): string[] {
  switch (q.type) {
    case "multiple_choice":
      return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    case "true_false":
      return typeof value === "boolean" ? [value ? "true" : "false"] : [];
    case "drawing":
    case "essay":
      return [];
    default:
      return [fraction === 1 ? "ok" : fraction !== null && fraction > 0 ? "part" : "bad"];
  }
}

function buckets(q: Question, tally: ReadonlyMap<string, number>, unanswered: number): GameBucket[] {
  const n = (key: string) => tally.get(key) ?? 0;
  let out: GameBucket[];
  switch (q.type) {
    case "multiple_choice":
      out = q.choices.map((c) => ({ label: c.text || "(image)", count: n(c.id), correct: q.correctChoiceIds.includes(c.id) }));
      break;
    case "true_false":
      out = [
        { label: "True", count: n("true"), correct: q.answer },
        { label: "False", count: n("false"), correct: !q.answer },
      ];
      break;
    case "drawing":
    case "essay":
      return [];
    default:
      out = [
        { label: outcomeLabels.ok, count: n("ok"), correct: true },
        { label: outcomeLabels.part, count: n("part"), correct: false },
        { label: outcomeLabels.bad, count: n("bad"), correct: false },
      ];
  }
  return unanswered > 0 ? [...out, { label: "No answer", count: unanswered, correct: false }] : out;
}

const first = (alternatives: string) => alternatives.split("|")[0]!.trim();

// The first line of the prompt, cut short, for the presenter's question list (blanks hide the answers).
function promptOf(q: Question): string {
  const line = q.prompt.replace(/\{\{[^}]*\}\}/g, "____").split("\n").find((l) => l.trim() !== "") ?? "";
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}

// The right answer in words, for the types whose bars don't show it.
function answerText(q: Question): string | null {
  switch (q.type) {
    case "multiple_choice":
      return q.choices.filter((c) => q.correctChoiceIds.includes(c.id)).map((c) => c.text || "(image)").join(", ");
    case "true_false":
      return q.answer ? "True" : "False";
    case "blank":
      return blankKey(q).map((accepted) => accepted[0] ?? "").join(", ");
    case "numeric":
      return `${q.answer}${q.unit ? ` ${q.unit}` : ""}`;
    case "enumeration":
      return q.items.map(first).join(", ");
    case "matching":
      return q.left.map((l) => `${l.text} → ${q.right.find((r) => r.id === l.rightId)?.text ?? ""}`).join("; ");
    case "categorization":
      return q.categories
        .map((c) => `${c.name}: ${q.items.filter((i) => i.categoryId === c.id).map((i) => i.text || "(image)").join(", ")}`)
        .join("; ");
    case "ordering":
      return q.items.map((i) => i.text || "(image)").join(" → ");
    case "hotspot":
      return q.regions.map((r, i) => r.label || `Area ${i + 1}`).join(", ");
    case "sql":
      return q.answerSql;
    default:
      return null;
  }
}

const isBlank = (value: AnswerValue) => typeof value !== "string" || value.trim() === "";

export class Game extends Context.Service<
  Game,
  {
    // Fails with Conflict listing what stops this quiz from being a game with this pacing.
    readonly validate: (quizId: string, pacing: "teacher" | "student", relay?: boolean) => Effect.Effect<void, Conflict>;
    // The open session a join key opens, or NotFound. `guestsAllowed`: a guest may play it (a game without a class
    // whose teacher allowed guests).
    readonly lookup: (code: string) => Effect.Effect<{ sessionId: string; title: string; guestsAllowed: boolean }, NotFound>;
    readonly find: (user: SessionUser, code: string) => Effect.Effect<
      { sessionId: string; title: string; mode: typeof quizSessions.$inferSelect.mode; pacing: "teacher" | "student"; status: SessionStatus },
      NotFound | Conflict
    >;
    readonly isRostered: (sessionId: string, userId: string) => Effect.Effect<boolean>;
    readonly join: (userId: string, sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly answer: (userId: string, sessionId: string, questionId: string, value: AnswerValue) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly next: (userId: string, sessionId: string) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly openLobby: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly start: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly advance: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly pause: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly unpause: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly goTo: (sessionId: string, index: number) => Effect.Effect<void, NotFound | Conflict>;
    readonly setSeconds: (sessionId: string, seconds: number) => Effect.Effect<void, NotFound | Conflict>;
    readonly applySettings: (sessionId: string) => Effect.Effect<void>;
    readonly end: (sessionId: string) => Effect.Effect<void, NotFound>;
    readonly kick: (sessionId: string, attemptId: string) => Effect.Effect<void, NotFound>;
    readonly allowRejoin: (sessionId: string, userId: string) => Effect.Effect<void, NotFound>;
    // --- Team Relay: players ---
    readonly pickTeam: (userId: string, sessionId: string, teamId: string) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly retry: (userId: string, sessionId: string) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly claimRescue: (userId: string, sessionId: string, questionId: string) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly rescue: (userId: string, sessionId: string, questionId: string, value: AnswerValue) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly submitPassword: (userId: string, sessionId: string, guess: string) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly confirmPassword: (userId: string, sessionId: string) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly rejectPassword: (userId: string, sessionId: string) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    // --- Team Relay: the teacher, in the lobby ---
    readonly assignTeam: (sessionId: string, attemptId: string, teamId: string | null) => Effect.Effect<void, NotFound | Conflict>;
    readonly randomizeTeams: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly balanceTeams: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly addTeam: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly removeTeam: (sessionId: string, teamId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly setStudentPick: (sessionId: string, allowed: boolean) => Effect.Effect<void, NotFound | Conflict>;
    // A player saved a new avatar: the games they're in show it.
    readonly avatarChanged: (userId: string, avatar: Avatar) => Effect.Effect<void>;
    readonly standings: (sessionId: string, userId: string | null) => Effect.Effect<GameStandings, NotFound>;
    readonly gallery: (
      sessionId: string,
      questionId: string,
      teacher: SessionUser,
    ) => Effect.Effect<{ items: GalleryItem[]; assetUrls: Record<string, string> }, NotFound>;
    readonly stream: (sessionId: string, viewer: Viewer) => Stream.Stream<GameView>;
    // Background job (twice a second): closes questions whose time is up, times out slow players, and sends the
    // standings and the answer counts that changed.
    readonly tick: Effect.Effect<void>;
    // Loads the games that were running when the API stopped.
    readonly resume: Effect.Effect<void>;
  }
>()("examinus/api/Game") {
  static readonly layer = Layer.effect(
    Game,
    Effect.gen(function* () {
      const db = yield* Database;
      const attemptService = yield* AttemptService;
      const bus = yield* LiveBus;
      const runner = yield* Runner;
      const assets = yield* Assets;
      const hub = yield* LiveHub;
      const cache = yield* Cache;
      // The game's bus is a Dragonfly channel; screens of the game listen on it. Who is connected is kept there too.
      const channelOf = (sessionId: string) => `game:${sessionId}`;
      const presenceOf = (sessionId: string) => `game:${sessionId}:online`;

      const rooms = new Map<string, Room>();
      const loadLock = Semaphore.makeUnsafe(1);

      // --- Loading a room from the database ---

      const load = Effect.fn("Game.load")(function* (sessionId: string) {
        const [head] = yield* db.query((d) =>
          d
            .select({ session: quizSessions, quiz: quizzes })
            .from(quizSessions)
            .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
            .where(eq(quizSessions.id, sessionId)),
        );
        if (!head || head.session.mode !== "game") return null;
        const { session } = head;
        const detail = yield* db.query((d) => loadQuizDetail(d, head.quiz));
        const seed = hashSeed(session.id);
        // A relay deals out the whole quiz, so its questions are never drawn from a pool.
        const questions = flatQuestions(session.relay ? detail.parts : attemptPaper(detail, seed));
        const rows = yield* db.query((d) =>
          d
            .select({ attempt: attempts, name: users.name, avatar: users.avatar })
            .from(attempts)
            .innerJoin(users, eq(attempts.studentId, users.id))
            .where(eq(attempts.sessionId, sessionId)),
        );
        const done = yield* db.query((d) =>
          d
            .select({
              attemptId: answers.attemptId,
              questionId: answers.questionId,
              correct: answers.correct,
              earned: answers.gamePointsEarned,
              tries: answers.tries,
              answeredAt: answers.answeredAt,
            })
            .from(answers)
            .innerJoin(attempts, eq(answers.attemptId, attempts.id))
            .where(and(eq(attempts.sessionId, sessionId), sql`${answers.gamePointsEarned} is not null`)),
        );
        const removedRows = yield* db.query((d) =>
          d
            .select({ userId: sessionStudents.studentId, name: users.name, avatar: users.avatar })
            .from(sessionStudents)
            .innerJoin(users, eq(sessionStudents.studentId, users.id))
            .where(and(eq(sessionStudents.sessionId, sessionId), isNotNull(sessionStudents.removedAt))),
        );
        const pacing = session.pacing;
        const room: Room = {
          id: session.id,
          title: head.quiz.title,
          pacing,
          seconds: session.gameQuestionSeconds,
          leaderboard: session.gameLeaderboard,
          streakBonus: session.gameStreakBonus,
          lateJoinMinutes: session.lateJoinMinutes,
          joinCode: session.joinCode,
          status: session.status,
          startedAt: session.startedAt?.getTime() ?? null,
          endedAt: session.endedAt?.getTime() ?? null,
          detail,
          seed,
          questions,
          byId: new Map(flatQuestions(detail.parts).map((q) => [q.id, q])),
          phase: session.gamePhase ?? (session.status === "ended" ? "ended" : "lobby"),
          index: session.currentQuestionIndex ?? 0,
          questionStartedAt: session.questionStartedAt?.getTime() ?? null,
          pausedAt: session.gamePhase === "question" ? (session.pausedAt?.getTime() ?? null) : null,
          played: new Set(),
          closing: false,
          inflight: 0,
          players: new Map(),
          byUser: new Map(),
          answeredNow: new Set(),
          tally: new Map(),
          lastResult: new Map(),
          board: [],
          ranks: new Map(),
          boardDirty: false,
          presenterDirty: false,
          lock: Semaphore.makeUnsafe(1),
          pending: new Map(),
          removed: new Map(removedRows.map((r) => [r.userId, { userId: r.userId, name: r.name, avatar: avatarOf(r.userId, r.avatar) }])),
          relay: session.relay,
          relayPassword: session.relayPassword,
          relayClues: session.relayClues,
          teams: new Map(),
          relayVersion: 0,
        };
        for (const { attempt, name, avatar } of rows) {
          const p: Player = {
            attemptId: attempt.id,
            userId: attempt.studentId,
            name,
            avatar: avatarOf(attempt.studentId, avatar),
            seed: attempt.seed,
            points: attempt.points,
            streak: attempt.gameStreak,
            streakBefore: attempt.gameStreak,
            done: new Map(),
            index: attempt.questionIndex,
            startedAt: pacing === "student" ? (attempt.questionStartedAt?.getTime() ?? null) : null,
            finished: attempt.status !== "in_progress" && pacing === "student",
            paper: null,
            teamId: null,
            tries: new Map(),
          };
          room.players.set(p.attemptId, p);
          room.byUser.set(p.userId, p);
        }
        for (const r of done) {
          const p = room.players.get(r.attemptId);
          if (!p) continue;
          p.done.set(r.questionId, { correct: r.correct, earned: r.earned ?? 0 });
          if (r.tries > 0) p.tries.set(r.questionId, r.tries);
        }
        if (pacing === "teacher") {
          // Questions answered by anyone were played; so was the one on screen.
          const answeredIds = new Set(done.map((r) => r.questionId));
          questions.forEach((q, i) => answeredIds.has(q.id) && room.played.add(i));
          if (room.phase !== "lobby" && room.phase !== "ended") room.played.add(room.index);
        }
        // The open or just closed question of a teacher-paced game: who answered it and how the answers split.
        const current = pacing === "teacher" && (room.phase === "question" || room.phase === "reveal") ? questions[room.index] : undefined;
        if (current) {
          const values = yield* db.query((d) =>
            d
              .select({ attemptId: answers.attemptId, value: answers.value, autoScore: answers.autoScore, earned: answers.gamePointsEarned, correct: answers.correct })
              .from(answers)
              .innerJoin(attempts, eq(answers.attemptId, attempts.id))
              .where(and(eq(attempts.sessionId, sessionId), eq(answers.questionId, current.id), sql`${answers.gamePointsEarned} is not null`)),
          );
          for (const v of values) {
            room.answeredNow.add(v.attemptId);
            for (const key of tallyKeys(current, v.value, v.autoScore)) room.tally.set(key, (room.tally.get(key) ?? 0) + 1);
            room.lastResult.set(v.attemptId, { correct: v.correct, answered: true, earned: v.earned ?? 0 });
          }
        }
        if (session.relay) {
          yield* loadTeams(room);
          // A retry in progress: the question was opened again after its answer.
          const reopened = new Map(rows.map((r) => [r.attempt.id, r.attempt.questionStartedAt]));
          for (const r of done) {
            const p = room.players.get(r.attemptId);
            const reopenedAt = reopened.get(r.attemptId);
            if (!p || p.finished || !reopenedAt) continue;
            if (paperOf(room, p)[p.index]?.id === r.questionId && reopenedAt.getTime() > r.answeredAt.getTime()) p.done.delete(r.questionId);
          }
        }
        recomputeBoard(room);
        return room;
      });

      // The room of a game, loaded on first use.
      const roomOf = Effect.fn("Game.roomOf")(function* (sessionId: string) {
        const known = rooms.get(sessionId);
        if (known) return known;
        return yield* loadLock.withPermits(1)(
          Effect.gen(function* () {
            const again = rooms.get(sessionId);
            if (again) return again;
            const room = yield* load(sessionId);
            if (room) rooms.set(sessionId, room);
            return room;
          }),
        );
      });

      const needRoom = Effect.fn("Game.needRoom")(function* (sessionId: string) {
        return (yield* roomOf(sessionId)) ?? (yield* noGame);
      });

      // --- Standings ---

      function recomputeBoard(room: Room) {
        const sorted = [...room.players.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
        room.ranks.clear();
        room.board = [];
        let rank = 0;
        let previous = -1;
        sorted.forEach((p, i) => {
          if (p.points !== previous) {
            rank = i + 1;
            previous = p.points;
          }
          room.ranks.set(p.attemptId, { rank, points: p.points });
          if (i < topRows) room.board.push({ rank, attemptId: p.attemptId, name: p.name, avatar: p.avatar, points: p.points });
        });
        room.boardDirty = false;
      }

      const publish = (room: Room, signal: Signal) => bus.publish(channelOf(room.id), signal);

      // --- The questions as screens see them ---

      // When a question opens every screen asks at once: one lookup (a grader run for SQL, signed image URLs) serves
      // them all, and its result is cached in Dragonfly for five minutes (the signed URLs last ten). The lookup runs to
      // the end even if the screen that started it goes away, so no one waits forever.
      const extrasOf = (room: Room, q: Question): Effect.Effect<Extras> =>
        Effect.uninterruptible(
          Effect.gen(function* () {
            const key = `game-extras:${room.id}:${q.id}`;
            const cached = yield* cache.getJson<Extras>(key);
            if (cached) return cached;
            const inFlight = room.pending.get(q.id);
            if (inFlight) return yield* Deferred.await(inFlight);
            const ready = Deferred.makeUnsafe<Extras>();
            room.pending.set(q.id, ready);
            const exit = yield* Effect.exit(
              Effect.gen(function* () {
                const student = toStudentQuestion(q);
                const sample = q.type === "sql" ? yield* sampleResult(cache, q).pipe(Effect.catchDefect(() => Effect.succeed(null))) : null;
                const urls = yield* assets.paperUrls("", assetIdsIn(JSON.stringify(student)));
                const extras = { sample, urls } satisfies Extras;
                yield* cache.setJson(key, extras, urlsFreshMs);
                return extras;
              }),
            );
            room.pending.delete(q.id);
            yield* Deferred.done(ready, exit);
            return yield* exit;
          }),
        );

      const studentQuestion = Effect.fn("Game.studentQuestion")(function* (room: Room, q: Question, seed: number) {
        const extras = yield* extrasOf(room, q);
        const student = toStudentQuestion(q, paperRandom(room.detail.quiz.settings, seed, q.id));
        const question: StudentQuestion = q.type === "sql" && extras.sample ? { ...(student as StudentQuestion & { type: "sql" }), sampleResult: extras.sample } : student;
        return { question, urls: extras.urls };
      });

      const paperOf = (room: Room, p: Player) =>
        (p.paper ??= room.relay !== null ? relayPaper(room, p) : room.pacing === "teacher" ? room.questions : flatQuestions(attemptPaper(room.detail, p.seed)));

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

      // --- The view of one screen ---

      const viewFor = Effect.fn("Game.view")(function* (room: Room, viewer: Viewer) {
        const now = Date.now();
        const player = viewer.kind === "player" ? room.byUser.get(viewer.userId) : undefined;
        const presenter = viewer.kind === "presenter";
        const teacherPaced = room.pacing === "teacher";
        const count =
          player !== undefined && room.relay !== null && room.status === "running" ? paperOf(room, player).length : room.questions.length;
        let phase: GamePhase = room.phase;
        let index = room.index;
        let question: StudentQuestion | null = null;
        let urls: Record<string, string> = {};
        let endsAt: number | null = null;
        let reveal: GameView["reveal"] = null;
        let finished = false;
        let showBoard = false;
        let last: GameLast | null = null;
        let answered = false;
        const myTeam = player !== undefined && room.relay !== null ? teamOf(room, player) : undefined;
        const rescueSlot =
          player !== undefined && myTeam !== undefined
            ? [...myTeam.slots.values()].find((s) => s.rescuer === player.attemptId && s.rescueCorrect === null)
            : undefined;

        if (room.status === "ended" || room.phase === "ended") {
          phase = "ended";
          showBoard = true;
        } else if (teacherPaced) {
          if (room.status !== "running") phase = "lobby";
          if (phase === "question" || phase === "reveal") {
            const q = room.questions[room.index];
            if (q) {
              const served = yield* studentQuestion(room, q, room.seed);
              question = served.question;
              urls = served.urls;
              if (phase === "question" && room.questionStartedAt !== null) endsAt = room.questionStartedAt + room.seconds * 1000;
              if (phase === "reveal")
                reveal = {
                  buckets: buckets(q, room.tally, Math.max(room.players.size - room.answeredNow.size, 0)),
                  answer: answerText(q),
                  answered: room.answeredNow.size,
                };
            }
          }
          showBoard = phase === "leaderboard";
          if (player) {
            answered = room.answeredNow.has(player.attemptId);
            if (phase === "reveal" || phase === "leaderboard")
              last = room.lastResult.get(player.attemptId) ?? { correct: false, answered: false, earned: 0 };
          }
        } else if (presenter) {
          phase = room.status === "running" ? "leaderboard" : "lobby";
          showBoard = true;
        } else if (player && myTeam && room.status === "running" && teamOver(room, myTeam, now)) {
          // The team's round is over: the debrief and the standings are what is left to see.
          phase = "leaderboard";
          finished = true;
          showBoard = true;
        } else if (player && rescueSlot && room.status === "running") {
          // A teammate's question this player claimed: it has the normal question clock.
          phase = "leaderboard";
          const q = room.byId.get(rescueSlot.questionId);
          if (q) {
            const served = yield* studentQuestion(room, q, player.seed);
            question = served.question;
            urls = served.urls;
            phase = "question";
            endsAt = (rescueSlot.rescueClaimedAt ?? now) + room.seconds * 1000;
            index = Math.max(count - 1, 0);
          }
          showBoard = true;
        } else if (room.status !== "running" || !player || player.startedAt === null) {
          phase = "lobby";
        } else if (player.finished) {
          phase = "leaderboard";
          finished = true;
          showBoard = true;
        } else {
          const paper = paperOf(room, player);
          const q = paper[player.index];
          index = player.index;
          if (q) {
            const served = yield* studentQuestion(room, q, player.seed);
            question = served.question;
            urls = served.urls;
            const mine = player.done.get(q.id);
            answered = mine !== undefined;
            if (mine) {
              phase = "reveal";
              last = { correct: mine.correct, answered: true, earned: mine.earned };
              reveal = { buckets: [], answer: room.relay !== null ? null : answerText(q), answered: 1 };
            } else {
              phase = "question";
              endsAt = (player.startedAt ?? now) + room.seconds * 1000;
            }
          }
          showBoard = true;
        }

        const ranked = player ? room.ranks.get(player.attemptId) : undefined;
        const me = player
          ? {
              attemptId: player.attemptId,
              name: player.name,
              avatar: player.avatar,
              points: teacherPaced ? (ranked?.points ?? 0) : player.points,
              rank: ranked?.rank ?? room.players.size,
              streak: teacherPaced && phase === "question" ? player.streakBefore : player.streak,
              answered,
              last,
            }
          : null;
        const relayView = room.relay !== null ? yield* relayViewOf(room, viewer, player, rescueSlot, now) : null;
        return {
          sessionId: room.id,
          title: room.title,
          joinCode: room.joinCode,
          pacing: room.pacing,
          status: room.status,
          phase,
          questionIndex: index,
          questionCount: count,
          question,
          assetUrls: urls,
          serverNow: new Date(now).toISOString(),
          endsAt: endsAt === null ? null : new Date(endsAt).toISOString(),
          questionSeconds: room.seconds,
          paused: teacherPaced && phase === "question" && room.pausedAt !== null,
          pausedRemainingMs:
            teacherPaced && phase === "question" && room.pausedAt !== null && endsAt !== null ? Math.max(0, endsAt - room.pausedAt) : null,
          outline: presenter && teacherPaced ? room.questions.map((q, i) => ({ index: i, prompt: promptOf(q), played: room.played.has(i) })) : [],
          showLeaderboard: room.leaderboard,
          playerCount: room.players.size,
          answeredCount: presenter ? (teacherPaced ? room.answeredNow.size : [...room.players.values()].filter((p) => p.finished).length) : 0,
          players: presenter
            ? yield* cache.members(presenceOf(room.id)).pipe(
                Effect.map((members) => {
                  const online = new Set(members.map((m) => m.slice(0, m.lastIndexOf(":"))));
                  return [...room.players.values()].map((p) => ({
                    attemptId: p.attemptId,
                    name: p.name,
                    avatar: p.avatar,
                    online: online.has(p.userId),
                  }));
                }),
              )
            : [],
          removed: presenter ? [...room.removed.values()] : [],
          reveal,
          leaderboard: showBoard ? room.board.slice(0, presenter ? topRows : playerRows) : [],
          me,
          finished,
          relay: relayView,
        } satisfies GameView;
      });

      const stream = (sessionId: string, viewer: Viewer): Stream.Stream<GameView> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const room = yield* roomOf(sessionId);
            if (!room) return Stream.empty;
            // Subscribe before the first view is built, so nothing in between is lost.
            const signals = yield* bus.subscribe<Signal>(channelOf(room.id));
            // A player's screen counts as online for as long as its stream runs (the same scope as the subscription):
            // a presence entry per screen, refreshed while it is open and removed when it closes.
            if (viewer.kind === "player") {
              const member = `${viewer.userId}:${crypto.randomUUID()}`;
              const key = presenceOf(room.id);
              yield* Effect.acquireRelease(
                cache.touch(key, member, presenceTtlMs).pipe(Effect.andThen(publish(room, { to: "presenter" }))),
                () => cache.leave(key, member).pipe(Effect.andThen(publish(room, { to: "presenter" }))),
              );
              yield* cache.touch(key, member, presenceTtlMs).pipe(
                Effect.repeat(Schedule.spaced(`${presenceEveryMs} millis`)),
                Effect.forkScoped,
              );
            }
            let lastSent = "";
            const relevant = (s: Signal) =>
              s.to === "all" || (viewer.kind === "presenter" ? s.to === "presenter" : s.to === "user" && s.userId === viewer.userId);
            // A view is the whole screen, so signals that piled up while one was being built need only one more:
            // each batch the subscription hands over becomes at most one view.
            return Stream.concat(Stream.make<Signal[]>({ to: "all" }), signals).pipe(
              Stream.chunks,
              Stream.filter((batch) => batch.some(relevant)),
              Stream.mapEffect(() =>
                viewFor(room, viewer).pipe(
                  Effect.map((view): GameView | null => {
                    const key = JSON.stringify({ ...view, serverNow: "" });
                    if (key === lastSent) return null;
                    lastSent = key;
                    return view;
                  }),
                ),
              ),
              Stream.filter((v): v is GameView => v !== null),
            );
          }).pipe(Effect.catchCause((cause) => Effect.logError("Game stream failed", cause).pipe(Effect.as(Stream.empty)))),
        );

      // --- Teacher-paced flow ---

      const persistPosition = (room: Room) =>
        db.query((d) =>
          d
            .update(quizSessions)
            .set({
              gamePhase: room.phase,
              currentQuestionIndex: room.index,
              questionStartedAt: room.questionStartedAt === null ? null : new Date(room.questionStartedAt),
              pausedAt: room.pausedAt === null ? null : new Date(room.pausedAt),
            })
            .where(eq(quizSessions.id, room.id)),
        );

      const openQuestion = Effect.fn("Game.openQuestion")(function* (room: Room, index: number) {
        room.phase = "question";
        room.index = index;
        room.played.add(index);
        room.questionStartedAt = Date.now();
        room.pausedAt = null;
        room.closing = false;
        room.answeredNow.clear();
        room.tally.clear();
        room.lastResult.clear();
        // Screens first: the room is what they show, the row is only for a restart. A commit can take a second or
        // more on a busy disk, and the question's clock is already running.
        yield* publish(room, { to: "all" });
        yield* persistPosition(room);
        // The question after this one is looked up now, so "Next" doesn't wait for it.
        const upcoming = nextIndex(room);
        const after = upcoming === null ? undefined : room.questions[upcoming];
        if (after) yield* extrasOf(room, after).pipe(Effect.forkDetach);
      });

      // Closes the open question once its clock has run out (or when the teacher moves on): those who didn't
      // answer lose their streak, the standings update, the answers split is shown. Answering early never closes
      // it, so nobody learns their result while the others still have time. Safe to call twice.
      const closeQuestion = (room: Room, index: number) =>
        room.lock.withPermits(1)(
          Effect.gen(function* () {
            if (room.phase !== "question" || room.index !== index || room.closing) return;
            room.closing = true;
            // Answers already on their way finish first, so none is left out of the split.
            for (let waited = 0; room.inflight > 0 && waited < 100; waited++) yield* Effect.sleep("20 millis");
            const q = room.questions[index]!;
            const missed = [...room.players.values()].filter((p) => !room.answeredNow.has(p.attemptId));
            const breaksStreak = missed.filter((p) => q.gamePoints !== "none" && p.streak > 0);
            for (const p of missed) room.lastResult.set(p.attemptId, { correct: false, answered: false, earned: 0 });
            for (const p of breaksStreak) p.streak = 0;
            room.phase = "reveal";
            room.pausedAt = null;
            room.closing = false;
            recomputeBoard(room);
            // The reveal shows at once; the database catches up behind it (see openQuestion).
            yield* publish(room, { to: "all" });
            if (breaksStreak.length > 0)
              yield* db.query((d) =>
                d.update(attempts).set({ gameStreak: 0 }).where(inArray(attempts.id, breaksStreak.map((p) => p.attemptId))),
              );
            yield* persistPosition(room);
          }),
        );

      const finish = (room: Room) =>
        room.lock.withPermits(1)(
          Effect.gen(function* () {
            if (room.phase === "ended" && room.status === "ended") return;
            // A question in flight stops here; what was answered stays.
            for (let waited = 0; room.inflight > 0 && waited < 100; waited++) yield* Effect.sleep("20 millis");
            room.phase = "ended";
            room.status = "ended";
            room.endedAt = Date.now();
            recomputeBoard(room);
            yield* db.query((d) =>
              d
                .update(quizSessions)
                .set({ status: "ended", endedAt: new Date(room.endedAt!), gamePhase: "ended", pausedAt: null })
                .where(eq(quizSessions.id, room.id)),
            );
            yield* publish(room, { to: "all" });
            // Grading takes a while with a big room: the screens already show the podium.
            yield* gradeAll(room).pipe(Effect.forkDetach);
          }),
        );

      // Submits every attempt still open, so the normal results (score, grading queue, class record) exist.
      const gradeAll = Effect.fn("Game.gradeAll")(
        function* (room: Room) {
          const open = yield* db.query((d) =>
            d
              .select({ id: attempts.id })
              .from(attempts)
              .where(and(eq(attempts.sessionId, room.id), eq(attempts.status, "in_progress"))),
          );
          yield* Effect.forEach(open, (a) => attemptService.submit({ attemptId: a.id, auto: false }), { concurrency: 6, discard: true });
          yield* hub.sessionChanged(room.id);
        },
        Effect.catchCause((cause) => Effect.logError("Grading the game failed", cause)),
      );

      // --- Answers ---

      const check = (q: Question, value: AnswerValue): Effect.Effect<CodeTestResult[] | null> => {
        if (q.type !== "code" && q.type !== "sql") return Effect.succeed(null);
        if (isBlank(value)) return Effect.succeed([{ testId: "blank", passed: false, output: "", error: "No answer" }]);
        return q.type === "code"
          ? runner.runTests(q, value as string)
          : Effect.promise(() => runSqlChecks(q, value as string)).pipe(
              Effect.catch(() => Effect.succeed(null)),
              Effect.catchDefect(() => Effect.succeed(null)),
            );
      };

      // Scores and stores one answer (or, with `value` null and `timedOut`, a question that ran out of time).
      const settle = Effect.fn("Game.settle")(function* (
        room: Room,
        p: Player,
        q: Question,
        value: AnswerValue,
        elapsedMs: number,
        timedOut: boolean,
      ) {
        const results = timedOut ? null : yield* check(q, value);
        const fraction = timedOut ? (q.type === "drawing" ? null : 0) : autoScore(q, value, results);
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
        p.streakBefore = p.streak;
        p.points += earned;
        p.streak = points.streak;
        p.done.set(q.id, { correct, earned });
        if (room.pacing === "teacher") {
          room.lastResult.set(p.attemptId, { correct, answered: true, earned });
          for (const key of tallyKeys(q, value, fraction)) room.tally.set(key, (room.tally.get(key) ?? 0) + 1);
        }
        const row = {
          value: timedOut ? null : value,
          correct,
          autoScore: fraction,
          timeMs: timedOut ? null : Math.round(elapsedMs),
          gamePointsEarned: earned,
        };
        yield* db.query(async (d) => {
          // The live answer is the one scored: it replaces any row already there.
          await d
            .insert(answers)
            .values({ attemptId: p.attemptId, questionId: q.id, ...row })
            .onConflictDoUpdate({ target: [answers.attemptId, answers.questionId], set: { ...row, answeredAt: new Date() } });
          await d.update(attempts).set({ points: p.points, gameStreak: p.streak }).where(eq(attempts.id, p.attemptId));
        });
        room.boardDirty = true;
        room.relayVersion++;
      });

      const answer = Effect.fn("Game.answer")(function* (userId: string, sessionId: string, questionId: string, value: AnswerValue) {
        const room = yield* needRoom(sessionId);
        const p = room.byUser.get(userId);
        if (!p) return yield* new Forbidden({ message: "Join the game first." });
        if (room.status === "ended" || room.phase === "ended") return yield* new Conflict({ message: "The game is over." });
        const now = Date.now();
        let q: Question | undefined;
        let openedAt: number;
        if (room.pacing === "teacher") {
          if (room.phase !== "question" || room.closing || room.questionStartedAt === null)
            return yield* new Conflict({ message: "This question is closed." });
          if (room.pausedAt !== null) return yield* new Conflict({ message: "The game is paused." });
          if (room.answeredNow.has(p.attemptId)) return yield* new Conflict({ message: "You already answered this question." });
          q = room.questions[room.index];
          openedAt = room.questionStartedAt;
        } else {
          if (room.status !== "running" || p.startedAt === null || p.finished) return yield* new Conflict({ message: "The game isn't running for you." });
          if (room.relay !== null) yield* relayPlaying(room, p);
          q = paperOf(room, p)[p.index];
          openedAt = p.startedAt;
          if (q && p.done.has(q.id)) return yield* new Conflict({ message: "You already answered this question." });
        }
        if (!q || q.id !== questionId) return yield* new Conflict({ message: "That question isn't open." });
        if (now > openedAt + room.seconds * 1000 + gameGraceMs) return yield* new Conflict({ message: "Time is up." });
        // Reserve the answer at once, so a double tap can't count twice.
        if (room.pacing === "teacher") room.answeredNow.add(p.attemptId);
        else p.done.set(q.id, { correct: null, earned: 0 });
        room.inflight++;
        const question = q;
        yield* Effect.gen(function* () {
          const cleaned =
            question.type === "drawing"
              ? yield* db.query((d) => keepOwnPictures(d, userId, cleanAnswer(question, value)))
              : cleanAnswer(question, value);
          yield* settle(room, p, question, cleaned, now - openedAt, false);
        }).pipe(Effect.ensuring(Effect.sync(() => void room.inflight--)));
        if (room.pacing === "teacher") room.presenterDirty = true;
        // The player's screen locks ("Answer locked in"); teacher-paced, the result waits for the clock.
        yield* publish(room, room.relay !== null ? { to: "all" } : { to: "user", userId });
      });

      const next = Effect.fn("Game.next")(function* (userId: string, sessionId: string) {
        const room = yield* needRoom(sessionId);
        if (room.pacing !== "student") return yield* new Conflict({ message: "The teacher moves this game along." });
        const p = room.byUser.get(userId);
        if (!p) return yield* new Forbidden({ message: "Join the game first." });
        if (room.status !== "running") return yield* new Conflict({ message: "The game isn't running." });
        if (room.relay !== null) yield* relayPlaying(room, p);
        const now = Date.now();
        if (p.finished) return;
        const paper = paperOf(room, p);
        if (p.startedAt === null && paper.length > 0) {
          p.index = 0;
        } else {
          const q = paper[p.index];
          if (p.startedAt !== null && q && !p.done.has(q.id)) return yield* new Conflict({ message: "Answer the question first." });
          // The last question is done; a relay player whose team gave them nothing finishes at once.
          if (p.startedAt === null || p.index + 1 >= paper.length) {
            p.finished = true;
            yield* Effect.sync(() => void (room.presenterDirty = true));
            yield* attemptService.submit({ attemptId: p.attemptId, auto: false }).pipe(Effect.forkDetach);
            yield* publish(room, room.relay !== null ? { to: "all" } : { to: "user", userId });
            return;
          }
          p.index++;
        }
        p.startedAt = now;
        yield* db.query((d) =>
          d.update(attempts).set({ questionIndex: p.index, questionStartedAt: new Date(now) }).where(eq(attempts.id, p.attemptId)),
        );
        yield* publish(room, room.relay !== null ? { to: "all" } : { to: "user", userId });
      });

      // --- Joining ---

      // Whether the student is on the session's roster, was removed from it by the teacher, or isn't on it.
      const rosterState = (sessionId: string, userId: string) =>
        db
          .query((d) =>
            d
              .select({ removedAt: sessionStudents.removedAt })
              .from(sessionStudents)
              .where(and(eq(sessionStudents.sessionId, sessionId), eq(sessionStudents.studentId, userId))),
          )
          .pipe(Effect.map(([row]) => (row === undefined ? "none" : row.removedAt === null ? "on" : "removed") as "on" | "removed" | "none"));

      const isRostered = (sessionId: string, userId: string) => rosterState(sessionId, userId).pipe(Effect.map((s) => s === "on"));

      const removed = new Conflict({ message: "You were removed from this session." });

      // The open session a join key opens.
      const lookup = Effect.fn("Game.lookup")(function* (code: string) {
        const key = normalizeJoinKey(code);
        if (key === null) return yield* new NotFound({ message: "A join key has 7 letters and numbers, like ABC-DEFG." });
        const rows = yield* db.query((d) =>
          d
            .select({ session: quizSessions, title: quizzes.title })
            .from(quizSessions)
            .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
            .where(and(eq(quizSessions.joinCode, key), ne(quizSessions.status, "ended")))
            .orderBy(desc(quizSessions.createdAt)),
        );
        const row = rows.find((r) => toSession(r.session, Date.now()).status !== "ended");
        if (!row) return yield* new NotFound({ message: "That key doesn't match an open session." });
        return row;
      });

      const guestsAllowed = (s: typeof quizSessions.$inferSelect) => s.allowGuests && s.mode === "game" && s.classId === null;

      // The session a join key opens. A classless session puts the student on its roster (unless it is too late
      // to join); a class session only opens for the students on it, and for members of its class who weren't
      // on it yet (they joined the class after it was created). A guest only gets into games that allow guests.
      const find = Effect.fn("Game.find")(function* (user: SessionUser, code: string) {
        const userId = user.id;
        const row = yield* lookup(code);
        const { session } = row;
        if (user.role === "guest" && !guestsAllowed(session))
          return yield* new NotFound({ message: "That key doesn't match a game that guests can join." });
        const state = yield* rosterState(session.id, userId);
        if (state === "removed") return yield* removed;
        // Teachers see students by roster entry (`students`), which an account gets when it first joins a class
        // (guests get theirs on /join).
        const [onRoster] = yield* db.query((d) =>
          d.select({ id: students.id }).from(students).where(eq(students.userId, userId)),
        );
        if (session.classId === null) {
          if (!onRoster)
            return yield* new Conflict({ message: "Join one of your classes first (Classes, then Join with a code), so your teacher knows who you are." });
          const late = session.lateJoinMinutes;
          if (late !== null && session.startedAt !== null && Date.now() > session.startedAt.getTime() + late * 60_000)
            return yield* new Conflict({ message: `It's too late to join: students could join in the first ${late} minutes.` });
          if (state === "none")
            yield* db.query((d) =>
              d.insert(sessionStudents).values({ sessionId: session.id, studentId: userId }).onConflictDoNothing(),
            );
        } else if (state === "none") {
          const classId = session.classId;
          const [member] = onRoster
            ? yield* db.query((d) =>
                d
                  .select({ studentId: classMembers.studentId })
                  .from(classMembers)
                  .where(and(eq(classMembers.classId, classId), eq(classMembers.studentId, onRoster.id))),
              )
            : [];
          if (!member) return yield* new NotFound({ message: "That key doesn't match a session you're on the roster of." });
          yield* db.query((d) =>
            d.insert(sessionStudents).values({ sessionId: session.id, studentId: userId }).onConflictDoNothing(),
          );
        }
        return {
          sessionId: session.id,
          title: row.title,
          mode: session.mode,
          pacing: session.pacing,
          status: toSession(session, Date.now()).status,
        };
      });

      const join = Effect.fn("Game.join")(function* (userId: string, sessionId: string) {
        const state = yield* rosterState(sessionId, userId);
        if (state === "removed") return yield* removed;
        if (state === "none") return yield* new NotFound({ message: "That game doesn't exist." });
        const room = yield* needRoom(sessionId);
        if (room.byUser.has(userId)) return;
        if (room.status === "ended") return yield* new Conflict({ message: "This game is over." });
        if (room.status !== "lobby" && room.status !== "running")
          return yield* new Conflict({ message: "Your teacher hasn't opened the game yet." });
        if (
          room.status === "running" &&
          room.lateJoinMinutes !== null &&
          room.startedAt !== null &&
          Date.now() > room.startedAt + room.lateJoinMinutes * 60_000
        )
          return yield* new Conflict({ message: `It's too late to join: players could join in the first ${room.lateJoinMinutes} minutes.` });
        if (room.relay !== null && room.status === "running" && pickLateTeam(room) === null)
          return yield* new Conflict({ message: "Every team is full." });
        const [user] = yield* db.query((d) => d.select({ name: users.name, avatar: users.avatar }).from(users).where(eq(users.id, userId)));
        const [created] = yield* db.query((d) =>
          d
            .insert(attempts)
            .values({ sessionId, studentId: userId, attemptNumber: 1, ...(room.pacing === "teacher" ? { seed: room.seed } : {}) })
            .onConflictDoNothing()
            .returning(),
        );
        const attempt =
          created ??
          (yield* db.query((d) => d.select().from(attempts).where(and(eq(attempts.sessionId, sessionId), eq(attempts.studentId, userId)))))[0]!;
        // Two requests can join the same student at once: the first to set the player wins.
        if (room.byUser.has(userId)) return;
        const p: Player = {
          attemptId: attempt.id,
          userId,
          name: user?.name ?? "Player",
          avatar: avatarOf(userId, user?.avatar ?? null),
          seed: attempt.seed,
          points: attempt.points,
          streak: attempt.gameStreak,
          streakBefore: attempt.gameStreak,
          done: new Map(),
          index: attempt.questionIndex,
          startedAt: null,
          finished: false,
          paper: null,
          teamId: null,
          tries: new Map(),
        };
        if (room.relay !== null && room.status === "running") return yield* lateJoin(room, p, created !== undefined);
        room.players.set(p.attemptId, p);
        room.byUser.set(userId, p);
        room.presenterDirty = true;
        room.boardDirty = true;
        yield* publish(room, { to: "user", userId });
      });

      const kick = Effect.fn("Game.kick")(function* (sessionId: string, attemptId: string) {
        const room = yield* needRoom(sessionId);
        const remove = Effect.gen(function* () {
          const p = room.players.get(attemptId);
          if (!p) return yield* noGame;
          // A relay team's questions are handed to the teammates (or left without an owner) before the player goes.
          const updates = room.relay !== null ? releaseSlots(room, p) : [];
          room.players.delete(attemptId);
          room.byUser.delete(p.userId);
          room.answeredNow.delete(attemptId);
          room.removed.set(p.userId, { userId: p.userId, name: p.name, avatar: p.avatar });
          // Out of the game: no seat, and no way to join again with the key until the teacher allows it (the roster row
          // stays, marked removed).
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              for (const u of updates)
                await tx
                  .update(sessionTeamQuestions)
                  .set(u.set)
                  .where(and(eq(sessionTeamQuestions.teamId, u.teamId), eq(sessionTeamQuestions.questionId, u.questionId)));
              await tx.delete(attempts).where(eq(attempts.id, attemptId));
              await tx
                .update(sessionStudents)
                .set({ removedAt: new Date() })
                .where(and(eq(sessionStudents.sessionId, sessionId), eq(sessionStudents.studentId, p.userId)));
            }),
          );
          room.presenterDirty = true;
          room.boardDirty = true;
          yield* publish(room, room.relay !== null ? { to: "all" } : { to: "user", userId: p.userId });
        });
        // A relay's teams change under the room lock; a classic game is not held up by it.
        yield* room.relay !== null ? room.lock.withPermits(1)(remove) : remove;
      });

      const allowRejoin = Effect.fn("Game.allowRejoin")(function* (sessionId: string, userId: string) {
        const room = yield* needRoom(sessionId);
        if (!room.removed.has(userId)) return yield* new NotFound({ message: "That player wasn't removed." });
        yield* db.query((d) =>
          d
            .update(sessionStudents)
            .set({ removedAt: null })
            .where(and(eq(sessionStudents.sessionId, sessionId), eq(sessionStudents.studentId, userId))),
        );
        room.removed.delete(userId);
        // The player's screen offers to join again.
        yield* publish(room, { to: "presenter" });
        yield* publish(room, { to: "user", userId });
      });

      const avatarChanged = Effect.fn("Game.avatarChanged")(function* (userId: string, avatar: Avatar) {
        for (const room of rooms.values()) {
          const p = room.byUser.get(userId);
          if (!p) continue;
          p.avatar = avatar;
          // Only the picture changes: the standings stay as of the last closed question.
          room.board = room.board.map((row) => (row.attemptId === p.attemptId ? { ...row, avatar } : row));
          yield* publish(room, { to: "all" });
        }
      });

      // --- The teacher's controls ---

      const validate = Effect.fn("Game.validate")(function* (quizId: string, pacing: "teacher" | "student", relay = false) {
        const [quiz] = yield* db.query((d) => d.select().from(quizzes).where(eq(quizzes.id, quizId)));
        if (!quiz) return yield* new Conflict({ message: "That quiz doesn't exist." });
        const detail = yield* db.query((d) => loadQuizDetail(d, quiz));
        const flat = flatQuestions(detail.parts);
        const problems = gameQuestionProblems(pacing, flat, relay);
        if (relay && flat.length < 2) problems.push("A Team Relay needs at least 2 questions.");
        if (problems.length > 0) return yield* new Conflict({ message: problems.join(" ") });
      });

      const openLobby = Effect.fn("Game.openLobby")(function* (sessionId: string) {
        const room = yield* needRoom(sessionId);
        if (room.status === "ended") return yield* new Conflict({ message: "This game is over." });
        if (room.status !== "scheduled") return;
        yield* validate(room.detail.quiz.id, room.pacing, room.relay !== null);
        if (room.relay !== null && room.teams.size === 0) yield* makeTeams(room, room.relay.teamCount);
        room.status = "lobby";
        room.phase = "lobby";
        yield* db.query((d) => d.update(quizSessions).set({ status: "lobby" }).where(eq(quizSessions.id, sessionId)));
        yield* publish(room, { to: "all" });
        yield* hub.sessionChanged(sessionId);
      });

      const start = Effect.fn("Game.start")(function* (sessionId: string) {
        const room = yield* needRoom(sessionId);
        if (room.relay !== null) return yield* startRelay(room);
        if (room.status === "ended") return yield* new Conflict({ message: "This game is over." });
        if (room.status === "running" && (room.pacing === "student" || room.phase !== "lobby"))
          return yield* new Conflict({ message: "The game already started." });
        yield* validate(room.detail.quiz.id, room.pacing);
        if (room.players.size === 0) return yield* new Conflict({ message: "Wait for at least one player to join." });
        const now = new Date();
        room.status = "running";
        room.startedAt = now.getTime();
        yield* db.query((d) =>
          d.update(quizSessions).set({ status: "running", startedAt: now, opensAt: now }).where(eq(quizSessions.id, sessionId)),
        );
        if (room.pacing === "teacher") yield* room.lock.withPermits(1)(openQuestion(room, 0));
        else yield* publish(room, { to: "all" });
        yield* hub.sessionChanged(sessionId);
      });

      // The question to open after the current one: the first unplayed one after it, else the first unplayed one
      // at all (a jump may have skipped some); null when every question was played.
      const nextIndex = (room: Room): number | null => {
        const unplayed = room.questions.map((_, i) => i).filter((i) => !room.played.has(i));
        return unplayed.find((i) => i > room.index) ?? unplayed[0] ?? null;
      };

      const advance = Effect.fn("Game.advance")(function* (sessionId: string) {
        const room = yield* needRoom(sessionId);
        if (room.pacing !== "teacher") return yield* new Conflict({ message: "Players move through a student-paced game themselves." });
        const next = nextIndex(room);
        switch (room.phase) {
          case "question":
            return yield* closeQuestion(room, room.index);
          case "reveal": {
            if (next === null) return yield* finish(room);
            if (!room.leaderboard) return yield* room.lock.withPermits(1)(openQuestion(room, next));
            return yield* room.lock.withPermits(1)(
              Effect.gen(function* () {
                if (room.phase !== "reveal") return;
                room.phase = "leaderboard";
                yield* publish(room, { to: "all" });
                yield* persistPosition(room);
              }),
            );
          }
          case "leaderboard":
            return next === null ? yield* finish(room) : yield* room.lock.withPermits(1)(openQuestion(room, next));
          default:
            return yield* new Conflict({ message: "The game isn't running." });
        }
      });

      const openTeacherPaced = Effect.fn("Game.openTeacherPaced")(function* (sessionId: string) {
        const room = yield* needRoom(sessionId);
        if (room.pacing !== "teacher") return yield* new Conflict({ message: "Only a teacher-paced game has a clock the teacher controls." });
        if (room.status !== "running" || room.phase === "ended") return yield* new Conflict({ message: "The game isn't running." });
        return room;
      });

      const pause = Effect.fn("Game.pause")(function* (sessionId: string) {
        const room = yield* openTeacherPaced(sessionId);
        if (room.phase !== "question") return yield* new Conflict({ message: "There's no question open to pause." });
        if (room.pausedAt !== null) return yield* new Conflict({ message: "The game is already paused." });
        room.pausedAt = Date.now();
        yield* publish(room, { to: "all" });
        yield* persistPosition(room);
      });

      const unpause = Effect.fn("Game.unpause")(function* (sessionId: string) {
        const room = yield* openTeacherPaced(sessionId);
        if (room.pausedAt === null) return yield* new Conflict({ message: "The game isn't paused." });
        // The question keeps the time it had left: its start moves on by the time paused.
        if (room.questionStartedAt !== null) room.questionStartedAt += Date.now() - room.pausedAt;
        room.pausedAt = null;
        yield* publish(room, { to: "all" });
        yield* persistPosition(room);
      });

      const goTo = Effect.fn("Game.goTo")(function* (sessionId: string, index: number) {
        const room = yield* openTeacherPaced(sessionId);
        if (room.phase === "question") return yield* new Conflict({ message: "Close the open question first." });
        if (!Number.isInteger(index) || index < 0 || index >= room.questions.length)
          return yield* new Conflict({ message: "There's no such question." });
        if (room.played.has(index)) return yield* new Conflict({ message: "That question was already played." });
        yield* room.lock.withPermits(1)(openQuestion(room, index));
      });

      // Applies a new question length to the room (an open question keeps its start and closes at once if the new
      // length has already passed), and tells every screen.
      const applySeconds = Effect.fn("Game.applySeconds")(function* (room: Room, seconds: number) {
        room.seconds = seconds;
        const clock = room.pausedAt ?? Date.now();
        if (room.phase === "question" && room.pausedAt === null && room.questionStartedAt !== null && clock >= room.questionStartedAt + seconds * 1000)
          return yield* closeQuestion(room, room.index);
        yield* publish(room, { to: "all" });
      });

      const setSeconds = Effect.fn("Game.setSeconds")(function* (sessionId: string, seconds: number) {
        const room = yield* openTeacherPaced(sessionId);
        yield* db.query((d) => d.update(quizSessions).set({ gameQuestionSeconds: seconds }).where(eq(quizSessions.id, room.id)));
        yield* applySeconds(room, seconds);
      });

      // The session's settings were edited (session.update): the room takes the ones a game reads while it runs.
      const applySettings = Effect.fn("Game.applySettings")(function* (sessionId: string) {
        const room = rooms.get(sessionId);
        if (!room) return;
        const [row] = yield* db.query((d) =>
          d
            .select({
              seconds: quizSessions.gameQuestionSeconds,
              leaderboard: quizSessions.gameLeaderboard,
              streakBonus: quizSessions.gameStreakBonus,
              lateJoinMinutes: quizSessions.lateJoinMinutes,
              relay: quizSessions.relay,
              relayPassword: quizSessions.relayPassword,
              relayClues: quizSessions.relayClues,
            })
            .from(quizSessions)
            .where(eq(quizSessions.id, sessionId)),
        );
        if (!row) return;
        room.leaderboard = row.leaderboard;
        room.streakBonus = row.streakBonus;
        room.lateJoinMinutes = row.lateJoinMinutes;
        // The relay settings only change before the game starts (a started game refuses the edit).
        if (room.startedAt === null && room.status !== "ended") {
          room.relay = row.relay;
          room.relayPassword = row.relayPassword;
          room.relayClues = row.relayClues;
          room.questions = flatQuestions(row.relay ? room.detail.parts : attemptPaper(room.detail, room.seed));
          if (row.relay === null && room.teams.size > 0) {
            yield* db.query((d) => d.delete(sessionTeams).where(eq(sessionTeams.sessionId, room.id)));
            room.teams.clear();
            for (const p of room.players.values()) {
              p.teamId = null;
              p.paper = null;
            }
          } else if (row.relay !== null && room.teams.size === 0 && room.status === "lobby") {
            yield* makeTeams(room, row.relay.teamCount);
          }
        }
        yield* applySeconds(room, row.seconds);
      });

      const end = Effect.fn("Game.end")(function* (sessionId: string) {
        const room = yield* needRoom(sessionId);
        yield* finish(room);
      });

      // --- Team Relay ---

      const guessGapMs = 2000;

      const teamOf = (room: Room, p: Player): Team | undefined => (p.teamId === null ? undefined : room.teams.get(p.teamId));

      const blankTeam = (row: { id: string; name: string; position: number }): Team => ({
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

      // Rebuilds the teams of a relay from the database: members, questions, the password's pieces, guesses.
      const loadTeams = Effect.fn("Game.loadTeams")(function* (room: Room) {
        const relay = room.relay;
        if (relay === null) return;
        const teamRows = yield* db.query((d) =>
          d.select().from(sessionTeams).where(eq(sessionTeams.sessionId, room.id)).orderBy(sessionTeams.position),
        );
        if (teamRows.length === 0) return;
        const ids = teamRows.map((t) => t.id);
        const memberRows = yield* db.query((d) =>
          d.select().from(sessionTeamMembers).where(inArray(sessionTeamMembers.teamId, ids)).orderBy(sessionTeamMembers.joinedAt),
        );
        const slotRows = yield* db.query((d) => d.select().from(sessionTeamQuestions).where(inArray(sessionTeamQuestions.teamId, ids)));
        const guessRows = yield* db.query((d) =>
          d.select().from(sessionTeamGuesses).where(inArray(sessionTeamGuesses.teamId, ids)).orderBy(sessionTeamGuesses.createdAt),
        );
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
      });

      const roundEndsAt = (room: Room): number | null =>
        room.relay === null || room.startedAt === null ? null : room.startedAt + room.relay.roundMinutes * 60_000;

      // A team's round is over: it solved the password, used its guesses, or the time ran out.
      const teamOver = (room: Room, team: Team, now = Date.now()): boolean => {
        const relay = room.relay;
        if (relay === null) return false;
        if (team.solvedAt !== null || team.wrongGuesses >= relay.passwordAttempts || room.status === "ended") return true;
        const end = roundEndsAt(room);
        return end !== null && now >= end;
      };

      // Where a question of a team stands: whether its piece is unlocked, can still be, or never will be.
      const slotStateOf = (room: Room, slot: TeamSlot): SlotState => {
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

      const teamPoints = (room: Room, team: Team): number => {
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
      const rankedTeams = (room: Room): { team: Team; points: number; rank: number }[] => {
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

      const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

      const memberView = (p: Player): RelayMember => ({ attemptId: p.attemptId, name: p.name, avatar: p.avatar });

      const membersOf = (room: Room, team: Team): RelayMember[] =>
        team.members.flatMap((id) => {
          const p = room.players.get(id);
          return p ? [memberView(p)] : [];
        });

      // The team's board for its own members: a piece's text (and, scrambled, its place) only once it is unlocked.
      const boardOf = (room: Room, team: Team): RelayPiece[] => {
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

      // What the team's questions came to, once its round is over.
      const debriefOf = Effect.fn("Game.debrief")(function* (room: Room, team: Team) {
        if (team.debrief !== null && team.debrief.version === room.relayVersion) return team.debrief.items;
        const version = room.relayVersion;
        const rows =
          team.members.length === 0
            ? []
            : yield* db.query((d) =>
                d
                  .select({ attemptId: answers.attemptId, questionId: answers.questionId, value: answers.value, correct: answers.correct, tries: answers.tries })
                  .from(answers)
                  .where(and(inArray(answers.attemptId, team.members), sql`${answers.gamePointsEarned} is not null`)),
              );
        const byKey = new Map(rows.map((r) => [`${r.attemptId}:${r.questionId}`, r]));
        const order = new Map(room.questions.map((q, i) => [q.id, i]));
        const items = [...team.slots.values()]
          .sort((a, b) => (order.get(a.questionId) ?? 0) - (order.get(b.questionId) ?? 0))
          .flatMap((slot): RelayDebriefItem[] => {
            const q = room.byId.get(slot.questionId);
            if (!q) return [];
            const owner = slot.owner === null ? undefined : room.players.get(slot.owner);
            const row = slot.owner === null ? undefined : byKey.get(`${slot.owner}:${slot.questionId}`);
            const rescuer = slot.rescuer === null ? undefined : room.players.get(slot.rescuer);
            return [
              {
                questionId: q.id,
                prompt: promptOf(q),
                owner: owner?.name ?? "",
                answer: row ? valueText(q, row.value ?? undefined) : null,
                correct: row ? row.correct : null,
                correctAnswer: answerKey(q),
                explanation: q.explanation ?? null,
                retries: row?.tries ?? 0,
                rescuedBy: rescuer?.name ?? null,
                rescueCorrect: slot.rescuer !== null || slot.rescueCorrect !== null ? slot.rescueCorrect : null,
              },
            ];
          });
        team.debrief = { version, items };
        return items;
      });

      // The player's own team in full. Pieces of locked questions and the password stay out of it until they are earned.
      const myTeamView = Effect.fn("Game.myTeamView")(function* (room: Room, team: Team, p: Player, rescuing: TeamSlot | undefined, now: number) {
        const relay = room.relay!;
        const over = teamOver(room, team, now);
        const rescuable: RelayRescuable[] =
          relay.rescue && p.finished && !over && !rescuing
            ? [...team.slots.values()]
                .filter((s) => s.owner !== p.attemptId && slotStateOf(room, s) === "rescue")
                .sort((a, b) => a.boardIndex - b.boardIndex)
                .flatMap((s) => {
                  const q = room.byId.get(s.questionId);
                  return q ? [{ questionId: q.id, prompt: promptOf(q), owner: (s.owner === null ? undefined : room.players.get(s.owner)?.name) ?? "" }] : [];
                })
            : [];
        // Another try at the question on screen: tries left, and the share of its points it still earns.
        const current = !over && !p.finished && p.startedAt !== null ? paperOf(room, p)[p.index] : undefined;
        const answered = current ? p.done.get(current.id) : undefined;
        const used = current ? (p.tries.get(current.id) ?? 0) : 0;
        const retry =
          relay.retry && answered?.correct === false && used < relay.retryLimit
            ? { left: relay.retryLimit - used, percent: Math.max(0, 100 - relay.retryPenalty * (used + 1)) }
            : null;
        const proposal = team.proposal;
        return {
          id: team.id,
          name: team.name,
          members: membersOf(room, team),
          board: boardOf(room, team),
          guessesLeft: Math.max(0, relay.passwordAttempts - team.wrongGuesses),
          solved: team.solvedAt !== null,
          finished: over,
          password: over ? team.password : null,
          proposal: proposal
            ? { guess: proposal.guess, by: room.players.get(proposal.by)?.name ?? "", confirmed: proposal.confirmed, needed: team.members.length }
            : null,
          lastGuess: team.lastGuess,
          retry,
          rescuable,
          rescuing: rescuing?.questionId ?? null,
          debrief: over ? yield* debriefOf(room, team) : null,
        } satisfies RelayMyTeam;
      });

      const relayViewOf = Effect.fn("Game.relayView")(function* (
        room: Room,
        viewer: Viewer,
        player: Player | undefined,
        rescuing: TeamSlot | undefined,
        now: number,
      ) {
        const relay = room.relay!;
        const presenter = viewer.kind === "presenter";
        const mine = player ? teamOf(room, player) : undefined;
        const ranked = rankedTeams(room);
        const teams = ranked.map(({ team, points, rank }) => {
          const over = teamOver(room, team, now);
          return {
            id: team.id,
            name: team.name,
            members: membersOf(room, team),
            unlocked: [...team.slots.values()].filter((s) => s.piece !== null && slotStateOf(room, s) === "unlocked").length,
            pieces: team.pieces.length,
            wrongGuesses: team.wrongGuesses,
            solvedAt: iso(team.solvedAt),
            finished: over,
            points,
            rank,
            password: over && (presenter || mine?.id === team.id) ? team.password : null,
          };
        });
        const debriefs =
          presenter && room.status === "ended"
            ? yield* Effect.forEach(
                ranked,
                ({ team }) => Effect.map(debriefOf(room, team), (items) => ({ teamId: team.id, teamName: team.name, items })),
              )
            : [];
        return {
          pieceKind: relay.pieceKind,
          teamSize: relay.teamSize,
          studentPick: relay.studentPick,
          retry: relay.retry,
          rescue: relay.rescue,
          requireConsensus: relay.requireConsensus,
          roundEndsAt: iso(roundEndsAt(room)),
          teams,
          unassigned: [...room.players.values()].filter((p) => p.teamId === null).map(memberView),
          myTeamId: mine?.id ?? null,
          team: mine && player ? yield* myTeamView(room, mine, player, rescuing, now) : null,
          debriefs,
        } satisfies RelayView;
      });

      // --- Team Relay: the lobby ---

      const makeTeams = Effect.fn("Game.makeTeams")(function* (room: Room, count: number) {
        const taken = [...room.teams.values()].map((t) => t.name);
        let position = Math.max(-1, ...[...room.teams.values()].map((t) => t.position)) + 1;
        const rows: { sessionId: string; name: string; position: number }[] = [];
        for (let i = 0; i < count; i++) {
          const name = nextTeamName(taken);
          taken.push(name);
          rows.push({ sessionId: room.id, name, position: position++ });
        }
        if (rows.length === 0) return;
        const created = yield* db.query((d) => d.insert(sessionTeams).values(rows).returning());
        for (const t of created) room.teams.set(t.id, blankTeam(t));
      });

      // Puts a player in a team (or in none) in memory.
      const placeIn = (room: Room, p: Player, teamId: string | null) => {
        const from = teamOf(room, p);
        if (from) from.members = from.members.filter((id) => id !== p.attemptId);
        p.teamId = teamId;
        p.paper = null;
        if (teamId !== null) room.teams.get(teamId)!.members.push(p.attemptId);
      };

      // Deals every player into the given teams (an attempt-id list per team id); players not listed have none.
      const applyTeams = (room: Room, teams: Record<string, string[]>) => {
        for (const p of room.players.values()) {
          p.teamId = null;
          p.paper = null;
        }
        for (const team of room.teams.values()) team.members = [];
        for (const [teamId, ids] of Object.entries(teams)) for (const id of ids) placeIn(room, room.players.get(id)!, teamId);
      };

      // Writes the teams of the given players to the database.
      const saveMembers = (room: Room, attemptIds: string[]) =>
        db.query((d) =>
          d.transaction(async (tx) => {
            if (attemptIds.length === 0) return;
            await tx.delete(sessionTeamMembers).where(inArray(sessionTeamMembers.attemptId, attemptIds));
            const rows = attemptIds.flatMap((attemptId) => {
              const teamId = room.players.get(attemptId)?.teamId;
              return teamId ? [{ attemptId, teamId }] : [];
            });
            if (rows.length > 0) await tx.insert(sessionTeamMembers).values(rows);
          }),
        );

      const lobbyCheck = (room: Room): Effect.Effect<RelaySettings, Conflict> =>
        Effect.suspend(() => {
          if (room.relay === null) return Effect.fail(new Conflict({ message: "This isn't a Team Relay game." }));
          if (room.status === "ended") return Effect.fail(new Conflict({ message: "This game is over." }));
          if (room.status === "running") return Effect.fail(new Conflict({ message: "The teams are locked: the game already started." }));
          if (room.status !== "lobby") return Effect.fail(new Conflict({ message: "Open the lobby first." }));
          return Effect.succeed(room.relay);
        });

      // Runs a lobby change under the room lock, refusing it outside the lobby of a relay.
      const inLobby = Effect.fn("Game.inLobby")(function* <A, E>(
        sessionId: string,
        body: (room: Room, relay: RelaySettings) => Effect.Effect<A, E>,
      ) {
        const room = yield* needRoom(sessionId);
        return yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
            const relay = yield* lobbyCheck(room);
            return yield* body(room, relay);
          }),
        );
      });

      const membership = (room: Room): Record<string, string[]> =>
        Object.fromEntries([...room.teams.values()].map((t) => [t.id, [...t.members]]));

      const assignTeam = Effect.fn("Game.assignTeam")(function* (sessionId: string, attemptId: string, teamId: string | null) {
        return yield* inLobby(sessionId, (room, relay) =>
          Effect.gen(function* () {
            const p = room.players.get(attemptId);
            if (!p) return yield* new NotFound({ message: "That player isn't in the game." });
            if (teamId !== null) {
              const team = room.teams.get(teamId);
              if (!team) return yield* new NotFound({ message: "That team doesn't exist." });
              if (p.teamId !== teamId && team.members.length >= relay.teamSize) return yield* new Conflict({ message: `${team.name} is full.` });
            }
            placeIn(room, p, teamId);
            yield* saveMembers(room, [attemptId]);
            yield* publish(room, { to: "all" });
          }),
        );
      });

      const dealTeams = Effect.fn("Game.dealTeams")(function* (sessionId: string) {
        return yield* inLobby(sessionId, (room, relay) =>
          Effect.gen(function* () {
            const everyone = [...room.players.keys()];
            const dealt = randomizeTeams(everyone, [...room.teams.keys()], relay.teamSize, Math.floor(Math.random() * 2 ** 31));
            if (dealt === null) return yield* new Conflict({ message: "There are more players than places: add a team or make the teams bigger." });
            applyTeams(room, dealt);
            yield* saveMembers(room, everyone);
            yield* publish(room, { to: "all" });
          }),
        );
      });

      const levelTeams = Effect.fn("Game.levelTeams")(function* (sessionId: string) {
        return yield* inLobby(sessionId, (room, relay) =>
          Effect.gen(function* () {
            const unassigned = [...room.players.values()].filter((p) => p.teamId === null).map((p) => p.attemptId);
            const level = balanceTeams(membership(room), unassigned, relay.teamSize);
            applyTeams(room, level.teams);
            yield* saveMembers(room, [...room.players.keys()]);
            yield* publish(room, { to: "all" });
          }),
        );
      });

      const addTeam = Effect.fn("Game.addTeam")(function* (sessionId: string) {
        return yield* inLobby(sessionId, (room) =>
          Effect.gen(function* () {
            if (room.teams.size >= relayLimits.teamCount.maximum)
              return yield* new Conflict({ message: `A relay has at most ${relayLimits.teamCount.maximum} teams.` });
            yield* makeTeams(room, 1);
            yield* publish(room, { to: "all" });
          }),
        );
      });

      const removeTeam = Effect.fn("Game.removeTeam")(function* (sessionId: string, teamId: string) {
        return yield* inLobby(sessionId, (room) =>
          Effect.gen(function* () {
            const team = room.teams.get(teamId);
            if (!team) return yield* new NotFound({ message: "That team doesn't exist." });
            if (room.teams.size <= 1) return yield* new Conflict({ message: "A relay needs at least one team." });
            // Its members go back to the unassigned.
            for (const id of team.members) {
              const p = room.players.get(id);
              if (p) {
                p.teamId = null;
                p.paper = null;
              }
            }
            room.teams.delete(teamId);
            yield* db.query((d) => d.delete(sessionTeams).where(eq(sessionTeams.id, teamId)));
            yield* publish(room, { to: "all" });
          }),
        );
      });

      const setStudentPick = Effect.fn("Game.setStudentPick")(function* (sessionId: string, allowed: boolean) {
        return yield* inLobby(sessionId, (room, relay) =>
          Effect.gen(function* () {
            const next = { ...relay, studentPick: allowed };
            yield* db.query((d) => d.update(quizSessions).set({ relay: next }).where(eq(quizSessions.id, room.id)));
            room.relay = next;
            yield* publish(room, { to: "all" });
          }),
        );
      });

      // A student takes (or switches to) a team of their own choice, when the teacher allows it.
      const pickTeam = Effect.fn("Game.pickTeam")(function* (userId: string, sessionId: string, teamId: string) {
        const room = yield* needRoom(sessionId);
        const p = room.byUser.get(userId);
        if (!p) return yield* new Forbidden({ message: "Join the game first." });
        yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
            const relay = yield* lobbyCheck(room);
            if (!relay.studentPick) return yield* new Conflict({ message: "Your teacher puts the players in teams." });
            const team = room.teams.get(teamId);
            if (!team) return yield* new NotFound({ message: "That team doesn't exist." });
            if (p.teamId === teamId) return;
            if (team.members.length >= relay.teamSize) return yield* new Conflict({ message: `${team.name} is full.` });
            placeIn(room, p, teamId);
            yield* saveMembers(room, [p.attemptId]);
            yield* publish(room, { to: "all" });
          }),
        );
      });

      // --- Team Relay: the start ---

      const startRelay = Effect.fn("Game.startRelay")(function* (room: Room) {
        const relay = room.relay!;
        yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
            if (room.status === "ended") return yield* new Conflict({ message: "This game is over." });
            if (room.status === "running") return yield* new Conflict({ message: "The game already started." });
            if (room.status !== "lobby") return yield* new Conflict({ message: "Open the lobby first." });
            yield* validate(room.detail.quiz.id, room.pacing, true);
            if (room.players.size === 0) return yield* new Conflict({ message: "Wait for at least two players to join." });
            const teams = [...room.teams.values()].sort((a, b) => a.position - b.position);
            // Players still without a team are placed to even out the sizes.
            const unassigned = [...room.players.values()].filter((p) => p.teamId === null).map((p) => p.attemptId);
            let members = membership(room);
            if (unassigned.length > 0) {
              const placed = balanceTeams(members, unassigned, relay.teamSize);
              if (placed.unassigned.length > 0) return yield* new Conflict({ message: "There isn't room for everyone: add a team." });
              members = placed.teams;
            }
            const problem = teamsStartProblem(teams.map((t) => ({ name: t.name, members: members[t.id]! })), relay.teamSize);
            if (problem !== null) return yield* new Conflict({ message: problem });
            const playing = teams.filter((t) => members[t.id]!.length > 0);
            const questionIds = room.questions.map((q) => q.id);
            const plans: { team: Team; members: string[]; password: string; pieces: string[]; slots: Map<string, TeamSlot> }[] = [];
            for (const team of playing) {
              const mine = members[team.id]!;
              const shares = partitionQuestions(questionIds, mine, hashSeed(`${team.id}:questions`));
              if (shares === null) return yield* new Conflict({ message: `${team.name} has more players than the quiz has questions.` });
              const password =
                room.relayPassword ??
                (relay.pieceKind === "clue" ? null : generatePassword(hashSeed(`${team.id}:password`), relay.pieceKind, questionIds.length));
              if (password === null) return yield* new Conflict({ message: "Clue pieces need a password for the clues to lead to." });
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
            const now = new Date();
            yield* db.query((d) =>
              d.transaction(async (tx) => {
                const empty = teams.filter((t) => !playing.includes(t)).map((t) => t.id);
                if (empty.length > 0) await tx.delete(sessionTeams).where(inArray(sessionTeams.id, empty));
                const everyone = plans.flatMap((plan) => plan.members);
                await tx.delete(sessionTeamMembers).where(inArray(sessionTeamMembers.attemptId, everyone));
                await tx
                  .insert(sessionTeamMembers)
                  .values(plans.flatMap((plan) => plan.members.map((attemptId) => ({ attemptId, teamId: plan.team.id }))));
                for (const plan of plans) {
                  await tx.update(sessionTeams).set({ password: plan.password }).where(eq(sessionTeams.id, plan.team.id));
                  await tx.insert(sessionTeamQuestions).values(
                    [...plan.slots.values()].map((s) => ({
                      teamId: plan.team.id,
                      questionId: s.questionId,
                      ownerAttemptId: s.owner,
                      shareIndex: s.shareIndex,
                      piece: s.piece,
                      boardIndex: s.boardIndex,
                    })),
                  );
                }
                await tx.update(quizSessions).set({ status: "running", startedAt: now, opensAt: now }).where(eq(quizSessions.id, room.id));
              }),
            );
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
            room.status = "running";
            room.startedAt = now.getTime();
            yield* publish(room, { to: "all" });
          }),
        );
        yield* hub.sessionChanged(room.id);
      });

      // --- Team Relay: players arriving and leaving ---

      // The team a late player joins: the smallest one with a free place whose round is still on.
      const pickLateTeam = (room: Room): Team | null => {
        let best: Team | null = null;
        for (const team of [...room.teams.values()].sort((a, b) => a.position - b.position)) {
          if (team.members.length >= room.relay!.teamSize || teamOver(room, team)) continue;
          if (best === null || team.members.length < best.members.length) best = team;
        }
        return best;
      };

      // The newcomer takes over questions the teammates haven't been shown yet: those are dealt again among the
      // teammates still playing and the newcomer, each question going to whoever has the fewest left.
      const handOver = (room: Room, team: Team, joiner: Player): SlotUpdate[] => {
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

      const lateJoin = Effect.fn("Game.lateJoin")(function* (room: Room, p: Player, created: boolean) {
        yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
            if (room.byUser.has(p.userId)) return;
            const team = pickLateTeam(room);
            if (team === null) {
              if (created) yield* db.query((d) => d.delete(attempts).where(eq(attempts.id, p.attemptId)));
              return yield* new Conflict({ message: "Every team is full." });
            }
            room.players.set(p.attemptId, p);
            room.byUser.set(p.userId, p);
            const updates = handOver(room, team, p);
            yield* db.query((d) =>
              d.transaction(async (tx) => {
                await tx.insert(sessionTeamMembers).values({ attemptId: p.attemptId, teamId: team.id }).onConflictDoNothing();
                for (const u of updates)
                  await tx
                    .update(sessionTeamQuestions)
                    .set(u.set)
                    .where(and(eq(sessionTeamQuestions.teamId, u.teamId), eq(sessionTeamQuestions.questionId, u.questionId)));
              }),
            );
            room.presenterDirty = true;
            room.boardDirty = true;
            room.relayVersion++;
            yield* publish(room, { to: "all" });
          }),
        );
      });

      // A player leaves their team (kicked). Their unanswered questions go to the teammates still playing, the one
      // with the fewest left first; with none to take them they have no owner (and may be rescued). A piece they
      // unlocked stays unlocked. Runs with the room lock held; returns the question rows to update.
      const releaseSlots = (room: Room, p: Player): SlotUpdate[] => {
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

      // --- Team Relay: playing ---

      const relayPlayer = Effect.fn("Game.relayPlayer")(function* (userId: string, sessionId: string) {
        const room = yield* needRoom(sessionId);
        if (room.relay === null) return yield* new Conflict({ message: "This isn't a Team Relay game." });
        const p = room.byUser.get(userId);
        if (!p) return yield* new Forbidden({ message: "Join the game first." });
        return { room, relay: room.relay, p };
      });

      // The player's team while its round is on.
      const relayPlaying = (room: Room, p: Player): Effect.Effect<Team, Conflict> =>
        Effect.suspend(() => {
          if (room.status === "ended") return Effect.fail(new Conflict({ message: "The game is over." }));
          if (room.status !== "running") return Effect.fail(new Conflict({ message: "The game isn't running." }));
          const team = teamOf(room, p);
          if (!team) return Effect.fail(new Conflict({ message: "You aren't in a team." }));
          if (teamOver(room, team)) return Effect.fail(new Conflict({ message: "Your team's round is over." }));
          return Effect.succeed(team);
        });

      // Another try at the question on screen after a wrong answer.
      const retry = Effect.fn("Game.retry")(function* (userId: string, sessionId: string) {
        const { room, relay, p } = yield* relayPlayer(userId, sessionId);
        yield* relayPlaying(room, p);
        if (!relay.retry) return yield* new Conflict({ message: "Your teacher didn't allow retries." });
        const q = p.finished || p.startedAt === null ? undefined : paperOf(room, p)[p.index];
        const done = q ? p.done.get(q.id) : undefined;
        if (!q || !done) return yield* new Conflict({ message: "There's no answer to try again." });
        if (done.correct === null) return yield* new Conflict({ message: "Your answer is still being checked." });
        if (done.correct) return yield* new Conflict({ message: "That answer was right." });
        const used = p.tries.get(q.id) ?? 0;
        if (used >= relay.retryLimit) return yield* new Conflict({ message: "You've used your retries on this question." });
        const now = Date.now();
        // What the first answer earned is taken back: the next answer earns again, less for the retry.
        p.tries.set(q.id, used + 1);
        p.points -= done.earned;
        p.done.delete(q.id);
        p.startedAt = now;
        room.boardDirty = true;
        room.relayVersion++;
        yield* db.query(async (d) => {
          await d
            .update(answers)
            .set({ tries: used + 1 })
            .where(and(eq(answers.attemptId, p.attemptId), eq(answers.questionId, q.id)));
          await d.update(attempts).set({ points: p.points, questionStartedAt: new Date(now) }).where(eq(attempts.id, p.attemptId));
        });
        yield* publish(room, { to: "all" });
      });

      // A player who finished their own questions takes a teammate's locked one (the first to ask gets it).
      const claimRescue = Effect.fn("Game.claimRescue")(function* (userId: string, sessionId: string, questionId: string) {
        const { room, relay, p } = yield* relayPlayer(userId, sessionId);
        if (!relay.rescue) return yield* new Conflict({ message: "Rescues are off in this game." });
        yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
            const team = yield* relayPlaying(room, p);
            if (!p.finished) return yield* new Conflict({ message: "Finish your own questions first." });
            if ([...team.slots.values()].some((s) => s.rescuer === p.attemptId && s.rescueCorrect === null))
              return yield* new Conflict({ message: "Answer the question you took first." });
            const slot = team.slots.get(questionId);
            if (!slot || slot.owner === p.attemptId || slotStateOf(room, slot) !== "rescue")
              return yield* new Conflict({ message: "That question can't be rescued." });
            const now = Date.now();
            slot.rescuer = p.attemptId;
            slot.rescueClaimedAt = now;
            yield* db.query((d) =>
              d
                .update(sessionTeamQuestions)
                .set({ rescuerAttemptId: p.attemptId, rescueClaimedAt: new Date(now) })
                .where(and(eq(sessionTeamQuestions.teamId, team.id), eq(sessionTeamQuestions.questionId, questionId))),
            );
            room.relayVersion++;
            yield* publish(room, { to: "all" });
          }),
        );
      });

      // The answer to the claimed rescue question: it earns the rescuer a share of the points, and it never touches
      // the owner's answer or grade.
      const rescueAnswer = Effect.fn("Game.rescue")(function* (userId: string, sessionId: string, questionId: string, value: AnswerValue) {
        const { room, relay, p } = yield* relayPlayer(userId, sessionId);
        const team = yield* relayPlaying(room, p);
        const slot = team.slots.get(questionId);
        const q = room.byId.get(questionId);
        if (!slot || !q || slot.rescuer !== p.attemptId || slot.rescueCorrect !== null)
          return yield* new Conflict({ message: "You haven't taken that question." });
        if (slot.scoring) return yield* new Conflict({ message: "Your answer is already in." });
        const now = Date.now();
        const claimedAt = slot.rescueClaimedAt ?? now;
        if (now > claimedAt + room.seconds * 1000 + gameGraceMs) return yield* new Conflict({ message: "Time is up." });
        slot.scoring = true;
        room.inflight++;
        yield* Effect.gen(function* () {
          const cleaned = cleanAnswer(q, value);
          const results = yield* check(q, cleaned);
          const fraction = autoScore(q, cleaned, results);
          const earned = gameAnswerPoints({
            gamePoints: q.gamePoints,
            fraction,
            elapsedMs: now - claimedAt,
            limitMs: room.seconds * 1000,
            streak: 0,
            streakBonus: false,
          }).earned;
          const points = rescuePoints(earned, relay.rescuePoints);
          const correct = fraction === 1;
          yield* db.query(async (d) => {
            await d
              .update(sessionTeamQuestions)
              .set({ rescueValue: cleaned, rescueCorrect: correct, rescuePoints: points })
              .where(and(eq(sessionTeamQuestions.teamId, team.id), eq(sessionTeamQuestions.questionId, questionId)));
            await d.update(attempts).set({ points: p.points + points }).where(eq(attempts.id, p.attemptId));
          });
          slot.rescueCorrect = correct;
          p.points += points;
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              slot.scoring = false;
              room.inflight--;
            }),
          ),
        );
        room.boardDirty = true;
        room.relayVersion++;
        yield* publish(room, { to: "all" });
      });

      // Every team's round is over (or has nobody left): the game is done.
      const relayAllOver = (room: Room): boolean =>
        room.relay !== null &&
        room.status === "running" &&
        room.teams.size > 0 &&
        [...room.teams.values()].every((t) => t.members.length === 0 || teamOver(room, t));

      // --- Team Relay: the password ---

      // Checks a guess for the team (the room lock is held). Right: the team solved it. Wrong: one guess less.
      const checkGuess = Effect.fn("Game.checkGuess")(function* (room: Room, team: Team, by: Player, guess: string) {
        const now = Date.now();
        if (now - team.lastGuessAt < guessGapMs) return yield* new Conflict({ message: "Wait a moment before the next guess." });
        const text = guess.trim();
        const correct = team.password !== null && normalizePassword(text) === normalizePassword(team.password);
        team.lastGuessAt = now;
        team.proposal = null;
        team.lastGuess = { guess: text, by: by.name, correct };
        if (correct) team.solvedAt = now;
        else team.wrongGuesses++;
        room.relayVersion++;
        yield* db.query(async (d) => {
          await d.insert(sessionTeamGuesses).values({ teamId: team.id, attemptId: by.attemptId, guess: text, correct });
          await d
            .update(sessionTeams)
            .set(correct ? { solvedAt: new Date(now) } : { wrongGuesses: team.wrongGuesses })
            .where(eq(sessionTeams.id, team.id));
        });
        yield* publish(room, { to: "all" });
      });

      // After a result that may end the game (the room lock is not held).
      const endIfAllOver = (room: Room) => (relayAllOver(room) ? finish(room) : Effect.void);

      const submitPassword = Effect.fn("Game.submitPassword")(function* (userId: string, sessionId: string, guess: string) {
        const { room, relay, p } = yield* relayPlayer(userId, sessionId);
        yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
            const team = yield* relayPlaying(room, p);
            if (normalizePassword(guess) === "") return yield* new Conflict({ message: "Type the password first." });
            if (team.proposal !== null) return yield* new Conflict({ message: "A guess is waiting for your teammates: confirm or reject it." });
            if (relay.requireConsensus && team.members.length > 1) {
              team.proposal = { guess: guess.trim(), by: p.attemptId, confirmed: [p.attemptId] };
              return yield* publish(room, { to: "all" });
            }
            yield* checkGuess(room, team, p, guess);
          }),
        );
        yield* endIfAllOver(room);
      });

      const confirmPassword = Effect.fn("Game.confirmPassword")(function* (userId: string, sessionId: string) {
        const { room, p } = yield* relayPlayer(userId, sessionId);
        yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
            const team = yield* relayPlaying(room, p);
            const proposal = team.proposal;
            if (proposal === null) return yield* new Conflict({ message: "There's no guess to confirm." });
            if (proposal.confirmed.includes(p.attemptId)) return;
            if (Date.now() - team.lastGuessAt < guessGapMs) return yield* new Conflict({ message: "Wait a moment before the next guess." });
            proposal.confirmed.push(p.attemptId);
            if (team.members.every((id) => proposal.confirmed.includes(id))) {
              const by = room.players.get(proposal.by) ?? p;
              return yield* checkGuess(room, team, by, proposal.guess);
            }
            yield* publish(room, { to: "all" });
          }),
        );
        yield* endIfAllOver(room);
      });

      const rejectPassword = Effect.fn("Game.rejectPassword")(function* (userId: string, sessionId: string) {
        const { room, p } = yield* relayPlayer(userId, sessionId);
        yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
            const team = yield* relayPlaying(room, p);
            if (team.proposal === null) return yield* new Conflict({ message: "There's no guess to reject." });
            team.proposal = null;
            yield* publish(room, { to: "all" });
          }),
        );
      });

      // --- Results ---

      const standings = Effect.fn("Game.standings")(function* (sessionId: string, userId: string | null) {
        const [head] = yield* db.query((d) =>
          d
            .select({ session: quizSessions, title: quizzes.title })
            .from(quizSessions)
            .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
            .where(eq(quizSessions.id, sessionId)),
        );
        if (!head || head.session.mode !== "game") return yield* noGame;
        const rows = yield* db.query((d) =>
          d
            .select({ attempt: attempts, name: users.name, avatar: users.avatar, studentId: students.id })
            .from(attempts)
            .innerJoin(users, eq(attempts.studentId, users.id))
            .leftJoin(students, eq(students.userId, attempts.studentId))
            .where(eq(attempts.sessionId, sessionId)),
        );
        const stats = yield* db.query((d) =>
          d
            .select({
              attemptId: answers.attemptId,
              correct: sql<number>`count(*) filter (where ${answers.correct} is true)::int`,
              answered: sql<number>`count(${answers.timeMs})::int`,
              averageMs: sql<number | null>`round(avg(${answers.timeMs}))::int`,
            })
            .from(answers)
            .innerJoin(attempts, eq(answers.attemptId, attempts.id))
            .where(eq(attempts.sessionId, sessionId))
            .groupBy(answers.attemptId),
        );
        const room = yield* needRoom(sessionId);
        const byAttempt = new Map(stats.map((s) => [s.attemptId, s]));
        // Team Relay: each player's team, and the teammates' questions they rescued.
        const teamNames = new Map<string, string>();
        const rescues = new Map<string, number>();
        for (const team of room.teams.values()) {
          for (const id of team.members) teamNames.set(id, team.name);
          for (const s of team.slots.values())
            if (s.rescuer !== null && s.rescueCorrect === true) rescues.set(s.rescuer, (rescues.get(s.rescuer) ?? 0) + 1);
        }
        const sorted = [...rows].sort((a, b) => b.attempt.points - a.attempt.points || a.name.localeCompare(b.name));
        let rank = 0;
        let previous = -1;
        const list: GameStanding[] = sorted.map((r, i) => {
          if (r.attempt.points !== previous) {
            rank = i + 1;
            previous = r.attempt.points;
          }
          const s = byAttempt.get(r.attempt.id);
          return {
            rank,
            attemptId: r.attempt.id,
            studentId: r.studentId,
            name: r.name,
            avatar: avatarOf(r.attempt.studentId, r.avatar),
            points: r.attempt.points,
            correct: s?.correct ?? 0,
            answered: s?.answered ?? 0,
            averageMs: s?.averageMs ?? null,
            team: teamNames.get(r.attempt.id) ?? null,
            rescues: rescues.get(r.attempt.id) ?? 0,
          };
        });
        const mine = userId === null ? null : (rows.find((r) => r.attempt.studentId === userId)?.attempt.id ?? null);
        const relay = room.relay !== null;
        // The questions most often answered wrong (a timeout counts as wrong).
        const misses = relay
          ? yield* db.query((d) =>
              d
                .select({
                  questionId: answers.questionId,
                  wrong: sql<number>`count(*) filter (where ${answers.correct} is not true)::int`,
                  answered: sql<number>`count(*)::int`,
                })
                .from(answers)
                .innerJoin(attempts, eq(answers.attemptId, attempts.id))
                .where(and(eq(attempts.sessionId, sessionId), sql`${answers.gamePointsEarned} is not null`))
                .groupBy(answers.questionId),
            )
          : [];
        return {
          title: head.title,
          questionCount: flatQuestions(room.detail.parts).length,
          ended: head.session.status === "ended",
          standings: list,
          myAttemptId: mine,
          teams: relay
            ? rankedTeams(room)
                .filter(({ team }) => team.members.length > 0)
                .map(({ team, points, rank }) => ({
                  rank,
                  name: team.name,
                  members: membersOf(room, team).map((m) => m.name),
                  points,
                  solvedMs: team.solvedAt === null || room.startedAt === null ? null : team.solvedAt - room.startedAt,
                  wrongGuesses: team.wrongGuesses,
                  unlocked: [...team.slots.values()].filter((s) => s.piece !== null && slotStateOf(room, s) === "unlocked").length,
                  pieces: team.pieces.length,
                  password: team.password ?? "",
                }))
            : [],
          missed: misses
            .filter((m) => m.wrong > 0 && room.byId.has(m.questionId))
            .sort((a, b) => b.wrong - a.wrong)
            .slice(0, 10)
            .map((m) => ({ questionId: m.questionId, prompt: promptOf(room.byId.get(m.questionId)!), wrong: m.wrong, answered: m.answered })),
        } satisfies GameStandings;
      });

      const gallery = Effect.fn("Game.gallery")(function* (sessionId: string, questionId: string, teacher: SessionUser) {
        const rows = yield* db.query((d) =>
          d
            .select({ attemptId: answers.attemptId, value: answers.value, name: users.name })
            .from(answers)
            .innerJoin(attempts, eq(answers.attemptId, attempts.id))
            .innerJoin(users, eq(attempts.studentId, users.id))
            .where(and(eq(attempts.sessionId, sessionId), eq(answers.questionId, questionId), sql`${answers.value} is not null`)),
        );
        const items: GalleryItem[] = rows.map((r) => ({ attemptId: r.attemptId, name: r.name, value: r.value }));
        const ids = assetIdsIn(JSON.stringify(items.map((i) => i.value)));
        const visible = yield* assets.visible(teacher, ids);
        const assetUrls = yield* assets.sign(visible).pipe(Effect.catch(() => Effect.succeed({} as Record<string, string>)));
        return { items, assetUrls };
      });

      // --- Background job ---

      const tick = Effect.gen(function* () {
        const now = Date.now();
        for (const [id, room] of rooms) {
          if (room.phase === "ended") {
            if (room.endedAt !== null && now - room.endedAt > keepEndedMs) rooms.delete(id);
            continue;
          }
          if (room.pacing === "teacher" && room.phase === "question" && !room.closing && room.pausedAt === null && room.questionStartedAt !== null) {
            // On its own fiber: waiting for answers in flight must not hold up the clocks of the other games.
            if (now >= room.questionStartedAt + room.seconds * 1000)
              yield* closeQuestion(room, room.index).pipe(
                Effect.catchCause((cause) => Effect.logError("Closing the question failed", cause)),
                Effect.forkDetach,
              );
          }
          if (room.pacing === "student" && room.status === "running") {
            for (const p of room.players.values()) {
              if (p.finished || p.startedAt === null) continue;
              if (room.relay !== null) {
                const team = teamOf(room, p);
                if (!team || teamOver(room, team, now)) continue;
              }
              const q = paperOf(room, p)[p.index];
              if (!q || p.done.has(q.id) || now <= p.startedAt + room.seconds * 1000 + gameGraceMs) continue;
              p.done.set(q.id, { correct: false, earned: 0 });
              yield* settle(room, p, q, null, room.seconds * 1000, true);
              yield* publish(room, room.relay !== null ? { to: "all" } : { to: "user", userId: p.userId });
            }
          }
          if (room.relay !== null && room.status === "running") {
            // A rescue nobody answered in time counts as wrong.
            for (const team of room.teams.values())
              for (const s of team.slots.values()) {
                if (s.rescuer === null || s.rescueCorrect !== null || s.scoring || s.rescueClaimedAt === null) continue;
                if (now <= s.rescueClaimedAt + room.seconds * 1000 + gameGraceMs) continue;
                s.rescueCorrect = false;
                room.relayVersion++;
                yield* db.query((d) =>
                  d
                    .update(sessionTeamQuestions)
                    .set({ rescueCorrect: false })
                    .where(and(eq(sessionTeamQuestions.teamId, team.id), eq(sessionTeamQuestions.questionId, s.questionId))),
                );
                yield* publish(room, { to: "all" });
              }
            // The round ended, or every team is done: the game is over.
            if (relayAllOver(room))
              yield* finish(room).pipe(
                Effect.catchCause((cause) => Effect.logError("Ending the relay failed", cause)),
                Effect.forkDetach,
              );
          }
          if (room.pacing === "student" && room.boardDirty) {
            recomputeBoard(room);
            yield* publish(room, { to: "all" });
          } else if (room.presenterDirty) {
            yield* publish(room, { to: "presenter" });
          }
          room.presenterDirty = false;
          // The teacher ended it some other way (the session's End button).
          if (room.status !== "ended" && Math.floor(now / 500) % 20 === 0) {
            const [row] = yield* db.query((d) => d.select({ status: quizSessions.status }).from(quizSessions).where(eq(quizSessions.id, id)));
            if (!row) rooms.delete(id);
            else if (row.status === "ended") {
              room.status = "ended";
              room.phase = "ended";
              room.endedAt = now;
              recomputeBoard(room);
              yield* publish(room, { to: "all" });
            }
          }
        }
      }).pipe(Effect.catchCause((cause) => Effect.logError("Game tick failed", cause)));

      const resume = Effect.gen(function* () {
        const open = yield* db.query((d) =>
          d
            .select({ id: quizSessions.id })
            .from(quizSessions)
            .where(and(eq(quizSessions.mode, "game"), inArray(quizSessions.status, ["lobby", "running"]))),
        );
        yield* Effect.forEach(open, (s) => roomOf(s.id), { discard: true });
      }).pipe(Effect.catchCause((cause) => Effect.logError("Resuming games failed", cause)));

      return Game.of({
        validate,
        lookup: (code) =>
          Effect.map(lookup(code), (r) => ({ sessionId: r.session.id, title: r.title, guestsAllowed: guestsAllowed(r.session) })),
        find,
        isRostered,
        join,
        answer,
        next,
        openLobby,
        start,
        advance,
        pause,
        unpause,
        goTo,
        setSeconds,
        applySettings,
        end,
        kick,
        allowRejoin,
        pickTeam,
        retry,
        claimRescue,
        rescue: rescueAnswer,
        submitPassword,
        confirmPassword,
        rejectPassword,
        assignTeam,
        randomizeTeams: dealTeams,
        balanceTeams: levelTeams,
        addTeam,
        removeTeam,
        setStudentPick,
        avatarChanged,
        standings,
        gallery,
        stream,
        tick,
        resume,
      });
    }),
  );
}

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
