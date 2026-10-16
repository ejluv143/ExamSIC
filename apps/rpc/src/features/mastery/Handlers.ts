import { AttemptRpcs } from "@examinus/contract/attempt";
import { Conflict } from "@examinus/contract/errors";
import { Effect, Layer } from "effect";
import { playerOf } from "../attempt/rules.ts";
import { AttemptService } from "../attempt/Service.ts";
import { requirePermission } from "../auth/Session.ts";
import { clientIp } from "../../platform/network.ts";
import { MasteryService } from "./Service.ts";

// Mastery mode's two procedures of `AttemptRpcs`; the rest of the group is served by features/attempt.
export const MasteryHandlers = Layer.mergeAll(
  AttemptRpcs.toLayerHandler(
    "attempt.masteryState",
    Effect.gen(function* () {
      const mastery = yield* MasteryService;
      const attempts = yield* AttemptService;
      return Effect.fn("attempt.masteryState")(function* ({ attemptId, deviceId }, { headers }) {
        const user = yield* requirePermission({ attempt: ["read"] });
        const { attempt, session, quiz } = yield* attempts.ownAttempt(attemptId, playerOf(user));
        if (session.mode !== "mastery") return yield* new Conflict({ message: "This isn't a mastery session." });
        if (attempt.status === "in_progress") {
          yield* attempts.requireOpen(attempt, session);
          yield* attempts.guard(attempt, session, deviceId, clientIp(headers), { required: true });
        }
        return yield* mastery.state(playerOf(user), attempt, session, quiz);
      });
    }),
  ),
  AttemptRpcs.toLayerHandler(
    "attempt.masteryAnswer",
    Effect.gen(function* () {
      const mastery = yield* MasteryService;
      const attempts = yield* AttemptService;
      return Effect.fn("attempt.masteryAnswer")(function* ({ attemptId, deviceId, questionId, value, timeSpentMs }, { headers }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        const { attempt, session, quiz } = yield* attempts.ownAttempt(attemptId, playerOf(user));
        if (session.mode !== "mastery") return yield* new Conflict({ message: "This isn't a mastery session." });
        yield* attempts.requireWritable(attempt, session);
        yield* attempts.guard(attempt, session, deviceId, clientIp(headers));
        return yield* mastery.answer(playerOf(user), attempt, session, quiz, questionId, value, timeSpentMs);
      });
    }),
  ),
);
