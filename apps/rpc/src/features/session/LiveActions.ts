// What a teacher does to a running session or to one student's attempt. Each action is kept as an incident
// (LiveHub.record) and sent to the screens watching.
import { Conflict, NotFound, type Session } from "@examinus/contract";
import { Context, Effect, Layer } from "effect";
import type { QuizSessionItem } from "../../database/schemas/index.ts";
import { AttemptService } from "../attempt/Service.ts";
import { LiveHub } from "../live/Service.ts";
import { toSession } from "./mappers.ts";
import { SessionRepo } from "./Repo.ts";
import { sessionStatus } from "./rules.ts";

type Failure = NotFound | Conflict;

export class SessionLiveActions extends Context.Service<
  SessionLiveActions,
  {
    readonly pause: (userId: string, sessionId: string) => Effect.Effect<Session, Failure>;
    // Deadlines move by the time the session was paused.
    readonly resume: (userId: string, sessionId: string) => Effect.Effect<Session, Failure>;
    // Extra time for one student (attemptId) or everyone still taking the session.
    readonly addTime: (userId: string, input: { sessionId: string; attemptId?: string | undefined; seconds: number }) => Effect.Effect<void, Failure>;
    readonly warn: (userId: string, attemptId: string, message: string) => Effect.Effect<void, Failure>;
    // A locked student can't save or submit until unlocked.
    readonly setLocked: (userId: string, attemptId: string, locked: boolean) => Effect.Effect<void, Failure>;
    readonly forceSubmit: (userId: string, attemptId: string) => Effect.Effect<void, Failure>;
  }
>()("examinus/api/SessionLiveActions") {
  static readonly layer = Layer.effect(
    SessionLiveActions,
    Effect.gen(function* () {
      const repo = yield* SessionRepo;
      const hub = yield* LiveHub;
      const attemptService = yield* AttemptService;

      const reload = (sessionId: string) => repo.find(sessionId).pipe(Effect.map((row) => toSession(row, Date.now())));

      const requireRunning = Effect.fn("SessionLiveActions.requireRunning")(function* (session: QuizSessionItem) {
        if (sessionStatus(session, Date.now()) !== "running") return yield* new Conflict({ message: "The session isn't running." });
      });

      // The attempt of one of the teacher's sessions, which must still be in progress.
      const openAttemptOf = Effect.fn("SessionLiveActions.openAttemptOf")(function* (attemptId: string, userId: string) {
        const row = yield* repo.ownAttemptOf(attemptId, userId);
        if (row.attempt.status !== "in_progress") return yield* new Conflict({ message: "That student already submitted." });
        return row.attempt;
      });

      const pause = Effect.fn("SessionLiveActions.pause")(function* (userId: string, sessionId: string) {
        const { session } = yield* repo.ownSession(sessionId, userId);
        yield* requireRunning(session);
        if (session.pausedAt) return yield* new Conflict({ message: "The session is already paused." });
        yield* repo.update(sessionId, { pausedAt: new Date() });
        yield* hub.record({ sessionId, attemptId: null, actorId: userId, kind: "pause" });
        yield* hub.sessionChanged(sessionId);
        return yield* reload(sessionId);
      });

      const resume = Effect.fn("SessionLiveActions.resume")(function* (userId: string, sessionId: string) {
        const { session } = yield* repo.ownSession(sessionId, userId);
        if (!session.pausedAt) return yield* new Conflict({ message: "The session isn't paused." });
        const paused = Date.now() - session.pausedAt.getTime();
        yield* repo.shiftClocks(session, paused, true, { pausedAt: null });
        yield* hub.record({ sessionId, attemptId: null, actorId: userId, kind: "resume", seconds: Math.round(paused / 1000) });
        yield* hub.sessionChanged(sessionId);
        return yield* reload(sessionId);
      });

      const addTime = Effect.fn("SessionLiveActions.addTime")(function* (
        userId: string,
        { sessionId, attemptId, seconds }: { sessionId: string; attemptId?: string | undefined; seconds: number },
      ) {
        const { session } = yield* repo.ownSession(sessionId, userId);
        yield* requireRunning(session);
        if (attemptId === undefined) {
          yield* repo.shiftClocks(session, seconds * 1000, false, {});
          yield* hub.record({ sessionId, attemptId: null, actorId: userId, kind: "add_time", seconds });
          yield* hub.sessionChanged(sessionId);
          return;
        }
        const { attempt } = yield* repo.ownAttemptOf(attemptId, userId);
        if (attempt.sessionId !== sessionId) return yield* new NotFound({ message: "That attempt doesn't exist." });
        if (attempt.status !== "in_progress") return yield* new Conflict({ message: "That student already submitted." });
        yield* repo.updateAttempt(attemptId, { extraMs: attempt.extraMs + seconds * 1000 });
        yield* hub.record({ sessionId, attemptId, actorId: userId, kind: "add_time", seconds });
        yield* hub.attemptChanged(attemptId, { state: true });
      });

      const warn = Effect.fn("SessionLiveActions.warn")(function* (userId: string, attemptId: string, message: string) {
        const attempt = yield* openAttemptOf(attemptId, userId);
        yield* hub.warn(attemptId, message);
        yield* hub.record({ sessionId: attempt.sessionId, attemptId, actorId: userId, kind: "warn", message });
      });

      const setLocked = Effect.fn("SessionLiveActions.setLocked")(function* (userId: string, attemptId: string, locked: boolean) {
        const attempt = yield* openAttemptOf(attemptId, userId);
        yield* repo.updateAttempt(attemptId, { locked });
        yield* hub.record({ sessionId: attempt.sessionId, attemptId, actorId: userId, kind: locked ? "lock" : "unlock" });
        yield* hub.attemptChanged(attemptId, { state: true });
      });

      const forceSubmit = Effect.fn("SessionLiveActions.forceSubmit")(function* (userId: string, attemptId: string) {
        const attempt = yield* openAttemptOf(attemptId, userId);
        yield* hub.record({ sessionId: attempt.sessionId, attemptId, actorId: userId, kind: "force_submit" });
        yield* attemptService.submit({ attemptId, auto: true, reason: "teacher" });
      });

      return SessionLiveActions.of({ pause, resume, addTime, warn, setLocked, forceSubmit });
    }),
  );
}
