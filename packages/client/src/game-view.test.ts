import { afterEach, beforeEach, describe, expect, it, jest, setSystemTime } from "bun:test";
import type { GameView, RelayTeamSummary } from "@examinus/contract/game";
import { choiceColors, countdownBar, markRank, placeMove, playerState, rankBefore, rankedTeams, remainingAt, roundAt, teamStatus, type Stamped } from "./game-view";

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

// A player's view: the fields the screen derives from, overridable per case.
const playing = (patch: Record<string, unknown> = {}, me: Record<string, unknown> = {}) =>
  view({
    phase: "question",
    pacing: "teacher",
    status: "running",
    questionIndex: 0,
    questionCount: 3,
    questionSeconds: 20,
    question: { id: "q1", type: "true_false" },
    reveal: null,
    relay: null,
    me: { rank: 4, answered: false, last: null, ...me },
    ...patch,
  });

describe("playerState: which screen", () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["the lobby", { phase: "lobby", question: null }, "lobby"],
    ["a question", {}, "question"],
    ["a reveal", { phase: "reveal" }, "reveal"],
    ["the leaderboard", { phase: "leaderboard", question: null }, "leaderboard"],
    ["a relay player's leaderboard is their team's wait", { phase: "leaderboard", question: null, relay: {} }, "team-wait"],
    ["the end", { phase: "ended", question: null }, "final"],
    ["a relay's end", { phase: "ended", question: null, relay: {} }, "team-final"],
  ];
  for (const [name, patch, screen] of cases) it(`shows ${name}`, () => expect(playerState(playing(patch), null).screen).toBe(screen));

  it("needs the question itself to show a question", () => {
    expect(playerState(playing({ question: null }), null).screen).not.toBe("question");
  });
});

describe("playerState: the lobby", () => {
  it("is a relay's team picking before the start, ready to Play in a running student-paced game, else a plain wait", () => {
    const lobby = (patch: Record<string, unknown>) => playerState(playing({ phase: "lobby", question: null, ...patch }), null);
    expect(lobby({ relay: {}, status: "lobby" }).lobby).toBe("relay-waiting");
    expect(lobby({ relay: {}, status: "scheduled" }).lobbyNote).toBe("Waiting for your teacher to open the game.");
    expect(lobby({ relay: {}, status: "lobby" }).lobbyNote).toBe("Waiting for your teacher to start the relay.");
    // A relay that started is just a student-paced game to the lobby: Play.
    expect(lobby({ relay: {}, status: "running", pacing: "student" }).lobby).toBe("ready");
    expect(lobby({ pacing: "student", status: "running" })).toMatchObject({
      lobby: "ready",
      lobbyNote: "3 questions, 20 seconds each. Faster correct answers earn more.",
    });
    expect(lobby({ pacing: "teacher", status: "lobby" })).toMatchObject({
      lobby: "waiting",
      lobbyNote: "Waiting for your teacher to start. Look at the big screen.",
    });
    expect(lobby({ pacing: "student", status: "lobby" }).lobby).toBe("waiting");
    expect(lobby({ status: "scheduled" }).lobbyNote).toBe("Waiting for your teacher to open the game.");
  });
});

describe("playerState: answering", () => {
  it("locks the question once answered, when time is up, or while paused", () => {
    expect(playerState(playing(), 5_000).locked).toBe(false);
    expect(playerState(playing(), null).locked).toBe(false);
    expect(playerState(playing(), 0).locked).toBe(true);
    expect(playerState(playing({ paused: true }), 5_000).locked).toBe(true);
    expect(playerState(playing({}, { answered: true }), 5_000).locked).toBe(true);
  });

  it("answers with a single tap for true/false and single-answer choices only", () => {
    const tap = (question: Record<string, unknown> | null) => playerState(playing({ question }), null).tapToAnswer;
    expect(tap({ id: "q", type: "true_false" })).toBe(true);
    expect(tap({ id: "q", type: "multiple_choice", multipleCorrect: false })).toBe(true);
    expect(tap({ id: "q", type: "multiple_choice", multipleCorrect: true })).toBe(false);
    expect(tap({ id: "q", type: "essay" })).toBe(false);
    expect(tap(null)).toBe(false);
  });

  it("answers through the rescue call only for the teammate's question the player took", () => {
    const rescuing = (id: string | null) => playerState(playing({ relay: { team: { rescuing: id } } }), null).rescuing;
    expect(rescuing("q1")).toBe(true);
    expect(rescuing("q9")).toBe(false);
    expect(rescuing(null)).toBe(false);
    expect(playerState(playing(), null).rescuing).toBe(false);
  });

  it("says the answer is locked in, and in a teacher-paced game when the result comes", () => {
    expect(playerState(playing(), null).lockedNote).toBeNull();
    expect(playerState(playing({}, { answered: true }), null).lockedNote).toBe("Answer locked in. You'll see how you did when time is up.");
    expect(playerState(playing({ pacing: "student" }, { answered: true }), null).lockedNote).toBe("Answer locked in.");
  });
});

