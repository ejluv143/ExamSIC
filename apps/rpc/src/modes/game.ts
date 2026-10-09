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
  assetIdsIn,
  autoScore,
  blankKey,
  gameAnswerPoints,
  gameGraceMs,
  gameQuestionProblems,
  paperRandom,
  toStudentQuestion,
  type AnswerValue,
  type CodeTestResult,
  type GalleryItem,
  type GameBucket,
  type GameLast,
  type GamePhase,
  type GameRow,
  type GameStanding,
  type GameStandings,
  type GameView,
  type Question,
  type QuizDetail,
  type SessionStatus,
  type SessionUser,
  type SqlSampleResult,
  type StudentQuestion,
  normalizeJoinKey,
} from "@examora/contract";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Context, Effect, Layer, PubSub, Semaphore, Stream } from "effect";
import { Assets } from "../Assets.ts";
import { Database } from "../Database.ts";
import { answers, attempts, classMembers, quizSessions, quizzes, sessionStudents, students, users } from "../database/schemas/index.ts";
import { LiveHub } from "../Live.ts";
import {
  attemptPaper,
  cleanAnswer,
  flatQuestions,
  keepOwnPictures,
  loadQuizDetail,
  Quizzes,
  toSession,
} from "../Quizzes.ts";
import { Runner } from "../Runner.ts";
import { runSqlChecks, sampleResult } from "../sql-grader.ts";

// Seconds the standings of a finished game stay in memory.
const keepEndedMs = 30 * 60_000;
const topRows = 20;
const playerRows = 10;
// Signed image URLs last ten minutes; ask again after five.
const urlsFreshMs = 5 * 60_000;

type Done = { correct: boolean | null; earned: number };

type Player = {
  attemptId: string;
  userId: string;
  name: string;
  seed: number;
  points: number;
  streak: number;
  // What this player did with each question they got an answer (or a timeout) for.
  done: Map<string, Done>;
  // Student-paced: the question the player is on and when it was shown. `startedAt` null: hasn't pressed Play.
  index: number;
  startedAt: number | null;
  finished: boolean;
  paper: Question[] | null;
};

// Who a published change is for.
type Signal = { to: "all" } | { to: "presenter" } | { to: "user"; userId: string };

