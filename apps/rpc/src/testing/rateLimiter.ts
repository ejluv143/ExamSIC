// An in-memory RateLimiter for the service tests: the same hit/check/count rules as the real one, without a cache.
// `counts` shows what was counted per "limit:key".
import { TooManyRequests } from "@examinus/contract/errors";
import { Effect, Layer } from "effect";
import { RateLimiter, type Limit } from "../platform/RateLimiter.ts";

export const fakeRateLimiter = () => {
  const counts = new Map<string, number>();
  const keyOf = (limit: Limit, key: string) => `${limit.name}:${key}`;
  const used = (limit: Limit, key: string) => counts.get(keyOf(limit, key)) ?? 0;
  const add = (limit: Limit, key: string) => counts.set(keyOf(limit, key), used(limit, key) + 1);
  const refuse = (limit: Limit) => new TooManyRequests({ message: limit.message });
  const layer = Layer.succeed(
    RateLimiter,
    RateLimiter.of({
      check: (limit, key) => (used(limit, key) >= limit.max ? Effect.fail(refuse(limit)) : Effect.void),
      count: (limit, key) => Effect.sync(() => void add(limit, key)),
      hit: (limit, key) =>
        Effect.suspend(() => {
          if (used(limit, key) >= limit.max) return Effect.fail(refuse(limit));
          add(limit, key);
          return Effect.void;
        }),
    }),
  );
  return { layer, counts, used };
};
