// The rules Engine.ts owns, on rooms loaded by the in-memory game world.
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import type { Question } from "@examinus/domain/question";
import { code, essay, gameWorld, relaySettings, trueFalse, type GameOptions } from "../../testing/game.ts";
import {
  buckets,
  handOver,
  lobbyProblem,
  nextIndex,
  paperOf,
  pickLateTeam,
  planRelayStart,
  playingTeam,
  rankPlayers,
  relayAllOver,
  releaseSlots,
  scoreAnswer,
  slotStateOf,
  tallyKeys,
  teamOver,
} from "./Engine.ts";
import type { Player } from "./Room.ts";
import { RoomStore } from "./RoomStore.ts";
import { Game } from "./Service.ts";

const world = (over: GameOptions = {}) => gameWorld({ roster: ["u1", "u2", "u3"], ...over });

const roomOf = Effect.gen(function* () {
  return yield* (yield* RoomStore).need("g1");
});

const lobby = (...players: string[]) =>
  Effect.gen(function* () {
    const game = yield* Game;
    yield* game.openLobby("g1");
    for (const id of players) yield* game.join(id, "g1");
    return game;
  });

const player = (over: Partial<Player> = {}): Player => ({
  attemptId: "a",
  userId: "u",
  name: "A",
  avatar: { style: "thumbs", seed: "s", parts: {}, colors: {} } as unknown as Player["avatar"],
  seed: 1,
  points: 0,
  streak: 0,
  streakBefore: 0,
  done: new Map(),
  index: 0,
  startedAt: null,
  finished: false,
  paper: null,
  teamId: null,
  tries: new Map(),
  ...over,
});

describe("Engine: scoring one answer", () => {
  test("a right answer earns speed points and builds the streak; a wrong one or a timeout earns nothing and breaks it", async () => {
    await world().run(
      Effect.gen(function* () {
        yield* lobby("u1");
        const room = yield* roomOf;
        const q = room.questions[0]!;
        const p = player({ streak: 2 });
        const right = scoreAnswer(room, p, q, true, 1000, false, null);
        expect(right).toMatchObject({ fraction: 1, correct: true, streak: 3 });
        expect(right.earned).toBeGreaterThan(0);
        const wrong = scoreAnswer(room, p, q, false, 1000, false, null);
        expect(wrong).toMatchObject({ fraction: 0, correct: false, earned: 0, streak: 0 });
        const timeout = scoreAnswer(room, p, q, null, room.seconds * 1000, true, null);
        expect(timeout).toMatchObject({ fraction: 0, correct: false, earned: 0, streak: 0 });
        // Faster is worth more.
        expect(scoreAnswer(room, p, q, true, 100, false, null).earned).toBeGreaterThan(scoreAnswer(room, p, q, true, 9000, false, null).earned);
      }),
    );
  });

  test("an essay is unscored: no points, no verdict, the streak stays", async () => {
    await world({ questions: [essay("q1")] }).run(
      Effect.gen(function* () {
        yield* lobby("u1");
        const room = yield* roomOf;
        const scored = scoreAnswer(room, player({ streak: 2 }), room.questions[0]!, "text", 500, false, null);
        expect(scored).toMatchObject({ fraction: null, correct: null, earned: 0, streak: 2 });
      }),
    );
  });

  test("a relay retry earns less than the first try, by the retry penalty", async () => {
    await world({
      session: { pacing: "student", relay: relaySettings({ retryPenalty: 50 }), relayPassword: "SUN" },
    }).run(
      Effect.gen(function* () {
        yield* lobby("u1");
        const room = yield* roomOf;
        const q = room.questions[0]!;
        const first = scoreAnswer(room, player(), q, true, 1000, false, null).earned;
        const again = scoreAnswer(room, player({ tries: new Map([[q.id, 1]]) }), q, true, 1000, false, null).earned;
        expect(again).toBe(Math.round(first / 2));
      }),
    );
  });
});

