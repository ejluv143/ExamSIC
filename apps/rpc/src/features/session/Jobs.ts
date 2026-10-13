import { Effect, Layer, Schedule } from "effect";
import { SessionService } from "./Service.ts";

// Every 30 seconds: open and end sessions on schedule, and submit attempts that ran out of time.
export const QuizSweep = Layer.effectDiscard(
  Effect.gen(function* () {
    const sessions = yield* SessionService;
    yield* sessions.sweep.pipe(Effect.repeat(Schedule.spaced("30 seconds")), Effect.forkScoped);
  }),
);
