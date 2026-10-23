// What a teacher does to a running session or to one student's attempt. Each action is kept as an incident
// (LiveHub.record) and sent to the screens watching.
import { Conflict, NotFound } from "@examinus/contract/errors";
import { type Accommodations, isEmptyAccommodations } from "@examinus/domain/accommodations";
import { type Session } from "@examinus/domain/quiz";
import { Context, Effect, Layer } from "effect";
import type { QuizSessionItem } from "../../database/schemas/index.ts";
import { AttemptService } from "../attempt/Service.ts";
import { type Actor } from "../auth/Session.ts";
import { LiveHub } from "../live/Service.ts";
import { toSession } from "./mappers.ts";
import { SessionRepo } from "./Repo.ts";
import { sessionStatus } from "./rules.ts";

type Failure = NotFound | Conflict;

export class SessionLiveActions extends Context.Service<
  SessionLiveActions,
  {
    readonly pause: (actor: Actor, sessionId: string) => Effect.Effect<Session, Failure>;
    // Deadlines move by the time the session was paused.
    readonly resume: (actor: Actor, sessionId: string) => Effect.Effect<Session, Failure>;
    // Extra time for one student (attemptId) or everyone still taking the session.
    readonly addTime: (actor: Actor, input: { sessionId: string; attemptId?: string | undefined; seconds: number }) => Effect.Effect<void, Failure>;
    // Sets (null: clears) one student's accommodations; `studentId` is the roster id. Conflict once the session has ended.
    readonly setAccommodations: (
      actor: Actor,
      input: { sessionId: string; studentId: string; accommodations: Accommodations | null },
    ) => Effect.Effect<void, Failure>;
    readonly warn: (actor: Actor, attemptId: string, message: string) => Effect.Effect<void, Failure>;
    // A locked student can't save or submit until unlocked.
    readonly setLocked: (actor: Actor, attemptId: string, locked: boolean) => Effect.Effect<void, Failure>;
    readonly forceSubmit: (actor: Actor, attemptId: string) => Effect.Effect<void, Failure>;
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
      const openAttemptOf = Effect.fn("SessionLiveActions.openAttemptOf")(function* (attemptId: string, actor: Actor) {
        const row = yield* repo.ownAttemptOf(attemptId, actor);
        if (row.attempt.status !== "in_progress") return yield* new Conflict({ message: "That student already submitted." });
        return row.attempt;
      });

      const pause = Effect.fn("SessionLiveActions.pause")(function* (actor: Actor, sessionId: string) {
        const { session } = yield* repo.ownSession(sessionId, actor);
        yield* requireRunning(session);
        if (session.pausedAt) return yield* new Conflict({ message: "The session is already paused." });
        yield* repo.update(sessionId, { pausedAt: new Date() });
        yield* hub.record({ sessionId, attemptId: null, actorId: actor.id, kind: "pause" });
        yield* hub.sessionChanged(sessionId);
        return yield* reload(sessionId);
      });

      const resume = Effect.fn("SessionLiveActions.resume")(function* (actor: Actor, sessionId: string) {
        const { session } = yield* repo.ownSession(sessionId, actor);
        if (!session.pausedAt) return yield* new Conflict({ message: "The session isn't paused." });
        const paused = Date.now() - session.pausedAt.getTime();
        yield* repo.shiftClocks(session, paused, true, { pausedAt: null });
        yield* hub.record({ sessionId, attemptId: null, actorId: actor.id, kind: "resume", seconds: Math.round(paused / 1000) });
        yield* hub.sessionChanged(sessionId);
        return yield* reload(sessionId);
      });

      const addTime = Effect.fn("SessionLiveActions.addTime")(function* (
        actor: Actor,
        { sessionId, attemptId, seconds }: { sessionId: string; attemptId?: string | undefined; seconds: number },
      ) {
        const { session } = yield* repo.ownSession(sessionId, actor);
        yield* requireRunning(session);
        if (attemptId === undefined) {
          yield* repo.shiftClocks(session, seconds * 1000, false, {});
          yield* hub.record({ sessionId, attemptId: null, actorId: actor.id, kind: "add_time", seconds });
          yield* hub.sessionChanged(sessionId);
          return;
        }
        const { attempt } = yield* repo.ownAttemptOf(attemptId, actor);
        if (attempt.sessionId !== sessionId) return yield* new NotFound({ message: "That attempt doesn't exist." });
        if (attempt.status !== "in_progress") return yield* new Conflict({ message: "That student already submitted." });
        yield* repo.updateAttempt(attemptId, { extraMs: attempt.extraMs + seconds * 1000 });
        yield* hub.record({ sessionId, attemptId, actorId: actor.id, kind: "add_time", seconds });
        yield* hub.attemptChanged(attemptId, { state: true });
      });

      const setAccommodations = Effect.fn("SessionLiveActions.setAccommodations")(function* (
        actor: Actor,
        { sessionId, studentId, accommodations }: { sessionId: string; studentId: string; accommodations: Accommodations | null },
      ) {
        const { session } = yield* repo.ownSession(sessionId, actor);
        if (sessionStatus(session, Date.now()) === "ended") return yield* new Conflict({ message: "This session has ended." });
        const stored = isEmptyAccommodations(accommodations) ? null : accommodations;
        const done = yield* repo.setAccommodations(sessionId, studentId, stored);
        if (!done) return yield* new NotFound({ message: "That student isn't on this session's roster." });
        // The student's page gets its new deadline, and the teacher's screens the new row.
        if (done.openAttemptId !== null) yield* hub.attemptChanged(done.openAttemptId, { state: true });
        yield* hub.sessionChanged(sessionId);
      });

      const warn = Effect.fn("SessionLiveActions.warn")(function* (actor: Actor, attemptId: string, message: string) {
        const attempt = yield* openAttemptOf(attemptId, actor);
        yield* hub.warn(attemptId, message);
        yield* hub.record({ sessionId: attempt.sessionId, attemptId, actorId: actor.id, kind: "warn", message });
      });

      const setLocked = Effect.fn("SessionLiveActions.setLocked")(function* (actor: Actor, attemptId: string, locked: boolean) {
        const attempt = yield* openAttemptOf(attemptId, actor);
        yield* repo.updateAttempt(attemptId, { locked });
        yield* hub.record({ sessionId: attempt.sessionId, attemptId, actorId: actor.id, kind: locked ? "lock" : "unlock" });
        yield* hub.attemptChanged(attemptId, { state: true });
      });

      const forceSubmit = Effect.fn("SessionLiveActions.forceSubmit")(function* (actor: Actor, attemptId: string) {
        const attempt = yield* openAttemptOf(attemptId, actor);
        yield* hub.record({ sessionId: attempt.sessionId, attemptId, actorId: actor.id, kind: "force_submit" });
        yield* attemptService.submit({ attemptId, auto: true, reason: "teacher" });
      });

      return SessionLiveActions.of({ pause, resume, addTime, setAccommodations, warn, setLocked, forceSubmit });
    }),
  );
}
