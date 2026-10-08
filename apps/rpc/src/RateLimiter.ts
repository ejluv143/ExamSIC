import { TooManyRequests } from "@examora/contract";
import { Clock, Context, Effect, Layer } from "effect";
import type { Headers as EffectHeaders } from "effect/http";

// At most `max` counted attempts per key in any `windowSeconds`. `message` is written for people.
export type Limit = {
  readonly name: string;
  readonly max: number;
  readonly windowSeconds: number;
  readonly message: string;
};

const minutes = (n: number) => n * 60;

// Limits sized for a college: a whole class may sign in or sign up at once from one campus IP, so the per-IP
// limits are wide and the per-account and per-student ones are tight.
export const limits = {
  // Wrong passwords for one email: slows guessing one account's password.
  signInEmail: {
    name: "sign-in-email",
    max: 10,
    windowSeconds: minutes(15),
    message: "Too many wrong passwords for this account. Wait 15 minutes and try again.",
  },
  // Wrong passwords from one IP: slows trying many accounts.
  signInIp: {
    name: "sign-in-ip",
    max: 200,
    windowSeconds: minutes(10),
    message: "Too many failed sign-ins from your network. Wait a few minutes and try again.",
  },
  // Accounts created from one IP.
  register: {
    name: "register",
    max: 100,
    windowSeconds: minutes(60),
    message: "Too many accounts were created from your network. Try again in an hour.",
  },
  // Starting Google sign-in or sign-up from one IP.
  google: {
    name: "google",
    max: 300,
    windowSeconds: minutes(10),
    message: "Too many Google sign-in attempts from your network. Wait a few minutes and try again.",
  },
  // Wrong class codes from one student: slows guessing codes.
  joinCode: {
    name: "join-code",
    max: 10,
    windowSeconds: minutes(10),
    message: "Too many wrong class codes. Wait 10 minutes and try again.",
  },
} satisfies Record<string, Limit>;

// The browser's IP. Only the web app reaches the API (it listens on 127.0.0.1), and it forwards the
// x-forwarded-for its host set (Vercel overwrites the header, so browsers can't choose it).
export const clientIp = (headers: EffectHeaders.Headers) =>
  headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";

type Entry = { windowMs: number; hits: number[] };

// Counts attempts in memory, per API process. With more than one API instance, each counts on its own; move
// the counts to Redis then.
export class RateLimiter extends Context.Service<
  RateLimiter,
  {
    // Fails with `TooManyRequests` if the key is at its limit; otherwise counts this attempt.
    readonly hit: (limit: Limit, key: string) => Effect.Effect<void, TooManyRequests>;
    // Fails with `TooManyRequests` if the key is at its limit, without counting.
    readonly check: (limit: Limit, key: string) => Effect.Effect<void, TooManyRequests>;
    // Counts one attempt.
    readonly count: (limit: Limit, key: string) => Effect.Effect<void>;
  }
>()("examora/api/RateLimiter") {
  static readonly layer = Layer.sync(RateLimiter, () => {
    const entries = new Map<string, Entry>();
    let lastSweep = 0;

    const recent = (entry: Entry, now: number) => {
      entry.hits = entry.hits.filter((t) => t > now - entry.windowMs);
      return entry.hits;
    };

    // Drops keys with no attempts left in their window, at most once a minute.
    const sweep = (now: number) => {
      if (now - lastSweep < 60_000) return;
      lastSweep = now;
      for (const [key, entry] of entries) if (recent(entry, now).length === 0) entries.delete(key);
    };

    const check = (limit: Limit, key: string) =>
      Effect.flatMap(Clock.currentTimeMillis, (now) => {
        const entry = entries.get(`${limit.name}:${key}`);
        return entry && recent(entry, now).length >= limit.max
          ? Effect.fail(new TooManyRequests({ message: limit.message }))
          : Effect.void;
      });

    const count = (limit: Limit, key: string) =>
      Effect.map(Clock.currentTimeMillis, (now) => {
        sweep(now);
        const id = `${limit.name}:${key}`;
        const entry = entries.get(id) ?? {
          windowMs: limit.windowSeconds * 1000,
          hits: [],
        };
        entry.hits.push(now);
        entries.set(id, entry);
      });

    return RateLimiter.of({
      check,
      count,
      hit: (limit, key) => Effect.andThen(check(limit, key), count(limit, key)),
    });
  });
}
