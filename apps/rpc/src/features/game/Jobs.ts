import { Effect, Layer, Schedule } from "effect";
import { Game } from "./Service.ts";

// Twice a second: close game questions whose time is up, and send standings. Games that were running when the
// API stopped load first, so they carry on where they were.
export const GameTicker = Layer.effectDiscard(
  Effect.gen(function* () {
    const game = yield* Game;
    yield* game.resume;
    yield* game.tick.pipe(Effect.repeat(Schedule.spaced("500 millis")), Effect.forkScoped);
  }),
);
