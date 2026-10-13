import { SessionRpcs } from "@examinus/contract/session";
import { Effect, Layer } from "effect";
import { requirePermission } from "../auth/Session.ts";
import { ExamService } from "./Service.ts";

// The teacher's exam actions of `SessionRpcs`; the rest of the group is served by features/session.
export const ExamHandlers = Layer.mergeAll(
  SessionRpcs.toLayerHandler(
    "session.allowBackIn",
    Effect.gen(function* () {
      const exams = yield* ExamService;
      return Effect.fn("session.allowBackIn")(function* ({ attemptId }) {
        const user = yield* requirePermission({ session: ["host"] });
        yield* exams.allowBackIn(attemptId, user.id);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.grantRetake",
    Effect.gen(function* () {
      const exams = yield* ExamService;
      return Effect.fn("session.grantRetake")(function* ({ attemptId, reason }) {
        const user = yield* requirePermission({ session: ["host"] });
        yield* exams.grantRetake(attemptId, user.id, reason);
      });
    }),
  ),
  SessionRpcs.toLayerHandler(
    "session.examRecord",
    Effect.gen(function* () {
      const exams = yield* ExamService;
      return Effect.fn("session.examRecord")(function* ({ attemptId }) {
        const user = yield* requirePermission({ session: ["read"] });
        return yield* exams.record(attemptId, user.id);
      });
    }),
  ),
);
