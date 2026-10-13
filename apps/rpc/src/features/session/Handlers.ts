// The session RPCs, thin: check the permission, call the service. `session.examRecord`, `session.grantRetake` and
// `session.allowBackIn` belong to the exam feature.
import { SessionRpcs } from "@examinus/contract";
import { Effect, Layer } from "effect";
import { requirePermission } from "../auth/Session.ts";
import { SessionLifecycle } from "./Lifecycle.ts";
import { SessionLiveActions } from "./LiveActions.ts";
import { SessionReports } from "./Reports.ts";

const lifecycle = Layer.mergeAll(
  SessionRpcs.toLayerHandler(
    "session.create",
    Effect.gen(function* () {
      const sessions = yield* SessionLifecycle;
      return Effect.fn("session.create")(function* (input) {
        const user = yield* requirePermission({ session: ["create"] });
        return yield* sessions.create(user.id, input);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.update",
    Effect.gen(function* () {
      const sessions = yield* SessionLifecycle;
      return Effect.fn("session.update")(function* (input) {
        const user = yield* requirePermission({ session: ["create"] });
        return yield* sessions.update(user.id, input);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.list",
    Effect.gen(function* () {
      const sessions = yield* SessionLifecycle;
      return Effect.fn("session.list")(function* (filter) {
        const user = yield* requirePermission({ session: ["read"] });
        return yield* sessions.list(user.id, filter);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.get",
    Effect.gen(function* () {
      const sessions = yield* SessionLifecycle;
      return Effect.fn("session.get")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["read"] });
        return yield* sessions.get(user.id, sessionId);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.start",
    Effect.gen(function* () {
      const sessions = yield* SessionLifecycle;
      return Effect.fn("session.start")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["host"] });
        return yield* sessions.start(user.id, sessionId);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.end",
    Effect.gen(function* () {
      const sessions = yield* SessionLifecycle;
      return Effect.fn("session.end")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["host"] });
        return yield* sessions.end(user.id, sessionId);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.remove",
    Effect.gen(function* () {
      const sessions = yield* SessionLifecycle;
      return Effect.fn("session.remove")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["create"] });
        yield* sessions.remove(user.id, sessionId);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.releaseResults",
    Effect.gen(function* () {
      const sessions = yield* SessionLifecycle;
      return Effect.fn("session.releaseResults")(function* ({ sessionId, released }) {
        const user = yield* requirePermission({ result: ["release"] });
        return yield* sessions.releaseResults(user.id, sessionId, released);
      });
    }),
  ),
);

const liveActions = Layer.mergeAll(
  SessionRpcs.toLayerHandler(
    "session.pause",
    Effect.gen(function* () {
      const actions = yield* SessionLiveActions;
      return Effect.fn("session.pause")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["host"] });
        return yield* actions.pause(user.id, sessionId);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.resume",
    Effect.gen(function* () {
      const actions = yield* SessionLiveActions;
      return Effect.fn("session.resume")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["host"] });
        return yield* actions.resume(user.id, sessionId);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.addTime",
    Effect.gen(function* () {
      const actions = yield* SessionLiveActions;
      return Effect.fn("session.addTime")(function* (input) {
        const user = yield* requirePermission({ session: ["host"] });
        yield* actions.addTime(user.id, input);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.warn",
    Effect.gen(function* () {
      const actions = yield* SessionLiveActions;
      return Effect.fn("session.warn")(function* ({ attemptId, message }) {
        const user = yield* requirePermission({ session: ["host"] });
        yield* actions.warn(user.id, attemptId, message);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.setLocked",
    Effect.gen(function* () {
      const actions = yield* SessionLiveActions;
      return Effect.fn("session.setLocked")(function* ({ attemptId, locked }) {
        const user = yield* requirePermission({ session: ["host"] });
        yield* actions.setLocked(user.id, attemptId, locked);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.forceSubmit",
    Effect.gen(function* () {
      const actions = yield* SessionLiveActions;
      return Effect.fn("session.forceSubmit")(function* ({ attemptId }) {
        const user = yield* requirePermission({ session: ["host"] });
        yield* actions.forceSubmit(user.id, attemptId);
      });
    }),
  ),
);

const reports = Layer.mergeAll(
  SessionRpcs.toLayerHandler(
    "session.attempts",
    Effect.gen(function* () {
      const reports = yield* SessionReports;
      return Effect.fn("session.attempts")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["read"] });
        return yield* reports.attempts(user.id, sessionId);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.liveAttempt",
    Effect.gen(function* () {
      const reports = yield* SessionReports;
      return Effect.fn("session.liveAttempt")(function* ({ attemptId }) {
        const user = yield* requirePermission({ session: ["read"] });
        return yield* reports.liveAttempt(user.id, attemptId);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.classScores",
    Effect.gen(function* () {
      const reports = yield* SessionReports;
      return Effect.fn("session.classScores")(function* ({ classId }) {
        const user = yield* requirePermission({ session: ["read"] });
        return yield* reports.classScores(user.id, classId);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.grade",
    Effect.gen(function* () {
      const reports = yield* SessionReports;
      return Effect.fn("session.grade")(function* (input) {
        const user = yield* requirePermission({ submission: ["grade"] });
        return yield* reports.grade(user.id, input);
      });
    }),
  ),
);

export const SessionHandlers = Layer.mergeAll(lifecycle, liveActions, reports);