describe("Engine: how answers split", () => {
  test("a choice question counts the choice picked; any other counts how the answer fared", async () => {
    await world({ questions: [trueFalse("q1", true), code("q2")] }).run(
      Effect.gen(function* () {
        yield* lobby("u1");
        const [choice, graded] = (yield* roomOf).questions as [Question, Question];
        expect(tallyKeys(choice, true, 1)).toEqual(["true"]);
        expect(tallyKeys(choice, false, 0)).toEqual(["false"]);
        expect(tallyKeys(graded, "x", 1)).toEqual(["ok"]);
        expect(tallyKeys(graded, "x", 0)).toEqual(["bad"]);
        expect(tallyKeys(graded, "x", 0.5)).toEqual(["part"]);
      }),
    );
  });

  test("the bars show right, partly right and wrong, with the unanswered added at the end only when there are some", async () => {
    await world({ questions: [code("q1")] }).run(
      Effect.gen(function* () {
        yield* lobby("u1");
        const q = (yield* roomOf).questions[0]!;
        const tally = new Map([["ok", 3], ["bad", 1]]);
        expect(buckets(q, tally, 2).map((b) => [b.label, b.count])).toEqual([
          ["Correct", 3],
          ["Partly correct", 0],
          ["Wrong", 1],
          ["No answer", 2],
        ]);
        expect(buckets(q, tally, 0).at(-1)!.label).toBe("Wrong");
      }),
    );
  });
});

describe("Engine: the standings", () => {
  test("players are ranked by points, ties share a rank and are listed by name, the next rank skips the tie", () => {
    const { board, ranks } = rankPlayers([
      player({ attemptId: "1", name: "Cy", points: 100 }),
      player({ attemptId: "2", name: "Al", points: 300 }),
      player({ attemptId: "3", name: "Bo", points: 100 }),
      player({ attemptId: "4", name: "Di", points: 0 }),
    ]);
    expect(board.map((r) => [r.name, r.rank])).toEqual([["Al", 1], ["Bo", 2], ["Cy", 2], ["Di", 4]]);
    expect(ranks.get("3")).toEqual({ rank: 2, points: 100 });
  });

  test("only the top of the list is shown to the screens, but everyone has a rank", () => {
    const many = Array.from({ length: 25 }, (_, i) => player({ attemptId: `p${i}`, name: `N${String(i).padStart(2, "0")}`, points: 100 - i }));
    const { board, ranks } = rankPlayers(many);
    expect(board).toHaveLength(20);
    expect(ranks.get("p24")!.rank).toBe(25);
  });
});

describe("Engine: which question opens next", () => {
  test("the first unplayed one after the current, else the first unplayed one, else none", async () => {
    await world({ questions: ["q1", "q2", "q3", "q4"].map((id) => trueFalse(id, true)) }).run(
      Effect.gen(function* () {
        yield* lobby("u1");
        const room = yield* roomOf;
        room.index = 0;
        room.played = new Set([0]);
        expect(nextIndex(room)).toBe(1);
        // A jump skipped some: after question 3 (index 2) comes 4, then the skipped 2.
        room.index = 2;
        room.played = new Set([0, 2]);
        expect(nextIndex(room)).toBe(3);
        room.index = 3;
        room.played = new Set([0, 2, 3]);
        expect(nextIndex(room)).toBe(1);
        room.played = new Set([0, 1, 2, 3]);
        expect(nextIndex(room)).toBeNull();
      }),
    );
  });
});

