import { SessionRpcs } from "@examinus/contract/session";
import { Effect, Layer } from "effect";
import { requireActor } from "../auth/Session.ts";
import { ExamService } from "./Service.ts";

// The teacher's exam actions of `SessionRpcs`; the rest of the group is served by features/session.
export const ExamHandlers = Layer.mergeAll(
  SessionRpcs.toLayerHandler(
    "session.allowBackIn",
    Effect.gen(function* () {
      const exams = yield* ExamService;
      return Effect.fn("session.allowBackIn")(function* ({ attemptId }) {
        const user = yield* requireActor({ session: ["host"] });
        yield* exams.allowBackIn(attemptId, user.actor);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.grantRetake",
    Effect.gen(function* () {
      const exams = yield* ExamService;
      return Effect.fn("session.grantRetake")(function* ({ attemptId, reason }) {
        const user = yield* requireActor({ session: ["host"] });
        yield* exams.grantRetake(attemptId, user.actor, reason);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.examRecord",
    Effect.gen(function* () {
      const exams = yield* ExamService;
      return Effect.fn("session.examRecord")(function* ({ attemptId }) {
        const user = yield* requireActor({ session: ["read"] });
        return yield* exams.record(attemptId, user.actor);
      });
    }),
  ),
);
