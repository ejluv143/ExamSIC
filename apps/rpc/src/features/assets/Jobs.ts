import { Effect, Layer, Schedule } from "effect";
import { Assets } from "./Service.ts";

// Once a day: delete uploads nothing uses (see Assets.cleanup). A failed run (a database error is a defect) is
// logged and the next day's run tries again, rather than ending the loop.
export const AssetCleanup = Layer.effectDiscard(
  Effect.gen(function* () {
    const assets = yield* Assets;
    yield* assets.cleanup().pipe(
      Effect.catchCause((cause) => Effect.logError("Asset cleanup failed", cause)),
      Effect.repeat(Schedule.spaced("1 day")),
      Effect.forkScoped,
    );
  }),
);
