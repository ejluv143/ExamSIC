// Interleavings of room transitions, run through the Game service on the in-memory game world: requests that
// arrive while another is still waiting (a code check, a slow write, a closing question) must see consistent state.
import { describe, expect, test } from "bun:test";
import { Conflict } from "@examinus/contract/errors";
import { Effect, Exit, Fiber } from "effect";
import { code, gameWorld, relaySettings, trueFalse, type GameOptions } from "../../testing/game.ts";
import { paperOf } from "./Engine.ts";
import { RoomStore } from "./RoomStore.ts";
import { Game } from "./Service.ts";

const world = (over: GameOptions = {}) => gameWorld({ roster: ["u1", "u2"], ...over });

const running = (...players: string[]) =>
  Effect.gen(function* () {
    const game = yield* Game;
    yield* game.openLobby("g1");
    for (const id of players) yield* game.join(id, "g1");
    yield* game.start("g1");
    return game;
  });

// A code question whose check takes a while, like a runner under load.
const slowCode = (ms: number) =>
  ({
    questions: [code("q1")],
    runTests: () => Effect.sleep(`${ms} millis`).pipe(Effect.as([{ testId: "t1", passed: true, output: "1" }])),
  }) satisfies GameOptions;

describe("Room transitions: answers racing each other and the question's clock", () => {
  test("two taps of the same answer count once", async () => {
    const { run, log } = world({ storeDelay: "40 millis" });
    const exits = await run(
      Effect.gen(function* () {
        const game = yield* running("u1");
        return yield* Effect.all([Effect.exit(game.answer("u1", "g1", "q1", true)), Effect.exit(game.answer("u1", "g1", "q1", true))], {
          concurrency: "unbounded",
        });
      }),
    );
    expect(exits.filter(Exit.isSuccess)).toHaveLength(1);
    expect(log.stored).toHaveLength(1);
  });

  test("an answer being checked when the question closes still lands in the reveal; one that starts after the close began is refused", async () => {
    const { run, log } = world(slowCode(300));
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1", "u2");
        const room = yield* (yield* RoomStore).need("g1");
        const slow = yield* Effect.forkChild(game.answer("u1", "g1", "q1", "print(1)"));
        yield* Effect.sleep("50 millis");
        const closing = yield* Effect.forkChild(game.advance("g1"));
        yield* Effect.sleep("50 millis");
        // The close is waiting for the check, and does not hold the room: the check can land, new answers can't start.
        expect(room.closing).toBe(true);
        expect(room.phase).toBe("question");
        const refused = yield* Effect.flip(game.answer("u2", "g1", "q1", "print(1)"));
        expect(refused).toBeInstanceOf(Conflict);
        expect(refused.message).toBe("This question is closed.");
        yield* Fiber.join(slow);
        yield* Fiber.join(closing);
        expect(room.phase).toBe("reveal");
        expect(room.closing).toBe(false);
        expect(room.lastResult.get("a1")).toMatchObject({ correct: true, answered: true });
        expect(room.lastResult.get("a2")).toEqual({ correct: false, answered: false, earned: 0 });
        expect([...room.tally.values()].reduce((a, b) => a + b, 0)).toBe(1);
      }),
    );
    expect(log.stored).toHaveLength(1);
    expect(log.stored[0]!.earned).toBeGreaterThan(900);
  });

  test("closing twice at once closes once", async () => {
    const { run, log } = world(slowCode(150));
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1");
        const room = yield* (yield* RoomStore).need("g1");
        const slow = yield* Effect.forkChild(game.answer("u1", "g1", "q1", "print(1)"));
        yield* Effect.sleep("30 millis");
        yield* Effect.all([game.advance("g1"), game.advance("g1")], { concurrency: "unbounded" });
        yield* Fiber.join(slow);
        expect(room.phase).toBe("reveal");
      }),
    );
    // One reveal: the position was written for the question opening and for its close, no more.
    expect(log.positions.filter((p) => p.phase === "reveal")).toHaveLength(1);
  });

  test("ending the game waits for an answer on its way, so it is stored before the podium", async () => {
    const { run, log } = world(slowCode(200));
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1");
        const slow = yield* Effect.forkChild(game.answer("u1", "g1", "q1", "print(1)"));
        yield* Effect.sleep("30 millis");
        yield* game.end("g1");
        yield* Fiber.join(slow);
        const room = yield* (yield* RoomStore).need("g1");
        expect(room.phase).toBe("ended");
        expect(room.ranks.get("a1")!.points).toBeGreaterThan(900);
      }),
    );
    expect(log.stored).toHaveLength(1);
    expect(log.ended).toHaveLength(1);
  });
});

