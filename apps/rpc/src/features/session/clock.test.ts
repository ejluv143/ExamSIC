import { describe, expect, test } from "bun:test";
import { attemptItem, sessionItem } from "../../testing/session-rows.ts";
import { attemptClock, attemptDeadline, graceMs, sessionClock, withinDeviceGrace } from "./clock.ts";

const t = (minutes: number) => Date.UTC(2026, 2, 2, 8, minutes);
const at = (minutes: number) => new Date(t(minutes));
const attempt = (over: Parameters<typeof attemptItem>[0] = {}) => attemptItem({ startedAt: at(0), extraMs: 0, ...over });

describe("attemptDeadline", () => {
  test("no limit and no close is no deadline", () => {
    expect(attemptDeadline(sessionItem(), attempt())).toBeNull();
  });

  test("the earlier of the time limit and the close, with time added live", () => {
    const session = sessionItem({ timeLimitMinutes: 30, closesAt: at(20) });
    expect(attemptDeadline(session, attempt())).toBe(t(20));
    expect(attemptDeadline(session, attempt({ extraMs: 60_000 }))).toBe(t(21));
  });

  test("the time multiplier scales the limit and extra minutes run past the close", () => {
    expect(attemptDeadline(sessionItem({ timeLimitMinutes: 30 }), attempt(), { timeMultiplier: 1.5, extraMinutes: 0 })).toBe(t(45));
    expect(attemptDeadline(sessionItem({ closesAt: at(20) }), attempt(), { timeMultiplier: 1, extraMinutes: 5 })).toBe(t(25));
  });
});

describe("attemptClock", () => {
  const timed = sessionItem({ timeLimitMinutes: 10 });

  test("open until the deadline, grace for the minute after it, then expired", () => {
    expect(attemptClock(timed, attempt(), null, t(10))).toBe("open");
    expect(attemptClock(timed, attempt(), null, t(10) + 1)).toBe("grace");
    expect(attemptClock(timed, attempt(), null, t(10) + graceMs)).toBe("grace");
    expect(attemptClock(timed, attempt(), null, t(10) + graceMs + 1)).toBe("expired");
  });

  test("an untimed session stays open", () => {
    expect(attemptClock(sessionItem(), attempt(), null, t(5000))).toBe("open");
  });

  test("while the session is paused the clock stops at the moment of the pause", () => {
    const paused = sessionItem({ timeLimitMinutes: 10, pausedAt: at(8) });
    expect(attemptClock(paused, attempt(), null, t(500))).toBe("open");
  });

  test("a session the teacher ended is a deadline: the end plus the student's extra time", () => {
    const ended = sessionItem({ status: "ended", endedAt: at(5) });
    expect(attemptClock(ended, attempt(), null, t(5) + graceMs + 1)).toBe("expired");
    expect(attemptClock(ended, attempt(), { timeMultiplier: 1, extraMinutes: 10 }, t(5) + graceMs + 1)).toBe("open");
    expect(attemptClock(ended, attempt({ extraMs: 600_000 }), null, t(5) + graceMs + 1)).toBe("open");
  });

  test("the earlier of the deadline and the end decides", () => {
    const ended = sessionItem({ status: "ended", endedAt: at(5), timeLimitMinutes: 60 });
    expect(attemptClock(ended, attempt(), null, t(7))).toBe("expired");
    const late = sessionItem({ status: "ended", endedAt: at(50), timeLimitMinutes: 10 });
    expect(attemptClock(late, attempt(), null, t(12))).toBe("expired");
  });
});

describe("sessionClock", () => {
  test("is now, or the moment of the pause", () => {
    expect(sessionClock(sessionItem(), t(9))).toBe(t(9));
    expect(sessionClock(sessionItem({ pausedAt: at(3) }), t(9))).toBe(t(3));
  });
});

describe("withinDeviceGrace", () => {
  const exam = { deviceGraceMinutes: 5 } as Parameters<typeof withinDeviceGrace>[0];

  test("never checked in counts as fresh", () => {
    expect(withinDeviceGrace(exam, null, at(99))).toBe(true);
  });

  test("away for longer than the exam's grace is too long", () => {
    expect(withinDeviceGrace(exam, at(0), at(5))).toBe(true);
    expect(withinDeviceGrace(exam, at(0), new Date(t(5) + 1))).toBe(false);
  });
});
