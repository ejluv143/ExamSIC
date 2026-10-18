import { describe, expect, test } from "bun:test";
import { Conflict, Forbidden, NotFound } from "@examinus/contract/errors";
import { Effect } from "effect";
import { code, gameWorld, essay, relaySettings, trueFalse, user, type GameOptions } from "../../testing/game.ts";
import { until } from "../../testing/live.ts";
import type { OpenGame } from "./Repo.ts";
import { RoomStore } from "./RoomStore.ts";
import { Game } from "./Service.ts";

const minutesAgo = (m: number) => Date.now() - m * 60_000;

const openGame = (over: Partial<OpenGame> = {}): OpenGame => ({
  id: "g1",
  organizationId: "org1",
  title: "Algebra",
  mode: "game",
  pacing: "teacher",
  status: "lobby",
  classId: null,
  allowGuests: false,
  lateJoinMinutes: null,
  startedAt: null,
  ...over,
});

const withGame = <A, E>(use: (game: Game["Service"]) => Effect.Effect<A, E>) => Effect.flatMap(Effect.service(Game), use);

// Every game here has players u1 and u2 on its roster.
const world = (over: GameOptions = {}) => gameWorld({ roster: ["u1", "u2"], ...over });

// Opens the lobby and has the given players join.
const lobby = (...players: string[]) =>
  Effect.gen(function* () {
    const game = yield* Game;
    yield* game.openLobby("g1");
    for (const id of players) yield* game.join(id, "g1");
    return game;
  });

const running = (...players: string[]) =>
  Effect.gen(function* () {
    const game = yield* lobby(...players);
    yield* game.start("g1");
    return game;
  });

describe("Game: finding a game by its key", () => {
  test("a key that isn't seven letters and numbers, or matches no open session, is NotFound", async () => {
    const { run } = world();
    const errors = await run(
      Effect.gen(function* () {
        const game = yield* Game;
        return [yield* Effect.flip(game.lookup("abc")), yield* Effect.flip(game.lookup("ABC-DEFG"))];
      }),
    );
    expect(errors.every((e) => e instanceof NotFound)).toBe(true);
    expect(errors.map((e) => e.message)).toEqual([
      "A join key has 7 letters and numbers, like ABC-DEFG.",
      "That key doesn't match an open session.",
    ]);
  });

  test("a guest may play only a classless game whose teacher allowed guests", async () => {
    const guest = user("u1", "guest");
    const check = async (open: OpenGame) => {
      const { run } = world({ byKey: open, roster: [] });
      return run(
        Effect.gen(function* () {
          const game = yield* Game;
          const looked = yield* game.lookup("abc-defg");
          const found = yield* game.find(guest, "abc-defg").pipe(Effect.match({ onSuccess: () => "found", onFailure: (e) => e._tag }));
          return { guestsAllowed: looked.guestsAllowed, found };
        }),
      );
    };
    expect(await check(openGame({ allowGuests: true }))).toEqual({ guestsAllowed: true, found: "found" });
    expect(await check(openGame({ allowGuests: false }))).toEqual({ guestsAllowed: false, found: "NotFound" });
    expect(await check(openGame({ allowGuests: true, classId: "c1" }))).toEqual({ guestsAllowed: false, found: "NotFound" });
    expect(await check(openGame({ allowGuests: true, mode: "quiz" }))).toEqual({ guestsAllowed: false, found: "NotFound" });
  });

  test("a key only opens a session of the organization the user works in", async () => {
    const { run, log } = world({ byKey: openGame(), roster: [], entries: ["u1"] });
    const err = await run(
      Effect.gen(function* () {
        const game = yield* Game;
        return yield* Effect.flip(game.find(user("u1", "student", "org2"), "abcdefg"));
      }),
    );
    expect(err).toBeInstanceOf(NotFound);
    expect(err.message).toBe("That key doesn't match an open session.");
    // A user with no active organization gets the same answer.
    const none = await run(
      Effect.gen(function* () {
        const game = yield* Game;
        return yield* Effect.flip(game.find(user("u1", "student", null), "abcdefg"));
      }),
    );
    expect(none).toBeInstanceOf(NotFound);
    expect(log.addedToRoster).toEqual([]);
  });

  test("a guest gets a roster entry in the organization of the game, once", async () => {
    const { run, log } = world({ byKey: openGame({ allowGuests: true }), roster: [] });
    await run(
      Effect.gen(function* () {
        const game = yield* Game;
        yield* game.find(user("u1", "guest"), "abcdefg");
        yield* game.find(user("u1", "guest"), "abcdefg");
      }),
    );
    expect(log.addedEntries).toEqual(["u1@org1"]);
    expect(log.addedToRoster).toEqual(["u1"]);
  });

  test("a classless game needs the student to have joined a class (a roster entry), then puts them on its roster", async () => {
    const { run, log } = world({ byKey: openGame(), roster: [], entries: ["u2"] });
    await run(
      Effect.gen(function* () {
        const game = yield* Game;
        const refused = yield* Effect.flip(game.find(user("u1"), "ABC-DEFG"));
        expect(refused).toBeInstanceOf(Conflict);
        expect(log.addedToRoster).toEqual([]);
        const found = yield* game.find(user("u2"), "abcdefg");
        expect(found).toEqual({ sessionId: "g1", title: "Algebra", mode: "game", pacing: "teacher", status: "lobby" });
        // Finding it again doesn't add them twice.
        yield* game.find(user("u2"), "abcdefg");
      }),
    );
    expect(log.addedToRoster).toEqual(["u2"]);
  });

  test("it is too late to join once the late-join window after the start has passed", async () => {
    const late = world({ byKey: openGame({ status: "running", lateJoinMinutes: 5, startedAt: minutesAgo(10) }), roster: [], entries: ["u1"] });
    const err = await late.run(withGame((g) => Effect.flip(g.find(user("u1"), "ABC-DEFG"))));
    expect(err).toBeInstanceOf(Conflict);
    expect(err.message).toContain("too late");
    expect(late.log.addedToRoster).toEqual([]);

    const inTime = world({ byKey: openGame({ status: "running", lateJoinMinutes: 5, startedAt: minutesAgo(1) }), roster: [], entries: ["u1"] });
    await inTime.run(withGame((g) => g.find(user("u1"), "ABC-DEFG")));
    expect(inTime.log.addedToRoster).toEqual(["u1"]);
  });

  test("a player the teacher removed can't get back in with the key", async () => {
    const { run, roster } = world({ byKey: openGame(), entries: ["u1"] });
    roster.set("u1", "removed");
    const err = await run(withGame((g) => Effect.flip(g.find(user("u1"), "ABC-DEFG"))));
    expect(err).toBeInstanceOf(Conflict);
    expect(err.message).toBe("You were removed from this session.");
  });

  test("a class game opens only for its roster and for members of its class who weren't on it yet", async () => {
    const byKey = openGame({ classId: "c1" });
    const outsider = world({ byKey, roster: [], entries: ["u1"] });
    expect(await outsider.run(withGame((g) => Effect.flip(g.find(user("u1"), "ABC-DEFG"))))).toBeInstanceOf(NotFound);
    expect(outsider.log.addedToRoster).toEqual([]);

    const member = world({ byKey, roster: [], entries: ["u1"], classMembers: ["c1:r-u1"] });
    await member.run(withGame((g) => g.find(user("u1"), "ABC-DEFG")));
    expect(member.log.addedToRoster).toEqual(["u1"]);

    // Already on the roster: no class check, nothing added.
    const rostered = world({ byKey, roster: ["u1"] });
    await rostered.run(withGame((g) => g.find(user("u1"), "ABC-DEFG")));
    expect(rostered.log.addedToRoster).toEqual([]);
  });
});

