import { afterEach, beforeEach, describe, expect, it, jest, setSystemTime } from "bun:test";
import type { GameView, RelayTeamSummary } from "@examinus/contract/game";
import { choiceColors, countdownBar, rankedTeams, remainingAt, roundAt, teamStatus, type Stamped } from "./game-view";

const view = (patch: Record<string, unknown>) => ({ serverNow: "2026-01-01T00:00:10.000Z", endsAt: null, paused: false, ...patch }) as unknown as GameView;

// The view arrives at device time `receivedAt`; the server's clock read `serverNow` then.
const stamp = (patch: Record<string, unknown>, receivedAt: number): Stamped => ({ view: view(patch), receivedAt });

const team = (patch: Partial<RelayTeamSummary>) => ({ id: "t", name: "A", rank: 0, solvedAt: null, finished: false, ...patch }) as unknown as RelayTeamSummary;

describe("countdown by the server's clock", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("counts down from the view's own time even when the device clock is far off", () => {
    // The device is an hour ahead of the server; 30 s remain when the view arrives.
    setSystemTime(Date.parse("2026-01-01T01:00:10.000Z"));
    const stamped = stamp({ endsAt: "2026-01-01T00:00:40.000Z" }, Date.now());
    expect(remainingAt(stamped, Date.now())).toBe(30_000);
    jest.advanceTimersByTime(12_500);
    expect(remainingAt(stamped, Date.now())).toBe(17_500);
  });

  it("stops at zero once the end has passed", () => {
    setSystemTime(Date.parse("2026-01-01T00:00:10.000Z"));
    const stamped = stamp({ endsAt: "2026-01-01T00:00:15.000Z" }, Date.now());
    jest.advanceTimersByTime(60_000);
    expect(remainingAt(stamped, Date.now())).toBe(0);
  });

  it("holds the time left while paused, and reads zero when none was recorded", () => {
    const base = { endsAt: "2026-01-01T00:00:40.000Z", paused: true };
    expect(remainingAt(stamp({ ...base, pausedRemainingMs: 8_000 }, 0), 999_999)).toBe(8_000);
    expect(remainingAt(stamp(base, 0), 999_999)).toBe(0);
  });

  it("has no countdown without a view or an end", () => {
    expect(remainingAt(null, 0)).toBeNull();
    expect(remainingAt(stamp({}, 0), 0)).toBeNull();
    expect(roundAt(null, 0)).toBeNull();
    expect(roundAt(stamp({ relay: null }, 0), 0)).toBeNull();
    expect(roundAt(stamp({ relay: { roundEndsAt: null } }, 0), 0)).toBeNull();
  });

  it("counts the relay round on the same skew, ignoring pause", () => {
    const stamped = stamp({ paused: true, relay: { roundEndsAt: "2026-01-01T00:02:10.000Z" } }, 5_000);
    expect(roundAt(stamped, 5_000)).toBe(120_000);
    expect(roundAt(stamped, 65_000)).toBe(60_000);
  });
});

describe("countdownBar", () => {
  it("shows the share of the time left, capped at full", () => {
    expect(countdownBar(15_000, 30).share).toBe(0.5);
    expect(countdownBar(40_000, 30).share).toBe(1);
  });

  it("turns low under a quarter and hurries only in the last five seconds", () => {
    expect(countdownBar(7_500, 30).low).toBe(false);
    expect(countdownBar(7_499, 30).low).toBe(true);
    expect(countdownBar(5_000, 30).hurry).toBe(true);
    expect(countdownBar(5_001, 30).hurry).toBe(false);
    expect(countdownBar(0, 30)).toMatchObject({ seconds: 0, hurry: false });
  });
});

describe("rankedTeams", () => {
  it("orders by rank, then name, with unranked teams last", () => {
    const teams = [
      team({ id: "1", name: "Zed", rank: 2 }),
      team({ id: "2", name: "Cat", rank: 0 }),
      team({ id: "3", name: "Bee", rank: 1 }),
      team({ id: "4", name: "Ant", rank: 0 }),
    ];
    expect(rankedTeams(teams).map((t) => t.id)).toEqual(["3", "1", "4", "2"]);
  });

  it("breaks ties in rank by name and leaves the input alone", () => {
    const teams = [team({ id: "1", name: "Beta", rank: 1 }), team({ id: "2", name: "Alpha", rank: 1 })];
    expect(rankedTeams(teams).map((t) => t.name)).toEqual(["Alpha", "Beta"]);
    expect(teams.map((t) => t.id)).toEqual(["1", "2"]);
  });
});

describe("teamStatus", () => {
  it("says how the round stands", () => {
    expect(teamStatus(team({ solvedAt: "2026-01-01T00:00:00Z", finished: true }), true)).toBe("Solved");
    expect(teamStatus(team({ finished: true }), true)).toBe("Time's up");
    expect(teamStatus(team({ finished: true }), false)).toBe("Out of guesses");
    expect(teamStatus(team({}), false)).toBe("Playing");
  });
});

describe("choiceColors", () => {
  it("keeps the order every screen styles", () => {
    expect([...choiceColors]).toEqual(["red", "blue", "amber", "emerald", "violet", "pink"]);
  });
});
