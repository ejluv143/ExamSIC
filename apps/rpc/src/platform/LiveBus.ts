import { RedisClient } from "bun";
import { Context, Effect, Layer, Queue, Redacted, Schema, Scope, Stream } from "effect";
import { AppConfig } from "./AppConfig.ts";

export class LiveBusError extends Schema.TaggedError<LiveBusError>()("LiveBusError", {
  cause: Schema.Defect(),
}) {}

// The event channels between what happens (an answer saved, a game point scored) and whoever watches it live,
// possibly on another API instance. A channel carries JSON messages; nothing is stored, so a message is seen only by
// those subscribed when it is published. Callers hide behind this interface so the transport can change (it is
// Dragonfly pub/sub today). Failures are defects, as for the cache.
export class LiveBus extends Context.Service<
  LiveBus,
  {
    readonly publish: (channel: string, message: unknown) => Effect.Effect<void>;
    // Listens from now until the scope closes (subscribe first, then read the state, and nothing published in
    // between is lost); the stream hands the messages over.
    readonly subscribe: <A>(channel: string) => Effect.Effect<Stream.Stream<A>, never, Scope.Scope>;
  }
>()("examinus/api/LiveBus") {
  static readonly layer = Layer.effect(
    LiveBus,
    Effect.gen(function* () {
      const url = Redacted.value((yield* AppConfig).cache.url);
      const open = Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const c = new RedisClient(url);
            await c.connect();
            return c;
          },
          catch: (cause) => new LiveBusError({ cause }),
        }).pipe(Effect.orDie),
        (c) => Effect.sync(() => c.close()),
      );
      const publisher = yield* open;
      // A connection in subscriber mode can't run other commands, so subscriptions get their own.
      const subscriber = yield* open;

      const prefix = (channel: string) => `examinus:${channel}`;
      const run = <A>(f: () => Promise<A>) =>
        Effect.tryPromise({ try: f, catch: (cause) => new LiveBusError({ cause }) }).pipe(Effect.orDie);

      return LiveBus.of({
        publish: (channel, message) => run(() => publisher.publish(prefix(channel), JSON.stringify(message))).pipe(Effect.asVoid),
        subscribe: <A>(channel: string) =>
          Effect.gen(function* () {
            const queue = yield* Queue.unbounded<A>();
            const listener = (message: string) => void Queue.offerUnsafe(queue, JSON.parse(message) as A);
            yield* Effect.acquireRelease(run(() => subscriber.subscribe(prefix(channel), listener)), () =>
              run(() => subscriber.unsubscribe(prefix(channel), listener)).pipe(Effect.ignore),
            );
            return Stream.fromQueue(queue);
          }),
      });
    }),
  );
}