describe("Game: joining", () => {
  test("someone who isn't on the roster gets NotFound, a removed player Conflict", async () => {
    const { run, roster } = world();
    roster.set("u2", "removed");
    const errors = await run(
      Effect.gen(function* () {
        const game = yield* lobby();
        return [yield* Effect.flip(game.join("stranger", "g1")), yield* Effect.flip(game.join("u2", "g1"))];
      }),
    );
    expect(errors[0]).toBeInstanceOf(NotFound);
    expect(errors[1]).toBeInstanceOf(Conflict);
  });

  test("nobody can join before the teacher opens the lobby, or after the game ended", async () => {
    const early = world();
    const err = await early.run(withGame((g) => Effect.flip(g.join("u1", "g1"))));
    expect(err.message).toBe("Your teacher hasn't opened the game yet.");
    expect(early.log.ensured).toEqual([]);

    const over = world({ session: { status: "ended", endedAt: new Date() } });
    const overErr = await over.run(withGame((g) => Effect.flip(g.join("u1", "g1"))));
    expect(overErr.message).toBe("This game is over.");
  });

  test("joining makes the player's attempt once; a second join changes nothing", async () => {
    const { run, log, signals } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* lobby("u1");
        yield* game.join("u1", "g1");
        const rooms = yield* RoomStore;
        const room = yield* rooms.need("g1");
        expect([...room.players.values()].map((p) => p.userId)).toEqual(["u1"]);
      }),
    );
    expect(log.ensured).toHaveLength(1);
    // A teacher-paced game deals every player the same paper: the attempt is made with the room's seed.
    expect(log.ensured[0]!.seed).not.toBeNull();
    expect(signals()).toContainEqual({ to: "user", userId: "u1" });
  });

  test("a student-paced player gets a seed of their own, not the room's", async () => {
    const { run, log } = world({ session: { pacing: "student" } });
    await run(lobby("u1"));
    expect(log.ensured).toEqual([{ userId: "u1", seed: null }]);
  });

  test("late joiners are turned away once the window after the start has closed", async () => {
    const { run, log } = world({ session: { status: "running", startedAt: new Date(minutesAgo(10)), lateJoinMinutes: 5, gamePhase: "question", currentQuestionIndex: 0, questionStartedAt: new Date() } });
    const err = await run(withGame((g) => Effect.flip(g.join("u1", "g1"))));
    expect(err).toBeInstanceOf(Conflict);
    expect(err.message).toContain("too late");
    expect(log.ensured).toEqual([]);
  });
});

