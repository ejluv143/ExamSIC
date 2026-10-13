import { AttemptRpcs } from "@examinus/contract";
import { Effect, Layer } from "effect";
import { requirePermission } from "../auth/Session.ts";
import { Coach } from "./Coach.ts";
import { Results } from "./Results.ts";
import { Saving } from "./Saving.ts";
import { Taking } from "./Taking.ts";

// The procedures of `AttemptRpcs` except `attempt.masteryState` and `attempt.masteryAnswer`, which features/mastery serves.
export const AttemptHandlers = Layer.mergeAll(
  AttemptRpcs.toLayerHandler(
    "attempt.mine",
    Effect.gen(function* () {
      const taking = yield* Taking;
      return Effect.fn("attempt.mine")(function* () {
        const user = yield* requirePermission({ attempt: ["read"] });
        return yield* taking.mine(user.id);
      });
    }),
  ),
  AttemptRpcs.toLayerHandler(
    "attempt.paper",
    Effect.gen(function* () {
      const taking = yield* Taking;
      return Effect.fn("attempt.paper")(function* (payload, { headers }) {
        const user = yield* requirePermission({ attempt: ["read"] });
        return yield* taking.paper(user.id, payload, headers);
      });
    }),
  ),
  AttemptRpcs.toLayerHandler(
    "attempt.start",
    Effect.gen(function* () {
      const taking = yield* Taking;
      return Effect.fn("attempt.start")(function* (payload, { headers }) {
        const user = yield* requirePermission({ attempt: ["create"] });
        return yield* taking.start(user.id, payload, headers);
      });
    }),
  ),
  AttemptRpcs.toLayerHandler(
    "attempt.goTo",
    Effect.gen(function* () {
      const taking = yield* Taking;
      return Effect.fn("attempt.goTo")(function* (payload, { headers }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        return yield* taking.goTo(user.id, payload, headers);
      });
    }),
  ),
  AttemptRpcs.toLayerHandler(
    "attempt.setMarked",
    Effect.gen(function* () {
      const taking = yield* Taking;
      return Effect.fn("attempt.setMarked")(function* (payload, { headers }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        return yield* taking.setMarked(user.id, payload, headers);
      });
    }),
  ),
  AttemptRpcs.toLayerHandler(
    "attempt.saveAnswer",
    Effect.gen(function* () {
      const saving = yield* Saving;
      return Effect.fn("attempt.saveAnswer")(function* (payload, { headers }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        return yield* saving.saveAnswer(user.id, payload, headers);
      });
    }),
  ),
  AttemptRpcs.toLayerHandler(
    "attempt.runSampleTests",
    Effect.gen(function* () {
      const saving = yield* Saving;
      return Effect.fn("attempt.runSampleTests")(function* (payload) {
        const user = yield* requirePermission({ attempt: ["update"] });
        return yield* saving.runSampleTests(user.id, payload);
      });
    }),
  ),
  AttemptRpcs.toLayerHandler(
    "attempt.submit",
    Effect.gen(function* () {
      const saving = yield* Saving;
      return Effect.fn("attempt.submit")(function* (payload, { headers }) {
        const user = yield* requirePermission({ attempt: ["create"] });
        return yield* saving.submit(user.id, payload, headers);
      });
    }),
  ),
  AttemptRpcs.toLayerHandler(
    "attempt.recordEvents",
    Effect.gen(function* () {
      const saving = yield* Saving;
      return Effect.fn("attempt.recordEvents")(function* (payload, { headers }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        return yield* saving.recordEvents(user.id, payload, headers);
      });
    }),
  ),
  AttemptRpcs.toLayerHandler(
    "attempt.heartbeat",
    Effect.gen(function* () {
      const saving = yield* Saving;
      return Effect.fn("attempt.heartbeat")(function* (payload, { headers }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        return yield* saving.heartbeat(user.id, payload, headers);
      });
    }),
  ),
  AttemptRpcs.toLayerHandler(
    "attempt.result",
    Effect.gen(function* () {
      const results = yield* Results;
      return Effect.fn("attempt.result")(function* ({ sessionId }) {
        const user = yield* requirePermission({ attempt: ["read"] });
        return (yield* results.latest(sessionId, user.id)).result;
      });
    }),
  ),
  AttemptRpcs.toLayerHandler(
    "attempt.myScores",
    Effect.gen(function* () {
      const results = yield* Results;
      return Effect.fn("attempt.myScores")(function* () {
        const user = yield* requirePermission({ attempt: ["read"] });
        return yield* results.myScores(user.id);
      });
    }),
  ),
  AttemptRpcs.toLayerHandler(
    "attempt.coach",
    Effect.gen(function* () {
      const coach = yield* Coach;
      return Effect.fn("attempt.coach")(function* ({ sessionId }) {
        const user = yield* requirePermission({ attempt: ["read"] });
        return yield* coach.coach(sessionId, user.id);
      });
    }),
  ),
);
