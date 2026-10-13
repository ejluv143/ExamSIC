import { RedisClient } from "bun";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { AppConfig } from "./AppConfig.ts";
import { cacheReads, count } from "./Metrics.ts";

export class CacheError extends Schema.TaggedError<CacheError>()("CacheError", {
  cause: Schema.Defect(),
}) {}

// Everything the API used to keep in process memory between requests (rate-limit counts, redeemed live tickets,
// presence, short-lived caches) in Dragonfly (Redis protocol) through Bun's built-in client.
// Keys are namespaced with `examinus:`. Failures are defects, as for the database: Dragonfly is required.
export class Cache extends Context.Service<
  Cache,
  {
    readonly getJson: <A>(key: string) => Effect.Effect<A | null>;
    readonly setJson: (key: string, value: unknown, ttlMs: number) => Effect.Effect<void>;
    readonly del: (key: string) => Effect.Effect<void>;
    // Sets the key only if it doesn't exist yet: true for the first caller (until it expires).
    readonly claim: (key: string, ttlMs: number) => Effect.Effect<boolean>;
    // A sliding window of hits: `count` hits in the last `windowMs`; `add` counts one more unless `max` is reached
    // (true when counted). `max` omitted: always counts.
    readonly windowCount: (key: string, windowMs: number) => Effect.Effect<number>;
    readonly windowAdd: (key: string, windowMs: number, max?: number) => Effect.Effect<boolean>;
    // Members that refresh themselves before `ttlMs` runs out (one per open connection, say): `touch` adds or
    // refreshes, `leave` removes, `members` lists the live ones.
    readonly touch: (key: string, member: string, ttlMs: number) => Effect.Effect<void>;
    readonly leave: (key: string, member: string) => Effect.Effect<void>;
    readonly members: (key: string) => Effect.Effect<string[]>;
  }
>()("examinus/api/Cache") {
  static readonly layer = Layer.effect(
    Cache,
    Effect.gen(function* () {
      const url = Redacted.value((yield* AppConfig).cache.url);
      const client = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const c = new RedisClient(url);
            await c.connect();
            return c;
          },
          catch: (cause) => new CacheError({ cause }),
        }).pipe(Effect.orDie),
        (c) => Effect.sync(() => c.close()),
      );

      const prefix = (key: string) => `examinus:${key}`;
      const run = <A>(f: () => Promise<A>) =>
        Effect.tryPromise({ try: f, catch: (cause) => new CacheError({ cause }) }).pipe(Effect.orDie);

      // Drops hits older than the window, then (ARGV[3] >= 0) refuses at the limit, else adds this one.
      const windowScript = `
        local key, now, window, max, member = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), ARGV[4]
        redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
        if max >= 0 and redis.call('ZCARD', key) >= max then return 0 end
        redis.call('ZADD', key, now, member)
        redis.call('PEXPIRE', key, window)
        return 1`;

      return Cache.of({
        getJson: <A>(key: string) =>
          run(() => client.get(prefix(key))).pipe(
            Effect.tap((raw) => count(cacheReads, { result: raw === null ? "miss" : "hit" })),
            Effect.map((raw) => (raw === null ? null : (JSON.parse(raw) as A))),
          ),
        setJson: (key, value, ttlMs) =>
          run(() => client.set(prefix(key), JSON.stringify(value), "PX", Math.max(1, Math.round(ttlMs)))).pipe(Effect.asVoid),
        del: (key) => run(() => client.del(prefix(key))).pipe(Effect.asVoid),
        claim: (key, ttlMs) =>
          run(() => client.set(prefix(key), "1", "PX", String(Math.max(1, Math.round(ttlMs))), "NX")).pipe(Effect.map((r) => r === "OK")),
        windowCount: (key, windowMs) =>
          run(async () => {
            const k = prefix(key);
            await client.send("ZREMRANGEBYSCORE", [k, "-inf", String(Date.now() - windowMs)]);
            return Number(await client.send("ZCARD", [k]));
          }),
        windowAdd: (key, windowMs, max) =>
          run(() =>
            client.send("EVAL", [
              windowScript,
              "1",
              prefix(key),
              String(Date.now()),
              String(windowMs),
              String(max ?? -1),
              `${Date.now()}:${crypto.randomUUID()}`,
            ]),
          ).pipe(Effect.map((r) => Number(r) === 1)),
        touch: (key, member, ttlMs) =>
          run(() => client.send("ZADD", [prefix(key), String(Date.now() + ttlMs), member])).pipe(
            Effect.andThen(run(() => client.send("PEXPIRE", [prefix(key), String(ttlMs * 2)]))),
            Effect.asVoid,
          ),
        leave: (key, member) => run(() => client.send("ZREM", [prefix(key), member])).pipe(Effect.asVoid),
        members: (key) =>
          run(async () => {
            const k = prefix(key);
            await client.send("ZREMRANGEBYSCORE", [k, "-inf", String(Date.now())]);
            return (await client.send("ZRANGE", [k, "0", "-1"])) as string[];
          }),
      });
    }),
  );
}