describe("Game: opening and starting", () => {
  test("a quiz that can't be played as a game can't open its lobby", async () => {
    const { run, log, session } = world({
      session: { pacing: "student", relay: relaySettings(), relayPassword: "SUN" },
      questions: [trueFalse("q1", true), essay("q2")],
    });
    const err = await run(withGame((g) => Effect.flip(g.openLobby("g1"))));
    expect(err).toBeInstanceOf(Conflict);
    expect(err.message).toContain("essay");
    expect(log.lobby).toBe(0);
    expect(session.row.status).toBe("scheduled");
  });

  test("opening the lobby tells the screens and the live teacher view, and opening it again does nothing", async () => {
    const { run, log, signals } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* Game;
        yield* game.openLobby("g1");
        yield* game.openLobby("g1");
      }),
    );
    expect(log.lobby).toBe(1);
    expect(log.sessionChanged).toBe(1);
    expect(signals()).toEqual([{ to: "all" }]);
  });

  test("an ended game can't be opened or started again", async () => {
    const { run } = world({ session: { status: "ended", endedAt: new Date() } });
    const errors = await run(
      Effect.gen(function* () {
        const game = yield* Game;
        return [yield* Effect.flip(game.openLobby("g1")), yield* Effect.flip(game.start("g1"))];
      }),
    );
    expect(errors.map((e) => e.message)).toEqual(["This game is over.", "This game is over."]);
  });

  test("a game can't start without a player, and starting opens the first question exactly once", async () => {
    const { run, log, session } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* lobby();
        const empty = yield* Effect.flip(game.start("g1"));
        expect(empty.message).toBe("Wait for at least one player to join.");
        expect(log.running).toBe(0);
        yield* game.join("u1", "g1");
        yield* game.start("g1");
        const again = yield* Effect.flip(game.start("g1"));
        expect(again.message).toBe("The game already started.");
      }),
    );
    expect(log.running).toBe(1);
    expect(session.row.status).toBe("running");
    expect(log.positions).toHaveLength(1);
    expect(log.positions[0]).toMatchObject({ phase: "question", index: 0, pausedAt: null });
    expect(log.positions[0]!.questionStartedAt).toBeGreaterThan(Date.now() - 5_000);
  });

  test("every teacher control on a game that doesn't exist is NotFound", async () => {
    const { run } = world({ missing: true });
    const errors = await run(
      Effect.gen(function* () {
        const game = yield* Game;
        return [
          yield* Effect.flip(game.openLobby("g1")),
          yield* Effect.flip(game.start("g1")),
          yield* Effect.flip(game.advance("g1")),
          yield* Effect.flip(game.end("g1")),
          yield* Effect.flip(game.kick("g1", "a1")),
          yield* Effect.flip(game.standings("g1", null)),
        ];
      }),
    );
    expect(errors.every((e) => e instanceof NotFound)).toBe(true);
  });
});

