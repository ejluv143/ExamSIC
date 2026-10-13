// In-memory stand-ins for Dragonfly (Cache) and its pub/sub (LiveBus), for the tests of the live and game features.
import { Effect, Queue, Stream } from "effect";
import type { Cache } from "../platform/Cache.ts";
import type { LiveBus } from "../platform/LiveBus.ts";

// A cache with the semantics the services rely on: `claim` is true for the first caller only. Expiry is not
// simulated; the ttl each claim asked for is recorded in `claims` instead.
export const memoryCache = () => {
  const claims = new Map<string, number>();
  const json = new Map<string, unknown>();
  const members = new Map<string, Set<string>>();
  const service: Cache["Service"] = {
    getJson: <A>(key: string) => Effect.sync(() => (json.get(key) as A | undefined) ?? null),
    setJson: (key, value) => Effect.sync(() => void json.set(key, value)),
    del: (key) => Effect.sync(() => void json.delete(key)),
    claim: (key, ttlMs) =>
      Effect.sync(() => {
        if (claims.has(key)) return false;
        claims.set(key, ttlMs);
        return true;
      }),
    windowCount: () => Effect.succeed(0),
    windowAdd: () => Effect.succeed(true),
    touch: (key, member) => Effect.sync(() => void members.set(key, (members.get(key) ?? new Set()).add(member))),
    leave: (key, member) => Effect.sync(() => void members.get(key)?.delete(member)),
    members: (key) => Effect.sync(() => [...(members.get(key) ?? [])]),
  };
  return { service, claims, members };
};

// A bus that delivers to whoever is subscribed at the moment of publishing (like the real one) and records every
// message in `published`.
export const memoryBus = () => {
  const published: Array<{ channel: string; message: unknown }> = [];
  const listeners = new Map<string, Set<Queue.Queue<any>>>();
  const subscribers = (channel: string) => listeners.get(channel)?.size ?? 0;
  const service: LiveBus["Service"] = {
    publish: (channel, message) =>
      Effect.sync(() => {
        published.push({ channel, message });
        for (const queue of listeners.get(channel) ?? []) Queue.offerUnsafe(queue, message);
      }),
    subscribe: <A>(channel: string) =>
      Effect.gen(function* () {
        const queue = yield* Queue.unbounded<A>();
        yield* Effect.acquireRelease(
          Effect.sync(() => void listeners.set(channel, (listeners.get(channel) ?? new Set()).add(queue))),
          () => Effect.sync(() => void listeners.get(channel)?.delete(queue)),
        );
        return Stream.fromQueue(queue);
      }),
  };
  return { service, published, subscribers };
};

// Waits (on the real clock) until a condition holds; for tests that run a stream on another fiber.
export const until = (condition: () => boolean) =>
  Effect.gen(function* () {
    for (let waited = 0; !condition(); waited++) {
      if (waited > 400) return yield* Effect.die(new Error("condition never became true"));
      yield* Effect.sleep("5 millis");
    }
  });
