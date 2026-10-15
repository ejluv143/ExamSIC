// Sign-in and sign-up limits over the real API (issue #12): Better Auth's own limiter doesn't run for these RPCs,
// so the API's RateLimiter must. Needs an API (API_URL) on a migrated database. Each run uses new emails, and
// each attempt comes from its own IP so only the per-account and per-email limits are reached.
import { beforeAll, describe, expect, test } from "bun:test";
import { limits } from "../src/platform/RateLimiter.ts";
import { callFrom } from "./helpers.ts";

const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const victim = `limit-victim-${run}@test.local`;
const other = `limit-other-${run}@test.local`;
const password = "Strong123";
const signUp = (email: string) => ({ name: "Limit Test", email, password, profile: { role: "student" }, acceptTerms: true });
let ips = 0;
const nextIp = () => `10.${(ips >> 16) & 255}.${(ips >> 8) & 255}.${ips++ & 255}`;

beforeAll(async () => {
  expect(await callFrom(nextIp(), "auth.register", signUp(victim))).toHaveProperty("ok");
  expect(await callFrom(nextIp(), "auth.register", signUp(other))).toHaveProperty("ok");
}, 30_000);

describe("auth.signInEmail", () => {
  test("an account is locked after its wrong-password limit, even for the right password; others still sign in", async () => {
    for (let i = 0; i < limits.signInEmail.max; i++) {
      const r = await callFrom(nextIp(), "auth.signInEmail", { email: victim, password: "Wrong999" });
      expect(r.err).toStartWith("InvalidCredentials");
    }
    const locked = `TooManyRequests: ${limits.signInEmail.message}`;
    expect((await callFrom(nextIp(), "auth.signInEmail", { email: victim, password: "Wrong999" })).err).toBe(locked);
    expect((await callFrom(nextIp(), "auth.signInEmail", { email: victim, password })).err).toBe(locked);
    expect(await callFrom(nextIp(), "auth.signInEmail", { email: other, password })).toHaveProperty("ok");
  }, 30_000);
});

describe("auth.register", () => {
  test("sign-ups for one email are refused after its limit", async () => {
    // The account's own sign-up in beforeAll was the first attempt.
    for (let i = 1; i < limits.registerEmail.max; i++) {
      const r = await callFrom(nextIp(), "auth.register", signUp(other));
      expect(r.err).toStartWith("Conflict");
    }
    const r = await callFrom(nextIp(), "auth.register", signUp(other));
    expect(r.err).toBe(`TooManyRequests: ${limits.registerEmail.message}`);
  }, 30_000);
});