describe("Game: answering a teacher-paced game", () => {
  test("only a player who joined can answer, and only while a question is open", async () => {
    const { run, log } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* lobby("u1");
        const early = yield* Effect.flip(game.answer("u1", "g1", "q1", true));
        expect(early.message).toBe("This question is closed.");
        yield* game.start("g1");
        const stranger = yield* Effect.flip(game.answer("u2", "g1", "q1", true));
        expect(stranger).toBeInstanceOf(Forbidden);
        const wrongQuestion = yield* Effect.flip(game.answer("u1", "g1", "q2", true));
        expect(wrongQuestion.message).toBe("That question isn't open.");
      }),
    );
    expect(log.stored).toEqual([]);
  });

  test("a right answer earns speed points and a streak; a wrong one earns nothing; each is stored once", async () => {
    const { run, log } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1", "u2");
        yield* game.answer("u1", "g1", "q1", true);
        yield* game.answer("u2", "g1", "q1", false);
        const twice = yield* Effect.flip(game.answer("u1", "g1", "q1", false));
        expect(twice.message).toBe("You already answered this question.");
      }),
    );
    expect(log.stored).toHaveLength(2);
    const [right, wrong] = log.stored;
    expect(right).toMatchObject({ correct: true, value: true, streak: 1 });
    expect(right!.earned).toBeGreaterThan(900);
    expect(right!.earned).toBeLessThanOrEqual(1000);
    expect(right!.points).toBe(right!.earned);
    expect(wrong).toMatchObject({ correct: false, earned: 0, points: 0, streak: 0 });
  });

  test("an essay in a teacher-paced game is accepted and unscored: no points, no verdict, the streak stays", async () => {
    const { run, log } = world({ questions: [trueFalse("q1", true), essay("q2")] });
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1");
        yield* game.answer("u1", "g1", "q1", true);
        yield* game.advance("g1");
        yield* game.advance("g1");
        yield* game.advance("g1");
        yield* game.answer("u1", "g1", "q2", "Because of the water cycle.");
      }),
    );
    const [first, essayRow] = log.stored;
    expect(essayRow).toMatchObject({ questionId: "q2", correct: null, earned: 0, value: "Because of the water cycle." });
    expect(essayRow!.points).toBe(first!.points);
    expect(essayRow!.streak).toBe(first!.streak);
  });

  test("code in a teacher-paced game is accepted and scored by the runner for speed", async () => {
    const { run, log } = world({
      questions: [code("q1")],
      runTests: () => Effect.succeed([{ testId: "t1", passed: true, output: "1" }]),
    });
    await run(Effect.flatMap(running("u1"), (game) => game.answer("u1", "g1", "q1", "print(1)")));
    expect(log.stored[0]).toMatchObject({ correct: true, streak: 1 });
    expect(log.stored[0]!.earned).toBeGreaterThan(900);
  });

  test("closing a code question waits for answers still being checked, and they keep their speed points", async () => {
    const { run, log } = world({
      questions: [code("q1")],
      runTests: () => Effect.sleep("2500 millis").pipe(Effect.as([{ testId: "t1", passed: true, output: "1" }])),
    });
    const phase = await run(
      Effect.gen(function* () {
        const game = yield* running("u1");
        const rooms = yield* RoomStore;
        yield* Effect.forkChild(game.answer("u1", "g1", "q1", "print(1)"));
        yield* Effect.sleep("50 millis");
        yield* game.advance("g1");
        return (yield* rooms.need("g1")).phase;
      }),
    );
    expect(phase).toBe("reveal");
    expect(log.stored).toHaveLength(1);
    expect(log.stored[0]!.earned).toBeGreaterThan(900);
  });

  test("a teacher-paced answer tells only that player's screen: the others learn the result when the question closes", async () => {
    const { run, bus } = world();
    await run(running("u1", "u2").pipe(Effect.tap((game) => game.answer("u1", "g1", "q1", true))));
    const last = bus.published[bus.published.length - 1]!.message;
    expect(last).toEqual({ to: "user", userId: "u1" });
  });

  test("answers are refused while the game is paused, and accepted again after it resumes", async () => {
    const { run } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1", "u2");
        yield* game.pause("g1");
        expect((yield* Effect.flip(game.pause("g1"))).message).toBe("The game is already paused.");
        expect((yield* Effect.flip(game.answer("u1", "g1", "q1", true))).message).toBe("The game is paused.");
        yield* game.unpause("g1");
        expect((yield* Effect.flip(game.unpause("g1"))).message).toBe("The game isn't paused.");
        yield* game.answer("u1", "g1", "q1", true);
      }),
    );
  });

  test("a game that hasn't started can't be paused", async () => {
    const { run } = world();
    const err = await run(Effect.flatMap(lobby("u1"), (game) => Effect.flip(game.pause("g1"))));
    expect(err.message).toBe("The game isn't running.");
  });

  test("a student-paced game has no teacher clock to pause, move or reset", async () => {
    const { run } = world({ session: { pacing: "student" } });
    const errors = await run(
      Effect.gen(function* () {
        const game = yield* running("u1");
        return [
          yield* Effect.flip(game.pause("g1")),
          yield* Effect.flip(game.goTo("g1", 1)),
          yield* Effect.flip(game.setSeconds("g1", 10)),
          yield* Effect.flip(game.advance("g1")),
        ];
      }),
    );
    expect(errors[0]!.message).toBe("Only a teacher-paced game has a clock the teacher controls.");
    expect(errors[3]!.message).toBe("Players move through a student-paced game themselves.");
    expect(errors.every((e) => e instanceof Conflict)).toBe(true);
  });
});