describe("Engine: a Team Relay", () => {
  const relay = (settings: Parameters<typeof relaySettings>[0] = {}, over: GameOptions = {}) =>
    world({
      session: { pacing: "student", relay: relaySettings(settings), relayPassword: "SUN" },
      questions: ["q1", "q2", "q3", "q4"].map((id) => trueFalse(id, true)),
      ...over,
    });

  // Opens the lobby, puts u1 and u2 in team1 and u3 in team2.
  const teams = Effect.gen(function* () {
    const game = yield* lobby("u1", "u2", "u3");
    yield* game.assignTeam("g1", "a1", "team1");
    yield* game.assignTeam("g1", "a2", "team1");
    yield* game.assignTeam("g1", "a3", "team2");
    return game;
  });

  test("the teams can only change in the lobby of a relay, and say why not", async () => {
    await relay().run(
      Effect.gen(function* () {
        const game = yield* Game;
        const room = yield* roomOf;
        expect(lobbyProblem(room)).toBe("Open the lobby first.");
        yield* game.openLobby("g1");
        expect(lobbyProblem(room)).toBeNull();
        room.status = "running";
        expect(lobbyProblem(room)).toBe("The teams are locked: the game already started.");
        room.status = "ended";
        expect(lobbyProblem(room)).toBe("This game is over.");
      }),
    );
    await world().run(
      Effect.gen(function* () {
        yield* lobby("u1");
        expect(lobbyProblem(yield* roomOf)).toBe("This isn't a Team Relay game.");
      }),
    );
  });

  test("planning the start deals every question to a member of each playing team, with the password cut into pieces", async () => {
    await relay().run(
      Effect.gen(function* () {
        yield* teams;
        const room = yield* roomOf;
        const plan = planRelayStart(room);
        if (plan.problem !== null) throw new Error(plan.problem);
        expect(plan.playing.map((t) => t.id)).toEqual(["team1", "team2"]);
        for (const p of plan.plans) {
          expect(p.password).toBe("SUN");
          expect([...p.slots.keys()].sort()).toEqual(["q1", "q2", "q3", "q4"]);
          expect([...p.slots.values()].every((s) => p.members.includes(s.owner!))).toBe(true);
          // Both members of team1 get questions.
          if (p.team.id === "team1") expect(new Set([...p.slots.values()].map((s) => s.owner)).size).toBe(2);
        }
      }),
    );
  });

  test("a start is refused when there is no room for everyone, or a team has more players than the quiz has questions", async () => {
    await relay({ teamSize: 1, teamCount: 1 }).run(
      Effect.gen(function* () {
        yield* lobby("u1", "u2");
        const plan = planRelayStart(yield* roomOf);
        expect(plan.problem).toBe("There isn't room for everyone: add a team.");
      }),
    );
    await relay({ teamSize: 5, teamCount: 1 }, { questions: [trueFalse("q1", true), trueFalse("q2", true)] }).run(
      Effect.gen(function* () {
        const game = yield* lobby("u1", "u2", "u3");
        yield* game.assignTeam("g1", "a1", "team1");
        yield* game.assignTeam("g1", "a2", "team1");
        yield* game.assignTeam("g1", "a3", "team1");
        expect(planRelayStart(yield* roomOf).problem).toContain("has more players than the quiz has questions");
      }),
    );
  });

  test("a team's round is over when it solves the password, uses its guesses, runs out of time, or the game ended", async () => {
    await relay({ passwordAttempts: 2, roundMinutes: 10 }).run(
      Effect.gen(function* () {
        const game = yield* teams;
        yield* game.start("g1");
        const room = yield* roomOf;
        const team = room.teams.get("team1")!;
        const now = Date.now();
        expect(teamOver(room, team, now)).toBe(false);
        team.wrongGuesses = 2;
        expect(teamOver(room, team, now)).toBe(true);
        team.wrongGuesses = 0;
        team.solvedAt = now;
        expect(teamOver(room, team, now)).toBe(true);
        team.solvedAt = null;
        expect(teamOver(room, team, room.startedAt! + 10 * 60_000)).toBe(true);
        expect(teamOver(room, team, room.startedAt! + 10 * 60_000 - 1)).toBe(false);
      }),
    );
  });

  test("the game is over for a relay when every team with players is over, and never before it runs", async () => {
    await relay().run(
      Effect.gen(function* () {
        const game = yield* teams;
        const room = yield* roomOf;
        expect(relayAllOver(room)).toBe(false);
        yield* game.start("g1");
        expect(relayAllOver(room)).toBe(false);
        room.teams.get("team1")!.solvedAt = Date.now();
        expect(relayAllOver(room)).toBe(false);
        room.teams.get("team2")!.wrongGuesses = 99;
        expect(relayAllOver(room)).toBe(true);
      }),
    );
  });

  test("a player may play only while their team's round is on, and is told why not", async () => {
    await relay().run(
      Effect.gen(function* () {
        const game = yield* teams;
        const room = yield* roomOf;
        const p = room.byUser.get("u1")!;
        expect(playingTeam(room, p)).toEqual({ problem: "The game isn't running." });
        yield* game.start("g1");
        expect("team" in playingTeam(room, p)).toBe(true);
        room.teams.get("team1")!.solvedAt = Date.now();
        expect(playingTeam(room, p)).toEqual({ problem: "Your team's round is over." });
        p.teamId = null;
        expect(playingTeam(room, p)).toEqual({ problem: "You aren't in a team." });
        room.status = "ended";
        expect(playingTeam(room, p)).toEqual({ problem: "The game is over." });
      }),
    );
  });

  test("a late player joins the smallest team with a free place whose round is still on", async () => {
    await relay({ teamSize: 3 }).run(
      Effect.gen(function* () {
        const game = yield* teams;
        yield* game.start("g1");
        const room = yield* roomOf;
        // team1 has two, team2 has one: the newcomer goes to team2.
        expect(pickLateTeam(room)?.id).toBe("team2");
        room.teams.get("team2")!.solvedAt = Date.now();
        expect(pickLateTeam(room)?.id).toBe("team1");
        room.teams.get("team1")!.members.push("x");
        expect(pickLateTeam(room)).toBeNull();
      }),
    );
  });

  test("a player who leaves hands their unanswered questions to the teammate with the fewest left; with none to take them they have no owner", async () => {
    await relay().run(
      Effect.gen(function* () {
        const game = yield* teams;
        yield* game.start("g1");
        const room = yield* roomOf;
        const team = room.teams.get("team1")!;
        const leaver = room.byUser.get("u1")!;
        const mate = room.byUser.get("u2")!;
        const mine = [...team.slots.values()].filter((s) => s.owner === leaver.attemptId).map((s) => s.questionId);
        const before = room.relayVersion;
        const updates = releaseSlots(room, leaver);
        expect(room.relayVersion).toBe(before + 1);
        expect(team.members).toEqual([mate.attemptId]);
        expect(leaver.teamId).toBeNull();
        expect(updates.map((u) => u.questionId).sort()).toEqual([...mine].sort());
        for (const id of mine) expect(team.slots.get(id)!.owner).toBe(mate.attemptId);
        // The last member leaves: what they still owe has no owner.
        const rest = releaseSlots(room, mate);
        expect(rest.length).toBe(4);
        expect([...team.slots.values()].every((s) => s.owner === null)).toBe(true);
      }),
    );
  });

  test("a question the leaver answered right stays unlocked, as a rescue nobody owns; a wrong one loses its owner", async () => {
    await relay({ rescue: true }).run(
      Effect.gen(function* () {
        const game = yield* teams;
        yield* game.start("g1");
        const room = yield* roomOf;
        const team = room.teams.get("team1")!;
        const leaver = room.byUser.get("u1")!;
        const [first, second] = paperOf(room, leaver);
        leaver.done.set(first!.id, { correct: true, earned: 100 });
        leaver.done.set(second!.id, { correct: false, earned: 0 });
        releaseSlots(room, leaver);
        expect(team.slots.get(first!.id)).toMatchObject({ owner: null, rescueCorrect: true });
        expect(slotStateOf(room, team.slots.get(first!.id)!)).toBe("unlocked");
        expect(team.slots.get(second!.id)!.owner).toBeNull();
      }),
    );
  });

  test("a newcomer takes questions the teammates haven't been shown yet, and the team lists them", async () => {
    await relay({ teamSize: 3 }).run(
      Effect.gen(function* () {
        const game = yield* teams;
        yield* game.start("g1");
        const room = yield* roomOf;
        const team = room.teams.get("team1")!;
        const newcomer = player({ attemptId: "a9", userId: "u9", name: "Newcomer" });
        const before = new Set([...team.slots.values()].filter((s) => s.owner !== null).map((s) => s.questionId));
        const updates = handOver(room, team, newcomer);
        expect(team.members).toContain("a9");
        expect(newcomer.teamId).toBe("team1");
        expect(updates.length).toBeGreaterThan(0);
        expect(updates.every((u) => before.has(u.questionId))).toBe(true);
        for (const u of updates) expect(team.slots.get(u.questionId)!.owner).not.toBeNull();
        // Nobody is dealt a question twice.
        expect(new Set(updates.map((u) => u.questionId)).size).toBe(updates.length);
      }),
    );
  });
});
