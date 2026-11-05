import { describe, expect, test } from "bun:test";
import { answerKeyVisible, resultsVisible } from "./release.ts";

const session = (over: Partial<Parameters<typeof answerKeyVisible>[0]> = {}) => ({
  resultsRelease: "immediately" as const,
  resultsReleased: false,
  status: "running" as const,
  attemptsAllowed: 1 as number | null,
  ...over,
});

describe("resultsVisible", () => {
  test("immediately shows at once, whatever the status", () => {
    expect(resultsVisible(session({ status: "running" }))).toBe(true);
  });

  test("after_close waits for the session to end", () => {
    expect(resultsVisible(session({ resultsRelease: "after_close", status: "running" }))).toBe(false);
    expect(resultsVisible(session({ resultsRelease: "after_close", status: "ended" }))).toBe(true);
  });

  test("manual waits for the teacher, even after the session ended", () => {
    expect(resultsVisible(session({ resultsRelease: "manual", status: "ended" }))).toBe(false);
    expect(resultsVisible(session({ resultsRelease: "manual", resultsReleased: true }))).toBe(true);
  });
});

describe("answerKeyVisible", () => {
  test("never while the score is held or an attempt is in progress", () => {
    expect(answerKeyVisible(session({ resultsRelease: "manual", status: "ended" }), 1, false)).toBe(false);
    expect(answerKeyVisible(session({ status: "ended" }), 1, true)).toBe(false);
  });

  test("waits while the student can still retake the session", () => {
    expect(answerKeyVisible(session({ attemptsAllowed: 3 }), 2, false)).toBe(false);
    expect(answerKeyVisible(session({ attemptsAllowed: null }), 5, false)).toBe(false);
  });

  test("shows once every attempt is used, or the session has ended", () => {
    expect(answerKeyVisible(session({ attemptsAllowed: 3 }), 3, false)).toBe(true);
    expect(answerKeyVisible(session({ attemptsAllowed: null, status: "ended" }), 1, false)).toBe(true);
  });
});