describe("Game: moving through the questions", () => {
  test("closing a question breaks the streak of those who didn't answer and keeps the position on record", async () => {
    const { run, log } = world({ attempts: [{ id: "a-u2", studentId: "u2", gameStreak: 2 }] });
    await run(
      Effect.gen(function* () {
        const game = yield* lobby("u1");
        yield* game.start("g1");
        yield* game.answer("u1", "g1", "q1", true);
        yield* game.advance("g1");
        const late = yield* Effect.flip(game.answer("u1", "g1", "q1", true));
        expect(late.message).toBe("This question is closed.");
      }),
    );
    expect(log.resetStreaks).toEqual([["a-u2"]]);
    expect(log.positions.map((p) => p.phase)).toEqual(["question", "reveal"]);
  });

  test("a full game: reveal, leaderboard, next question, and the last reveal ends the game", async () => {
    const { run, log, session } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1");
        const rooms = yield* RoomStore;
        const phases: string[] = [];
        for (let i = 0; i < 5; i++) {
          yield* game.advance("g1");
          phases.push(`${(yield* rooms.need("g1")).phase}:${(yield* rooms.need("g1")).index}`);
        }
        expect(phases).toEqual(["reveal:0", "leaderboard:0", "question:1", "reveal:1", "ended:1"]);
        const err = yield* Effect.flip(game.advance("g1"));
        expect(err.message).toBe("The game isn't running.");
      }),
    );
    expect(log.ended).toHaveLength(1);
    expect(session.row.status).toBe("ended");
  });

  test("without a leaderboard the next question follows the reveal directly", async () => {
    const { run } = world({ session: { gameLeaderboard: false } });
    const phase = await run(
      Effect.gen(function* () {
        const game = yield* running("u1");
        yield* game.advance("g1");
        yield* game.advance("g1");
        const room = yield* (yield* RoomStore).need("g1");
        return `${room.phase}:${room.index}`;
      }),
    );
    expect(phase).toBe("question:1");
  });

  test("the teacher can jump to a question not played yet, never to a played, missing or open one", async () => {
    const { run, log } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1");
        expect((yield* Effect.flip(game.goTo("g1", 1))).message).toBe("Close the open question first.");
        yield* game.advance("g1");
        expect((yield* Effect.flip(game.goTo("g1", 0))).message).toBe("That question was already played.");
        expect((yield* Effect.flip(game.goTo("g1", 5))).message).toBe("There's no such question.");
        expect((yield* Effect.flip(game.goTo("g1", 0.5))).message).toBe("There's no such question.");
        yield* game.goTo("g1", 1);
      }),
    );
    expect(log.positions[log.positions.length - 1]).toMatchObject({ phase: "question", index: 1 });
  });

  test("shortening the question below the time already gone closes it at once; the new length is stored", async () => {
    const { run, log } = world();
    const phase = await run(
      Effect.gen(function* () {
        const game = yield* running("u1");
        yield* game.setSeconds("g1", 0);
        return (yield* (yield* RoomStore).need("g1")).phase;
      }),
    );
    expect(phase).toBe("reveal");
    expect(log.seconds).toEqual([0]);
  });

  test("a clock can't be changed before the game runs", async () => {
    const { run } = world();
    const err = await run(Effect.flatMap(lobby("u1"), (game) => Effect.flip(game.setSeconds("g1", 10))));
    expect(err.message).toBe("The game isn't running.");
  });
});

describe("Game: ending and results", () => {
  test("ending submits every open attempt for grading, once, and refuses further answers", async () => {
    const { run, log } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1", "u2");
        yield* game.end("g1");
        yield* game.end("g1");
        const late = yield* Effect.flip(game.answer("u1", "g1", "q1", true));
        expect(late.message).toBe("The game is over.");
        yield* until(() => log.submitted.length >= 2);
      }),
    );
    expect(log.ended).toHaveLength(1);
    expect([...log.submitted].sort()).toEqual(["a1", "a2"]);
  });

  test("the final standings rank by points, share a rank on a tie, and know which row is the viewer's", async () => {
    const { run } = world({
      attempts: [
        { id: "a-zed", studentId: "zed", points: 900 },
        { id: "a-amy", studentId: "amy", points: 900 },
        { id: "a-bob", studentId: "bob", points: 1500 },
        { id: "a-cy", studentId: "cy", points: 0 },
      ],
      session: { status: "ended", endedAt: new Date() },
    });
    const result = await run(withGame((game) => game.standings("g1", "zed")));
    expect(result.ended).toBe(true);
    expect(result.questionCount).toBe(2);
    expect(result.standings.map((s) => [s.attemptId, s.rank])).toEqual([
      ["a-bob", 1],
      ["a-amy", 2],
      ["a-zed", 2],
      ["a-cy", 4],
    ]);
    expect(result.myAttemptId).toBe("a-zed");
    expect(result.teams).toEqual([]);
  });

  test("standings of a viewer who isn't playing have no attempt of their own", async () => {
    const { run } = world({ attempts: [{ id: "a-bob", studentId: "bob", points: 10 }] });
    const result = await run(withGame((game) => game.standings("g1", "someone-else")));
    expect(result.myAttemptId).toBeNull();
  });
});

