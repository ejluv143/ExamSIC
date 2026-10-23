import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { Accommodations, applyAccommodations, isEmptyAccommodations, noAccommodations } from "./accommodations.ts";
import { defaultIntegrity } from "./integrity.ts";
import type { Session } from "./quiz.ts";

const session = {
  integrity: { ...defaultIntegrity("exam"), requireFullscreen: true, blockSecondScreen: true, trackFocus: true },
  exam: { computersOnly: true, honorPledge: "I will not cheat", deviceGraceMinutes: 5 },
} as unknown as Session;

const acc = (over: Partial<Accommodations>): Accommodations => ({ ...noAccommodations, ...over });

describe("applyAccommodations", () => {
  test("no accommodations leave the session untouched", () => {
    expect(applyAccommodations(session, null)).toBe(session);
    expect(applyAccommodations(session, noAccommodations)).toBe(session);
  });

  test("each exemption switches off only its own rule", () => {
    const full = applyAccommodations(session, acc({ exempt: ["fullscreen"] }));
    expect(full.integrity.requireFullscreen).toBe(false);
    expect(full.integrity.blockSecondScreen).toBe(true);
    expect(full.exam?.computersOnly).toBe(true);

    const screen = applyAccommodations(session, acc({ exempt: ["one_screen"] }));
    expect(screen.integrity.blockSecondScreen).toBe(false);
    expect(screen.integrity.requireFullscreen).toBe(true);

    const computers = applyAccommodations(session, acc({ exempt: ["computers_only"] }));
    expect(computers.exam?.computersOnly).toBe(false);
    expect(computers.integrity.trackFocus).toBe(true);
    expect(computers.exam?.honorPledge).toBe("I will not cheat");
  });

  test("a session without exam settings stays without them", () => {
    const quiz = { ...session, exam: null } as Session;
    expect(applyAccommodations(quiz, acc({ exempt: ["computers_only"] })).exam).toBeNull();
  });
});

describe("Accommodations", () => {
  test("empty means nothing to apply", () => {
    expect(isEmptyAccommodations(null)).toBe(true);
    expect(isEmptyAccommodations(noAccommodations)).toBe(true);
    expect(isEmptyAccommodations(acc({ note: "  " }))).toBe(true);
    expect(isEmptyAccommodations(acc({ extraMinutes: 5 }))).toBe(false);
    expect(isEmptyAccommodations(acc({ exempt: ["fullscreen"] }))).toBe(false);
  });

  test("the limits are enforced", () => {
    const ok = Schema.is(Accommodations);
    expect(ok(acc({ timeMultiplier: 1.5, extraMinutes: 600, extraAttempts: 10 }))).toBe(true);
    expect(ok(acc({ timeMultiplier: 0.5 }))).toBe(false);
    expect(ok(acc({ timeMultiplier: 3.5 }))).toBe(false);
    expect(ok(acc({ extraMinutes: 601 }))).toBe(false);
    expect(ok(acc({ extraAttempts: 11 }))).toBe(false);
    expect(ok(acc({ note: "x".repeat(501) }))).toBe(false);
  });
});