describe("playerState: the result of a question", () => {
  const closed = (last: Record<string, unknown> | null, reveal: Record<string, unknown> | null = { answer: "True" }) =>
    playerState(playing({ phase: "reveal", reveal }, { last }), null);

  it("tells received, time's up, correct or wrong", () => {
    expect(closed({ correct: null, answered: true, earned: 0 }).headline).toBe("received");
    expect(closed({ correct: false, answered: false, earned: 0 }).headline).toBe("timesup");
    expect(closed({ correct: true, answered: true, earned: 900 })).toMatchObject({ headline: "correct", right: true, wrong: false });
    expect(closed({ correct: false, answered: true, earned: 0 })).toMatchObject({ headline: "wrong", right: false, wrong: true });
  });

  it("shows the right answer only to those who didn't get it right, and never for an unscored question", () => {
    expect(closed({ correct: false, answered: true, earned: 0 }).shownAnswer).toBe("True");
    expect(closed({ correct: false, answered: false, earned: 0 }).shownAnswer).toBe("True");
    expect(closed({ correct: true, answered: true, earned: 900 }).shownAnswer).toBeNull();
    expect(closed({ correct: null, answered: true, earned: 0 }).shownAnswer).toBeNull();
    expect(closed({ correct: false, answered: true, earned: 0 }, null).shownAnswer).toBeNull();
    expect(closed({ correct: false, answered: true, earned: 0 }, { answer: null }).shownAnswer).toBeNull();
  });

  it("offers Finish on the last question of a student-paced game", () => {
    expect(playerState(playing({ questionIndex: 1 }), null).nextLabel).toBe("Next question");
    expect(playerState(playing({ questionIndex: 2 }), null).nextLabel).toBe("Finish");
  });
});

describe("the place held when a question opened", () => {
  it("is marked at the first sighting of each question and kept while the rank moves", () => {
    const first = markRank(null, playing({ questionIndex: 0 }, { rank: 4 }));
    expect(first).toEqual({ index: 0, rank: 4 });
    // The rank moved while others answered: the mark stays.
    expect(markRank(first, playing({ questionIndex: 0 }, { rank: 2 }))).toBe(first);
    expect(markRank(first, playing({ questionIndex: 1 }, { rank: 2 }))).toEqual({ index: 1, rank: 2 });
  });

  it("is only taken while a question is open", () => {
    expect(markRank(null, playing({ phase: "leaderboard" }))).toBeNull();
    const saved = { index: 0, rank: 4 };
    expect(markRank(saved, playing({ phase: "reveal", questionIndex: 1 }))).toBe(saved);
  });

  it("is the place before the question that just ended, and unknown for any other", () => {
    const saved = { index: 1, rank: 4 };
    expect(rankBefore(saved, playing({ phase: "leaderboard", questionIndex: 1 }))).toBe(4);
    expect(rankBefore(saved, playing({ phase: "leaderboard", questionIndex: 2 }))).toBeNull();
    expect(rankBefore(null, playing())).toBeNull();
  });

  it("is told as a move up, down or held, with singular and plural places", () => {
    expect(placeMove(null, 3)).toBeNull();
    expect(placeMove(5, 3)).toEqual({ places: 2, text: "Up 2 places" });
    expect(placeMove(4, 3)).toEqual({ places: 1, text: "Up 1 place" });
    expect(placeMove(3, 4)).toEqual({ places: -1, text: "Down 1 place" });
    expect(placeMove(3, 6)).toEqual({ places: -3, text: "Down 3 places" });
    expect(placeMove(3, 3)).toEqual({ places: 0, text: "Held #3" });
  });
});