describe("Room transitions: players leaving while things are in flight", () => {
  test("kicking a player while their answer is being checked stores nothing for them, and the close still completes", async () => {
    const { run, log } = world(slowCode(300));
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1", "u2");
        const room = yield* (yield* RoomStore).need("g1");
        const slow = yield* Effect.forkChild(game.answer("u1", "g1", "q1", "print(1)"));
        yield* Effect.sleep("50 millis");
        const closing = yield* Effect.forkChild(game.advance("g1"));
        yield* Effect.sleep("50 millis");
        // The kick doesn't wait for the close's wait: it takes the room between the close's two sections.
        yield* game.kick("g1", "a1");
        expect(room.players.has("a1")).toBe(false);
        yield* Fiber.join(slow);
        yield* Fiber.join(closing);
        expect(room.phase).toBe("reveal");
        expect(room.lastResult.has("a1")).toBe(false);
        expect(room.answeredNow.has("a1")).toBe(false);
        expect(room.tally.size).toBe(0);
        expect(room.inflight).toBe(0);
      }),
    );
    expect(log.removed).toEqual([{ attemptId: "a1", userId: "u1" }]);
    expect(log.stored).toEqual([]);
  });

  test("a classic game's kick tells only the kicked player; a relay's tells every screen", async () => {
    const classic = world();
    await classic.run(
      Effect.gen(function* () {
        const game = yield* running("u1", "u2");
        yield* game.kick("g1", "a1");
      }),
    );
    expect(classic.signals().at(-1)).toEqual({ to: "user", userId: "u1" });

    const relay = world({
      session: { pacing: "student", relay: relaySettings(), relayPassword: "SUN" },
      questions: [trueFalse("q1", true), trueFalse("q2", true)],
    });
    await relay.run(
      Effect.gen(function* () {
        const game = yield* Game;
        yield* game.openLobby("g1");
        yield* game.join("u1", "g1");
        yield* game.kick("g1", "a1");
      }),
    );
    expect(relay.signals().at(-1)).toEqual({ to: "all" });
  });
});

describe("Room transitions: a relay's retry and password guess racing", () => {
  const relay = () =>
    world({
      session: { pacing: "student", relay: relaySettings({ retry: true, retryLimit: 2 }), relayPassword: "SUN" },
      questions: [trueFalse("q1", true), trueFalse("q2", true), trueFalse("q3", true), trueFalse("q4", true)],
    });

  test("both land, whatever their order, and each counts once", async () => {
    const { run, log } = relay();
    await run(
      Effect.gen(function* () {
        const game = yield* Game;
        yield* game.openLobby("g1");
        yield* game.join("u1", "g1");
        yield* game.join("u2", "g1");
        yield* game.assignTeam("g1", "a1", "team1");
        yield* game.assignTeam("g1", "a2", "team1");
        yield* game.start("g1");
        yield* game.next("u1", "g1");
        const room = yield* (yield* RoomStore).need("g1");
        const p = room.byUser.get("u1")!;
        const q = paperOf(room, p)[0]!;
        yield* game.answer("u1", "g1", q.id, false);
        const before = room.relayVersion;
        yield* Effect.all([game.retry("u1", "g1"), game.submitPassword("u2", "g1", "MOON")], { concurrency: "unbounded" });
        expect(p.tries.get(q.id)).toBe(1);
        expect(p.done.has(q.id)).toBe(false);
        expect(room.teams.get("team1")!.wrongGuesses).toBe(1);
        expect(room.relayVersion - before).toBe(2);
      }),
    );
    expect(log.guesses).toEqual([{ teamId: "team1", guess: "MOON", correct: false }]);
    expect(log.retried).toHaveLength(1);
  });

  test("a relay answer tells every screen, since teammates see each other's progress", async () => {
    const { run, signals } = relay();
    await run(
      Effect.gen(function* () {
        const game = yield* Game;
        yield* game.openLobby("g1");
        yield* game.join("u1", "g1");
        yield* game.join("u2", "g1");
        yield* game.assignTeam("g1", "a1", "team1");
        yield* game.assignTeam("g1", "a2", "team1");
        yield* game.start("g1");
        yield* game.next("u1", "g1");
        const room = yield* (yield* RoomStore).need("g1");
        yield* game.answer("u1", "g1", paperOf(room, room.byUser.get("u1")!)[0]!.id, true);
      }),
    );
    expect(signals().at(-1)).toEqual({ to: "all" });
  });
});
