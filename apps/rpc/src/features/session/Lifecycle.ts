// A session's life: created from a quiz, changed while it waits or runs, started, ended, removed.
import { Conflict, NotFound } from "@examinus/contract/errors";
import { type QuizDetail } from "@examinus/contract/quiz";
import { type SessionListItem, type SessionSettingsFields } from "@examinus/contract/session";
import { type Session } from "@examinus/domain/quiz";
import { Context, Effect, Layer } from "effect";
import { type Actor } from "../auth/Session.ts";
import { Game } from "../game/Service.ts";
import { LiveHub } from "../live/Service.ts";
import { QuizRepo } from "../quiz/Repo.ts";
import { toSession } from "./mappers.ts";
import { SessionRepo } from "./Repo.ts";
import { sessionStatus } from "./rules.ts";
import { SessionService } from "./Service.ts";
import { settingsColumns } from "./settings.ts";

export type NewSession = SessionSettingsFields & { quizId: string; classId: string | null; startNow: boolean };
export type SessionChanges = SessionSettingsFields & { sessionId: string; classId: string | null };

export class SessionLifecycle extends Context.Service<
  SessionLifecycle,
  {
    readonly create: (actor: Actor, input: NewSession) => Effect.Effect<Session, NotFound | Conflict>;
    // Once a session has opened, what students already see or started with stays: the type and pacing, the class,
    // the opening time, the paper rules (one at a time, navigation, marks), the anti-cheat rules and the exam
    // and mastery settings. The rest (schedule end, time limit, attempts, results, late join, password, networks,
    // guests, class record, game clock and leaderboard) can change while it runs.
    readonly update: (actor: Actor, input: SessionChanges) => Effect.Effect<Session, NotFound | Conflict>;
    readonly list: (
      actor: Actor,
      filter: { quizId?: string | undefined; classId?: string | undefined },
    ) => Effect.Effect<SessionListItem[]>;
    readonly get: (
      actor: Actor,
      sessionId: string,
    ) => Effect.Effect<
      {
        session: Session;
        quiz: QuizDetail;
        studentIds: string[];
        roomPassword: string | null;
        relayPassword: string | null;
        relayClues: readonly string[];
        ipAllowlist: readonly string[];
      },
      NotFound
    >;
    readonly start: (actor: Actor, sessionId: string) => Effect.Effect<Session, NotFound | Conflict>;
    readonly end: (actor: Actor, sessionId: string) => Effect.Effect<Session, NotFound>;
    readonly remove: (actor: Actor, sessionId: string) => Effect.Effect<void, NotFound>;
    readonly releaseResults: (actor: Actor, sessionId: string, released: boolean) => Effect.Effect<Session, NotFound>;
  }