type Extras = { at: number; sample: SqlSampleResult | null; urls: Record<string, string> };

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
  bus: PubSub.PubSub<Signal>;
  lock: Semaphore.Semaphore;
  extras: Map<string, Extras>;
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
    readonly validate: (quizId: string, pacing: "teacher" | "student") => Effect.Effect<void, Conflict>;
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
    readonly end: (sessionId: string) => Effect.Effect<void, NotFound>;
    readonly kick: (sessionId: string, attemptId: string) => Effect.Effect<void, NotFound>;
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
>()("examora/api/Game") {
  static readonly layer = Layer.effect(
    Game,
    Effect.gen(function* () {
      const db = yield* Database;
      const quizzesService = yield* Quizzes;
      const runner = yield* Runner;
      const assets = yield* Assets;
      const hub = yield* LiveHub;

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
        const questions = flatQuestions(attemptPaper(detail, seed));
        const rows = yield* db.query((d) =>
          d
            .select({ attempt: attempts, name: users.name })
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
            })
            .from(answers)
            .innerJoin(attempts, eq(answers.attemptId, attempts.id))
            .where(and(eq(attempts.sessionId, sessionId), sql`${answers.gamePointsEarned} is not null`)),
        );
        const bus = yield* PubSub.unbounded<Signal>();
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
          bus,
          lock: Semaphore.makeUnsafe(1),
          extras: new Map(),
        };
        for (const { attempt, name } of rows) {
          const p: Player = {
            attemptId: attempt.id,
            userId: attempt.studentId,
            name,
            seed: attempt.seed,
            points: attempt.points,
            streak: attempt.gameStreak,
            done: new Map(),
            index: attempt.questionIndex,
            startedAt: pacing === "student" ? (attempt.questionStartedAt?.getTime() ?? null) : null,
            finished: attempt.status !== "in_progress" && pacing === "student",
            paper: null,
          };
          room.players.set(p.attemptId, p);
          room.byUser.set(p.userId, p);
        }
        for (const r of done) room.players.get(r.attemptId)?.done.set(r.questionId, { correct: r.correct, earned: r.earned ?? 0 });
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
          if (i < topRows) room.board.push({ rank, attemptId: p.attemptId, name: p.name, points: p.points });
        });
        room.boardDirty = false;
      }

      const publish = (room: Room, signal: Signal) => PubSub.publish(room.bus, signal).pipe(Effect.asVoid);

      // --- The questions as screens see them ---

      const extrasOf = Effect.fn("Game.extras")(function* (room: Room, q: Question) {
        const cached = room.extras.get(q.id);
        if (cached && Date.now() - cached.at < urlsFreshMs) return cached;
        const student = toStudentQuestion(q);
        const sample = q.type === "sql" ? yield* Effect.promise(() => sampleResult(q)).pipe(Effect.catchDefect(() => Effect.succeed(null))) : null;
        const urls = yield* assets.paperUrls("", assetIdsIn(JSON.stringify(student)));
        const extras: Extras = { at: Date.now(), sample, urls };
        room.extras.set(q.id, extras);
        return extras;
      });

      const studentQuestion = Effect.fn("Game.studentQuestion")(function* (room: Room, q: Question, seed: number) {
        const extras = yield* extrasOf(room, q);
        const student = toStudentQuestion(q, paperRandom(room.detail.quiz.settings, seed, q.id));
        const question: StudentQuestion = q.type === "sql" && extras.sample ? { ...(student as StudentQuestion & { type: "sql" }), sampleResult: extras.sample } : student;
        return { question, urls: extras.urls };
      });

      const paperOf = (room: Room, p: Player) => (p.paper ??= room.pacing === "teacher" ? room.questions : flatQuestions(attemptPaper(room.detail, p.seed)));

      // --- The view of one screen ---

      const viewFor = Effect.fn("Game.view")(function* (room: Room, viewer: Viewer) {
        const now = Date.now();
        const player = viewer.kind === "player" ? room.byUser.get(viewer.userId) : undefined;
        const presenter = viewer.kind === "presenter";
        const teacherPaced = room.pacing === "teacher";
        const count = room.questions.length;
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
              reveal = { buckets: [], answer: answerText(q), answered: 1 };
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
              points: teacherPaced ? (ranked?.points ?? 0) : player.points,
              rank: ranked?.rank ?? room.players.size,
              streak: player.streak,
              answered,
              last,
            }
          : null;
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
          showLeaderboard: room.leaderboard,
          playerCount: room.players.size,
          answeredCount: presenter ? (teacherPaced ? room.answeredNow.size : [...room.players.values()].filter((p) => p.finished).length) : 0,
          lobby: presenter && phase === "lobby" ? [...room.players.values()].map((p) => ({ attemptId: p.attemptId, name: p.name })) : [],
          reveal,
          leaderboard: showBoard ? room.board.slice(0, presenter ? topRows : playerRows) : [],
          me,
          finished,
        } satisfies GameView;
      });

      const stream = (sessionId: string, viewer: Viewer): Stream.Stream<GameView> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const room = yield* roomOf(sessionId);
            if (!room) return Stream.empty;
            // Subscribe before the first view is built, so nothing in between is lost.
            const subscription = yield* PubSub.subscribe(room.bus);
            let lastSent = "";
            const relevant = (s: Signal) =>
              s.to === "all" || (viewer.kind === "presenter" ? s.to === "presenter" : s.to === "user" && s.userId === viewer.userId);
            return Stream.concat(Stream.make<Signal[]>({ to: "all" }), Stream.fromSubscription(subscription)).pipe(
              Stream.filter(relevant),
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
            })
            .where(eq(quizSessions.id, room.id)),
        );

      const openQuestion = Effect.fn("Game.openQuestion")(function* (room: Room, index: number) {
        room.phase = "question";
        room.index = index;
        room.questionStartedAt = Date.now();
        room.closing = false;
        room.answeredNow.clear();
        room.tally.clear();
        room.lastResult.clear();
        yield* persistPosition(room);
        yield* publish(room, { to: "all" });
      });

      // Closes the open question: those who didn't answer lose their streak, the standings update, the answers
      // split is shown. Safe to call twice (the timer and the last answer can arrive together).
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
            if (breaksStreak.length > 0)
              yield* db.query((d) =>
                d.update(attempts).set({ gameStreak: 0 }).where(inArray(attempts.id, breaksStreak.map((p) => p.attemptId))),
              );
            room.phase = "reveal";
            room.closing = false;
            recomputeBoard(room);
            yield* persistPosition(room);
            yield* publish(room, { to: "all" });
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
      const gradeAll = (room: Room) =>
        Effect.gen(function* () {
          const open = yield* db.query((d) =>
            d
              .select({ id: attempts.id })
              .from(attempts)
              .where(and(eq(attempts.sessionId, room.id), eq(attempts.status, "in_progress"))),
          );
          yield* Effect.forEach(open, (a) => quizzesService.submit({ attemptId: a.id, auto: false }), { concurrency: 6, discard: true });
          yield* hub.sessionChanged(room.id);
        }).pipe(Effect.catchCause((cause) => Effect.logError("Grading the game failed", cause)));

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
        const correct = fraction === null ? null : fraction === 1;
        p.points += points.earned;
        p.streak = points.streak;
        p.done.set(q.id, { correct, earned: points.earned });
        if (room.pacing === "teacher") {
          room.lastResult.set(p.attemptId, { correct, answered: true, earned: points.earned });
          for (const key of tallyKeys(q, value, fraction)) room.tally.set(key, (room.tally.get(key) ?? 0) + 1);
        }
        yield* db.query(async (d) => {
          await d
            .insert(answers)
            .values({
              attemptId: p.attemptId,
              questionId: q.id,
              value: timedOut ? null : value,
              correct,
              autoScore: fraction,
              timeMs: timedOut ? null : Math.round(elapsedMs),
              gamePointsEarned: points.earned,
            })
            .onConflictDoNothing();
          await d.update(attempts).set({ points: p.points, gameStreak: p.streak }).where(eq(attempts.id, p.attemptId));
        });
        room.boardDirty = true;
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
          if (room.answeredNow.has(p.attemptId)) return yield* new Conflict({ message: "You already answered this question." });
          q = room.questions[room.index];
          openedAt = room.questionStartedAt;
        } else {
          if (room.status !== "running" || p.startedAt === null || p.finished) return yield* new Conflict({ message: "The game isn't running for you." });
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
        if (room.pacing === "teacher") {
          room.presenterDirty = true;
          if (room.answeredNow.size >= room.players.size) yield* closeQuestion(room, room.index);
        } else {
          yield* publish(room, { to: "user", userId });
        }
      });

      const next = Effect.fn("Game.next")(function* (userId: string, sessionId: string) {
        const room = yield* needRoom(sessionId);
        if (room.pacing !== "student") return yield* new Conflict({ message: "The teacher moves this game along." });
        const p = room.byUser.get(userId);
        if (!p) return yield* new Forbidden({ message: "Join the game first." });
        if (room.status !== "running") return yield* new Conflict({ message: "The game isn't running." });
        const now = Date.now();
        if (p.finished) return;
        const paper = paperOf(room, p);
        if (p.startedAt === null) {
          p.index = 0;
        } else {
          const q = paper[p.index];
          if (q && !p.done.has(q.id)) return yield* new Conflict({ message: "Answer the question first." });
          if (p.index + 1 >= paper.length) {
            p.finished = true;
            yield* Effect.sync(() => void (room.presenterDirty = true));
            yield* quizzesService.submit({ attemptId: p.attemptId, auto: false }).pipe(Effect.forkDetach);
            yield* publish(room, { to: "user", userId });
            return;
          }
          p.index++;
        }
        p.startedAt = now;
        yield* db.query((d) =>
          d.update(attempts).set({ questionIndex: p.index, questionStartedAt: new Date(now) }).where(eq(attempts.id, p.attemptId)),
        );
        yield* publish(room, { to: "user", userId });
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
        const [user] = yield* db.query((d) => d.select({ name: users.name }).from(users).where(eq(users.id, userId)));
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
          seed: attempt.seed,
          points: attempt.points,
          streak: attempt.gameStreak,
          done: new Map(),
          index: attempt.questionIndex,
          startedAt: null,
          finished: false,
          paper: null,
        };
        room.players.set(p.attemptId, p);
        room.byUser.set(userId, p);
        room.presenterDirty = true;
        room.boardDirty = true;
        yield* publish(room, { to: "user", userId });
      });

      const kick = Effect.fn("Game.kick")(function* (sessionId: string, attemptId: string) {
        const room = yield* needRoom(sessionId);
        const p = room.players.get(attemptId);
        if (!p) return yield* noGame;
        room.players.delete(attemptId);
        room.byUser.delete(p.userId);
        room.answeredNow.delete(attemptId);
        // Out of the game for good: no seat, and no way to join again with the key (the roster row stays, marked removed).
        yield* db.query((d) =>
          d.transaction(async (tx) => {
            await tx.delete(attempts).where(eq(attempts.id, attemptId));
            await tx
              .update(sessionStudents)
              .set({ removedAt: new Date() })
              .where(and(eq(sessionStudents.sessionId, sessionId), eq(sessionStudents.studentId, p.userId)));
          }),
        );
        room.presenterDirty = true;
        room.boardDirty = true;
        yield* publish(room, { to: "user", userId: p.userId });
        // Everyone else may now have answered.
        if (room.pacing === "teacher" && room.phase === "question" && room.players.size > 0 && room.answeredNow.size >= room.players.size)
          yield* closeQuestion(room, room.index);
      });

      // --- The teacher's controls ---

      const validate = Effect.fn("Game.validate")(function* (quizId: string, pacing: "teacher" | "student") {
        const [quiz] = yield* db.query((d) => d.select().from(quizzes).where(eq(quizzes.id, quizId)));
        if (!quiz) return yield* new Conflict({ message: "That quiz doesn't exist." });
        const detail = yield* db.query((d) => loadQuizDetail(d, quiz));
        const problems = gameQuestionProblems(pacing, flatQuestions(detail.parts));
        if (problems.length > 0) return yield* new Conflict({ message: problems.join(" ") });
      });

      const openLobby = Effect.fn("Game.openLobby")(function* (sessionId: string) {
        const room = yield* needRoom(sessionId);
        if (room.status === "ended") return yield* new Conflict({ message: "This game is over." });
        if (room.status !== "scheduled") return;
        yield* validate(room.detail.quiz.id, room.pacing);
        room.status = "lobby";
        room.phase = "lobby";
        yield* db.query((d) => d.update(quizSessions).set({ status: "lobby" }).where(eq(quizSessions.id, sessionId)));
        yield* publish(room, { to: "all" });
        yield* hub.sessionChanged(sessionId);
      });

      const start = Effect.fn("Game.start")(function* (sessionId: string) {
        const room = yield* needRoom(sessionId);
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

      const advance = Effect.fn("Game.advance")(function* (sessionId: string) {
        const room = yield* needRoom(sessionId);
        if (room.pacing !== "teacher") return yield* new Conflict({ message: "Players move through a student-paced game themselves." });
        const last = room.index + 1 >= room.questions.length;
        switch (room.phase) {
          case "question":
            return yield* closeQuestion(room, room.index);
          case "reveal": {
            if (last) return yield* finish(room);
            if (!room.leaderboard) return yield* room.lock.withPermits(1)(openQuestion(room, room.index + 1));
            return yield* room.lock.withPermits(1)(
              Effect.gen(function* () {
                if (room.phase !== "reveal") return;
                room.phase = "leaderboard";
                yield* persistPosition(room);
                yield* publish(room, { to: "all" });
              }),
            );
          }
          case "leaderboard":
            return last ? yield* finish(room) : yield* room.lock.withPermits(1)(openQuestion(room, room.index + 1));
          default:
            return yield* new Conflict({ message: "The game isn't running." });
        }
      });

      const end = Effect.fn("Game.end")(function* (sessionId: string) {
        const room = yield* needRoom(sessionId);
        yield* finish(room);
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
            .select({ attempt: attempts, name: users.name, studentId: students.id })
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
        const byAttempt = new Map(stats.map((s) => [s.attemptId, s]));
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
            points: r.attempt.points,
            correct: s?.correct ?? 0,
            answered: s?.answered ?? 0,
            averageMs: s?.averageMs ?? null,
          };
        });
        const mine = userId === null ? null : (rows.find((r) => r.attempt.studentId === userId)?.attempt.id ?? null);
        return {
          title: head.title,
          questionCount: flatQuestions((yield* needRoom(sessionId)).detail.parts).length,
          ended: head.session.status === "ended",
          standings: list,
          myAttemptId: mine,
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
          if (room.pacing === "teacher" && room.phase === "question" && !room.closing && room.questionStartedAt !== null) {
            if (now >= room.questionStartedAt + room.seconds * 1000) yield* closeQuestion(room, room.index);
          }
          if (room.pacing === "student" && room.status === "running") {
            for (const p of room.players.values()) {
              if (p.finished || p.startedAt === null) continue;
              const q = paperOf(room, p)[p.index];
              if (!q || p.done.has(q.id) || now <= p.startedAt + room.seconds * 1000 + gameGraceMs) continue;
              p.done.set(q.id, { correct: false, earned: 0 });
              yield* settle(room, p, q, null, room.seconds * 1000, true);
              yield* publish(room, { to: "user", userId: p.userId });
            }
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
        end,
        kick,
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
  game: { questionSeconds: number } | null,
): string | null {
  if (mode !== "game") return pacing === "teacher" ? "Only a game can be teacher-paced." : null;
  if (game === null) return "Choose the game settings.";
  return null;
}

// The session columns a game sets. Everything else keeps "student" pacing and no game settings. A game has no time
// limit of its own: questions run on the game's per-question clock, every player gets one go.
export function gameColumns(
  mode: string,
  pacing: "teacher" | "student",
  game: { questionSeconds: number; showLeaderboard: boolean; streakBonus: boolean } | null,
) {
  if (mode !== "game" || game === null) return { pacing: "student" as const };
  return {
    pacing,
    gameQuestionSeconds: game.questionSeconds,
    gameLeaderboard: game.showLeaderboard,
    gameStreakBonus: game.streakBonus,
    timeLimitMinutes: null,
    attemptsAllowed: 1,
    oneQuestionAtATime: false,
    navigation: "free" as const,
    maxMarked: 0,
    questionTimeLimitSeconds: null,
  };
}