describe("Game: removing players", () => {
  test("a removed player is out until the teacher lets them back", async () => {
    const { run, log } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* lobby("u1", "u2");
        const rooms = yield* RoomStore;
        yield* game.kick("g1", "a1");
        expect([...(yield* rooms.need("g1")).players.values()].map((p) => p.userId)).toEqual(["u2"]);
        const err = yield* Effect.flip(game.join("u1", "g1"));
        expect(err.message).toBe("You were removed from this session.");
        yield* game.allowRejoin("g1", "u1");
        yield* game.join("u1", "g1");
        expect((yield* rooms.need("g1")).byUser.has("u1")).toBe(true);
      }),
    );
    expect(log.removed).toEqual([{ attemptId: "a1", userId: "u1" }]);
    expect(log.allowed).toEqual(["u1"]);
  });

  test("kicking someone who isn't in the game, or re-admitting someone who wasn't removed, is NotFound", async () => {
    const { run, log } = world();
    const errors = await run(
      Effect.gen(function* () {
        const game = yield* lobby("u1");
        return [yield* Effect.flip(game.kick("g1", "nobody")), yield* Effect.flip(game.allowRejoin("g1", "u1"))];
      }),
    );
    expect(errors.every((e) => e instanceof NotFound)).toBe(true);
    expect(log.removed).toEqual([]);
    expect(log.allowed).toEqual([]);
  });
});

describe("Game: the background tick and restarts", () => {
  const midQuestion = (over: GameOptions["session"] = {}): GameOptions => ({
    session: {
      status: "running",
      gamePhase: "question",
      currentQuestionIndex: 0,
      gameQuestionSeconds: 20,
      startedAt: new Date(minutesAgo(5)),
      ...over,
    },
    attempts: [{ studentId: "u1" }],
  });

  test("after a restart the question carries on, and the tick closes it once its time is up", async () => {
    const { run, log } = world(midQuestion({ questionStartedAt: new Date(minutesAgo(1)) }));
    await run(
      Effect.gen(function* () {
        const game = yield* Game;
        yield* game.resume;
        const room = yield* (yield* RoomStore).need("g1");
        expect(room.phase).toBe("question");
        yield* game.tick;
        yield* until(() => log.positions.some((p) => p.phase === "reveal"));
      }),
    );
    expect(log.positions[log.positions.length - 1]).toMatchObject({ phase: "reveal", index: 0 });
  });

  test("the tick leaves a question with time left, or a paused one, alone", async () => {
    const fresh = world(midQuestion({ questionStartedAt: new Date() }));
    const paused = world(midQuestion({ questionStartedAt: new Date(minutesAgo(1)), pausedAt: new Date() }));
    for (const { run } of [fresh, paused]) {
      await run(
        Effect.gen(function* () {
          const game = yield* Game;
          yield* game.resume;
          yield* game.tick;
          yield* Effect.sleep("50 millis");
          expect((yield* (yield* RoomStore).need("g1")).phase).toBe("question");
        }),
      );
    }
    expect(fresh.log.positions).toEqual([]);
    expect(paused.log.positions).toEqual([]);
  });

  test("only games in the lobby or running are loaded when the API starts", async () => {
    const live = world({ session: { status: "lobby" } });
    const over = world({ session: { status: "ended", endedAt: new Date() } });
    const loaded = (w: typeof live) =>
      w.run(
        Effect.gen(function* () {
          const game = yield* Game;
          yield* game.resume;
          return (yield* (yield* RoomStore).all).map(([id]) => id);
        }),
      );
    expect(await loaded(live)).toEqual(["g1"]);
    expect(await loaded(over)).toEqual([]);
  });
});

describe("Game: a student-paced game", () => {
  const paced = () => world({ session: { pacing: "student" } });

  test("a player moves on only after answering, and finishing the last question submits their attempt", async () => {
    const { run, log, signals } = paced();
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1");
        const early = yield* Effect.flip(game.answer("u1", "g1", "q1", true));
        expect(early.message).toBe("The game isn't running for you.");
        yield* game.next("u1", "g1");
        expect(log.questionsShown).toEqual([{ attemptId: "a1", index: 0 }]);
        const skipped = yield* Effect.flip(game.next("u1", "g1"));
        expect(skipped.message).toBe("Answer the question first.");
        const wrongOrder = yield* Effect.flip(game.answer("u1", "g1", "q2", false));
        expect(wrongOrder.message).toBe("That question isn't open.");
        yield* game.answer("u1", "g1", "q1", true);
        const twice = yield* Effect.flip(game.answer("u1", "g1", "q1", true));
        expect(twice.message).toBe("You already answered this question.");
        yield* game.next("u1", "g1");
        yield* game.answer("u1", "g1", "q2", false);
        yield* game.next("u1", "g1");
        yield* until(() => log.submitted.length === 1);
        // A finished player's further "next" is quietly ignored.
        yield* game.next("u1", "g1");
      }),
    );
    expect(log.submitted).toEqual(["a1"]);
    expect(log.questionsShown.map((q) => q.index)).toEqual([0, 1]);
    expect(log.stored.map((s) => [s.questionId, s.correct])).toEqual([
      ["q1", true],
      ["q2", true],
    ]);
    // Nothing is persisted as the room's position: the players move alone.
    expect(log.positions).toEqual([]);
    expect(signals()).toContainEqual({ to: "user", userId: "u1" });
  });

  test("next is a student-paced move: refused for a teacher-paced game, a stranger, or a game that isn't running", async () => {
    const teacherPaced = world();
    const err = await teacherPaced.run(Effect.flatMap(lobby("u1"), (game) => Effect.flip(game.next("u1", "g1"))));
    expect(err.message).toBe("The teacher moves this game along.");

    const { run } = paced();
    const errors = await run(
      Effect.gen(function* () {
        const game = yield* lobby("u1");
        const notRunning = yield* Effect.flip(game.next("u1", "g1"));
        yield* game.start("g1");
        const stranger = yield* Effect.flip(game.next("u2", "g1"));
        return [notRunning, stranger];
      }),
    );
    expect(errors[0]).toBeInstanceOf(Conflict);
    expect(errors[1]).toBeInstanceOf(Forbidden);
  });
});

