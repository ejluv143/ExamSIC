import { Effect, Layer, Schedule } from "effect";
import { Checking } from "./Checking.ts";

// Every 10 seconds: check the submitted code answers whose check is due (the runner was busy or down, or the API
// restarted before it ran them). A failed round is logged and the next one runs anyway.
export const CheckSweep = Layer.effectDiscard(
  Effect.gen(function* () {
    const checking = yield* Checking;
    yield* checking.checkDue().pipe(
      Effect.catchCause((cause) => Effect.logWarning("Code check round failed", cause)),
      Effect.repeat(Schedule.spaced("10 seconds")),
      Effect.forkScoped,
    );
  }),
);
