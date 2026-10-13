import { TooManyRequests } from "@examinus/contract/errors";
import { Context, Effect, Layer } from "effect";
import { Cache } from "./Cache.ts";
import { count, rateLimited } from "./Metrics.ts";
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
  // Guest accounts made from one IP (each /join as a guest makes one), and wrong keys tried that way.
  guestJoin: {
    name: "guest-join",
    max: 60,
    windowSeconds: minutes(10),
    message: "Too many guest joins from your network. Wait a few minutes and try again.",
  },
  // AI question drafts per teacher.
  aiGenerate: {
    name: "ai-generate",
    max: 30,
    windowSeconds: minutes(60),
    message: "You've used a lot of AI question drafts this hour. Wait a while and try again.",
  },
  // AI score suggestions per teacher.
  aiGrade: {
    name: "ai-grade",
    max: 400,
    windowSeconds: minutes(60),
    message: "You've asked for a lot of AI score suggestions this hour. Wait a while and try again.",
  },
  // AI coach reports per student. A report is kept once written, so this only matters after regrades or retakes.
  aiCoach: {
    name: "ai-coach",
    max: 20,
    windowSeconds: minutes(60),
    message: "You've asked for a lot of coach reports this hour.",
  },
  // Sample-test runs per student: the Run button can't be used to probe hidden tests or flood the runner.
  codeRun: {
    name: "code-run",
    max: 6,
    windowSeconds: 60,
    message: "You've run your code a lot this minute. Wait a moment, then try again.",
  },
} satisfies Record<string, Limit>;

// The browser's IP. Only the web app reaches the API (it listens on 127.0.0.1), and it forwards the
// x-forwarded-for its host set (Vercel overwrites the header, so browsers can't choose it).
export const clientIp = (headers: EffectHeaders.Headers) =>
  headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";

// Counts attempts in Dragonfly (a sliding window per key), so every API instance shares the counts and a restart
// doesn't reset them.
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
>()("examinus/api/RateLimiter") {
  static readonly layer = Layer.effect(
    RateLimiter,
    Effect.gen(function* () {
      const cache = yield* Cache;
      const keyOf = (limit: Limit, key: string) => `rate:${limit.name}:${key}`;
      const refuse = (limit: Limit) =>
        count(rateLimited, { limit: limit.name }).pipe(Effect.andThen(Effect.fail(new TooManyRequests({ message: limit.message }))));
      return RateLimiter.of({
        check: (limit, key) =>
          cache
            .windowCount(keyOf(limit, key), limit.windowSeconds * 1000)
            .pipe(Effect.flatMap((n) => (n >= limit.max ? refuse(limit) : Effect.void))),
        count: (limit, key) => cache.windowAdd(keyOf(limit, key), limit.windowSeconds * 1000).pipe(Effect.asVoid),
        // Checking and counting in one step, so two requests at once can't both slip under the limit.
        hit: (limit, key) =>
          cache
            .windowAdd(keyOf(limit, key), limit.windowSeconds * 1000, limit.max)
            .pipe(Effect.flatMap((counted) => (counted ? Effect.void : refuse(limit)))),
      });
    }),
  );
}