describe("Game: Team Relay", () => {
  const relay = (over: GameOptions = {}) =>
    world({
      session: { pacing: "student", relay: relaySettings(), relayPassword: "SUN" },
      questions: [trueFalse("q1", true), trueFalse("q2", true), trueFalse("q3", true), trueFalse("q4", true)],
      roster: ["u1", "u2", "u3"],
      ...over,
    });

  test("opening the lobby makes the teams the teacher asked for", async () => {
    const { run, log } = relay();
    await run(lobby());
    expect(log.teamsInserted).toHaveLength(2);
    expect(new Set(log.teamsInserted).size).toBe(2);
  });

  test("teams are filled up to their size, by the teacher or by the players when they may pick", async () => {
    const { run, log } = relay();
    const errors = await run(
      Effect.gen(function* () {
        const game = yield* lobby("u1", "u2", "u3");
        yield* game.assignTeam("g1", "a1", "team1");
        yield* game.pickTeam("u2", "g1", "team1");
        const full = yield* Effect.flip(game.assignTeam("g1", "a3", "team1"));
        const noTeam = yield* Effect.flip(game.assignTeam("g1", "a3", "team9"));
        const noPlayer = yield* Effect.flip(game.assignTeam("g1", "ghost", "team2"));
        const fullByPick = yield* Effect.flip(game.pickTeam("u3", "g1", "team1"));
        yield* game.setStudentPick("g1", false);
        const locked = yield* Effect.flip(game.pickTeam("u3", "g1", "team2"));
        return { full, noTeam, noPlayer, fullByPick, locked };
      }),
    );
    expect(errors.full).toBeInstanceOf(Conflict);
    expect(errors.noTeam).toBeInstanceOf(NotFound);
    expect(errors.noPlayer).toBeInstanceOf(NotFound);
    expect(errors.fullByPick).toBeInstanceOf(Conflict);
    expect(errors.locked.message).toBe("Your teacher puts the players in teams.");
    expect(log.savedMembers.map((s) => s.rows)).toEqual([[{ attemptId: "a1", teamId: "team1" }], [{ attemptId: "a2", teamId: "team1" }]]);
  });

  test("the last team can't be removed, and a removed team's members go back to unassigned", async () => {
    const { run, log } = relay();
    const result = await run(
      Effect.gen(function* () {
        const game = yield* lobby("u1");
        yield* game.assignTeam("g1", "a1", "team1");
        yield* game.removeTeam("g1", "team1");
        const room = yield* (yield* RoomStore).need("g1");
        const unassigned = room.byUser.get("u1")!.teamId;
        const last = yield* Effect.flip(game.removeTeam("g1", "team2"));
        const missing = yield* Effect.flip(game.removeTeam("g1", "team1"));
        return { unassigned, last, missing };
      }),
    );
    expect(result.unassigned).toBeNull();
    expect(result.last.message).toBe("A relay needs at least one team.");
    expect(result.missing).toBeInstanceOf(NotFound);
    expect(log.deletedTeams).toEqual(["team1"]);
  });

  test("team changes are for the lobby of a relay only", async () => {
    const classic = world();
    const err = await classic.run(Effect.flatMap(lobby("u1"), (game) => Effect.flip(game.addTeam("g1"))));
    expect(err.message).toBe("This isn't a Team Relay game.");

    const { run } = relay();
    const errors = await run(
      Effect.gen(function* () {
        const game = yield* Game;
        const closed = yield* Effect.flip(game.addTeam("g1"));
        yield* game.openLobby("g1");
        yield* game.join("u1", "g1");
        yield* game.join("u2", "g1");
        yield* game.assignTeam("g1", "a1", "team1");
        yield* game.assignTeam("g1", "a2", "team1");
        yield* game.start("g1");
        const started = yield* Effect.flip(game.assignTeam("g1", "a1", "team2"));
        return { closed, started };
      }),
    );
    expect(errors.closed.message).toBe("Open the lobby first.");
    expect(errors.started.message).toBe("The teams are locked: the game already started.");
  });

  test("a team with one player starts; teams without players are dropped when it does", async () => {
    const solo = relay();
    await solo.run(
      Effect.gen(function* () {
        const game = yield* lobby("u1", "u2", "u3");
        yield* game.assignTeam("g1", "a1", "team1");
        yield* game.assignTeam("g1", "a2", "team1");
        yield* game.assignTeam("g1", "a3", "team2");
        yield* game.start("g1");
      }),
    );
    expect(solo.log.startedRelay).toHaveLength(1);
    expect(solo.log.startedRelay[0]!.plans.find((p) => p.teamId === "team2")!.members).toEqual(["a3"]);

    const ok = relay();
    await ok.run(
      Effect.gen(function* () {
        const game = yield* lobby("u1", "u2");
        yield* game.assignTeam("g1", "a1", "team1");
        yield* game.assignTeam("g1", "a2", "team1");
        yield* game.start("g1");
      }),
    );
    expect(ok.log.startedRelay).toHaveLength(1);
    const [started] = ok.log.startedRelay;
    expect(started!.empty).toEqual(["team2"]);
    expect(started!.plans).toHaveLength(1);
    expect(started!.plans[0]).toMatchObject({ teamId: "team1", password: "SUN" });
    expect([...started!.plans[0]!.members].sort()).toEqual(["a1", "a2"]);
  });

  test("the password: only a player of the playing team may guess, a blank guess is refused, the right guess (any case) wins and ends the game", async () => {
    const { run, log, session } = relay();
    await run(
      Effect.gen(function* () {
        const game = yield* lobby("u1", "u2");
        const early = yield* Effect.flip(game.submitPassword("u1", "g1", "sun"));
        expect(early.message).toBe("The game isn't running.");
        yield* game.assignTeam("g1", "a1", "team1");
        yield* game.assignTeam("g1", "a2", "team1");
        yield* game.start("g1");
        expect(yield* Effect.flip(game.submitPassword("u3", "g1", "sun"))).toBeInstanceOf(Forbidden);
        expect((yield* Effect.flip(game.submitPassword("u1", "g1", "   "))).message).toBe("Type the password first.");
        yield* game.submitPassword("u1", "g1", " sun ");
        yield* until(() => log.ended.length === 1);
      }),
    );
    expect(log.guesses).toEqual([{ teamId: "team1", guess: "sun", correct: true }]);
    expect(session.row.status).toBe("ended");
  });

  test("a wrong guess is recorded, and the team has to wait before the next one", async () => {
    const { run, log } = relay();
    const err = await run(
      Effect.gen(function* () {
        const game = yield* lobby("u1", "u2");
        yield* game.assignTeam("g1", "a1", "team1");
        yield* game.assignTeam("g1", "a2", "team1");
        yield* game.start("g1");
        yield* game.submitPassword("u1", "g1", "moon");
        return yield* Effect.flip(game.submitPassword("u2", "g1", "sun"));
      }),
    );
    expect(err.message).toBe("Wait a moment before the next guess.");
    expect(log.guesses).toEqual([{ teamId: "team1", guess: "moon", correct: false }]);
  });

  test("with consensus required a guess waits for the teammates: reject drops it, confirm by all checks it", async () => {
    const { run, log } = relay({ session: { pacing: "student", relay: relaySettings({ requireConsensus: true }), relayPassword: "SUN" } });
    const messages = await run(
      Effect.gen(function* () {
        const game = yield* lobby("u1", "u2");
        yield* game.assignTeam("g1", "a1", "team1");
        yield* game.assignTeam("g1", "a2", "team1");
        yield* game.start("g1");
        const nothing = yield* Effect.flip(game.confirmPassword("u2", "g1"));
        yield* game.submitPassword("u1", "g1", "sun");
        const waiting = yield* Effect.flip(game.submitPassword("u2", "g1", "other"));
        expect(log.guesses).toEqual([]);
        yield* game.rejectPassword("u2", "g1");
        yield* game.submitPassword("u1", "g1", "sun");
        yield* game.confirmPassword("u2", "g1");
        return [nothing.message, waiting.message];
      }),
    );
    expect(messages).toEqual(["There's no guess to confirm.", "A guess is waiting for your teammates: confirm or reject it."]);
    expect(log.guesses).toEqual([{ teamId: "team1", guess: "sun", correct: true }]);
  });

  test("relay controls refuse a game that isn't a relay", async () => {
    const { run } = world({ session: { pacing: "student" } });
    const err = await run(Effect.flatMap(running("u1"), (game) => Effect.flip(game.submitPassword("u1", "g1", "x"))));
    expect(err.message).toBe("This isn't a Team Relay game.");
  });
});