>()("examinus/api/SessionLifecycle") {
  static readonly layer = Layer.effect(
    SessionLifecycle,
    Effect.gen(function* () {
      const repo = yield* SessionRepo;
      const quizRepo = yield* QuizRepo;
      const sessions = yield* SessionService;
      const hub = yield* LiveHub;
      const game = yield* Game;

      const reload = (sessionId: string) => repo.find(sessionId).pipe(Effect.map((row) => toSession(row, Date.now())));

      const create = Effect.fn("SessionLifecycle.create")(function* (actor: Actor, { quizId, classId, startNow, ...settings }: NewSession) {
        if (classId !== null) yield* repo.ownClass(classId, actor);
        yield* repo.ownQuiz(quizId, actor);
        const columns = yield* settingsColumns(settings);
        if (startNow && columns.closesAt !== null && columns.closesAt.getTime() <= Date.now())
          return yield* new Conflict({ message: "The close time is already past." });
        if (settings.mode === "game") yield* game.validate(quizId, settings.pacing, settings.game?.relay != null);
        // Opening now: a game opens its lobby below; the other modes are running from this moment.
        const now = new Date();
        const opening =
          startNow && settings.mode !== "game"
            ? { status: "running" as const, startedAt: now, opensAt: now }
            : { status: "scheduled" as const };
        const row = yield* repo.insert({ quizId, classId, ...columns, ...opening });
        if (classId !== null) yield* repo.syncRoster(row.id, classId, false);
        if (startNow && settings.mode === "game") yield* game.openLobby(row.id);
        return yield* reload(row.id);
      });

      const update = Effect.fn("SessionLifecycle.update")(function* (actor: Actor, { sessionId, classId, ...settings }: SessionChanges) {
        const { session } = yield* repo.ownSession(sessionId, actor);
        if (classId !== null) yield* repo.ownClass(classId, actor);
        const status = sessionStatus(session, Date.now());
        if (status === "ended") return yield* new Conflict({ message: "This session has ended." });
        const opened = status !== "scheduled";
        const input = opened
          ? {
              ...settings,
              mode: session.mode,
              pacing: session.pacing,
              opensAt: session.opensAt?.toISOString() ?? null,
              oneQuestionAtATime: session.oneQuestionAtATime,
              questionTimeLimitSeconds: session.questionTimeLimitSeconds,
              navigation: session.navigation,
              maxMarked: session.maxMarked,
              integrity: session.integrity,
              exam: session.exam,
              mastery: session.mastery,
            }
          : settings;
        const columns = yield* settingsColumns(input);
        // Once a relay started, its settings, password and clues stay as they were; in the lobby they can change.
        if (session.mode === "game" && status === "running") {
          const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
          const before = session.relay === null ? null : Object.fromEntries(Object.keys(session.relay).sort().map((k) => [k, (session.relay as Record<string, unknown>)[k]]));
          const after = columns.relay === null ? null : Object.fromEntries(Object.keys(columns.relay).sort().map((k) => [k, (columns.relay as Record<string, unknown>)[k]]));
          if (!same(before, after) || session.relayPassword !== columns.relayPassword || !same(session.relayClues, columns.relayClues))
            return yield* new Conflict({ message: "The Team Relay settings can't change once the game started." });
        }
        const nextClassId = opened ? session.classId : classId;
        if (input.mode === "game" && status !== "running") yield* game.validate(session.quizId, input.pacing, columns.relay !== null);
        yield* repo.update(sessionId, { classId: nextClassId, ...columns });
        // Without a class the roster is whoever joined with the key; editing leaves it alone.
        if (nextClassId !== null) yield* repo.syncRoster(sessionId, nextClassId, nextClassId !== session.classId);
        // A running game keeps its settings in memory.
        if (session.mode === "game") yield* game.applySettings(sessionId);
        return yield* reload(sessionId);
      });

      const list = Effect.fn("SessionLifecycle.list")(function* (
        actor: Actor,
        filter: { quizId?: string | undefined; classId?: string | undefined },
      ) {
        const now = Date.now();
        const rows = yield* repo.list(actor, filter);
        return rows.map((r): SessionListItem => ({
          session: toSession(r.session, now),
          quizTitle: r.quizTitle,
          studentCount: r.studentCount,
          submittedCount: r.submittedCount,
          needsGrading: r.needsGrading,
        }));
      });

      const get = Effect.fn("SessionLifecycle.get")(function* (actor: Actor, sessionId: string) {
        const { session, quiz } = yield* repo.ownSession(sessionId, actor);
        const [detail, studentIds] = yield* Effect.all([quizRepo.detail(quiz), repo.rosterIds(sessionId)]);
        return {
          session: toSession(session, Date.now()),
          quiz: detail,
          studentIds,
          roomPassword: session.roomPassword,
          relayPassword: session.relayPassword,
          relayClues: session.relayClues,
          ipAllowlist: session.ipAllowlist,
        };
      });

      const start = Effect.fn("SessionLifecycle.start")(function* (actor: Actor, sessionId: string) {
        const { session } = yield* repo.ownSession(sessionId, actor);
        const now = new Date();
        if (sessionStatus(session, now.getTime()) === "ended") return yield* new Conflict({ message: "This session has ended." });
        if (session.mode === "game") return yield* new Conflict({ message: "Run a game from its presenter screen." });
        // Starting early (or a session with no opening time) opens it now.
        yield* repo.update(sessionId, {
          status: "running",
          startedAt: session.startedAt ?? now,
          opensAt: session.opensAt && session.opensAt <= now ? session.opensAt : now,
        });
        yield* hub.sessionChanged(sessionId);
        return yield* reload(sessionId);
      });

      const end = Effect.fn("SessionLifecycle.end")(function* (actor: Actor, sessionId: string) {
        const { session } = yield* repo.ownSession(sessionId, actor);
        // A game ends through its room, so the screens show the final standings.
        if (session.mode === "game") yield* game.end(sessionId);
        else yield* sessions.endSession(sessionId);
        return yield* reload(sessionId);
      });

      const remove = Effect.fn("SessionLifecycle.remove")(function* (actor: Actor, sessionId: string) {
        yield* repo.ownSession(sessionId, actor);
        yield* repo.remove(sessionId);
      });

      const releaseResults = Effect.fn("SessionLifecycle.releaseResults")(function* (actor: Actor, sessionId: string, released: boolean) {
        yield* repo.ownSession(sessionId, actor);
        yield* repo.update(sessionId, { resultsReleased: released });
        return yield* reload(sessionId);
      });

      return SessionLifecycle.of({ create, update, list, get, start, end, remove, releaseResults });
    }),
  );
}
