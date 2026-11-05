// What each screen is at (stageOf) and what its view may carry (GameViews.view): pacing x relay x viewer, and role
// redaction: a player never sees the answer before the reveal, and only the presenter gets the host's extras.
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { gameWorld, relaySettings, trueFalse, type GameOptions } from "../../testing/game.ts";
import { paperOf } from "./Engine.ts";
import { RoomStore } from "./RoomStore.ts";
import type { Viewer } from "./Room.ts";
import { Game } from "./Service.ts";
import { stageOf } from "./Stage.ts";
import { GameViews } from "./Views.ts";

const presenter: Viewer = { kind: "presenter" };
const player = (userId: string): Viewer => ({ kind: "player", userId });

const world = (over: GameOptions = {}) => gameWorld({ roster: ["u1", "u2"], ...over });

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

const roomOf = Effect.gen(function* () {
  return yield* (yield* RoomStore).need("g1");
});

describe("Stage: a teacher-paced game", () => {
  test("follows the room's phase for everyone: lobby, question with its clock, reveal, leaderboard, ended", async () => {
    const { run } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* lobby("u1", "u2");
        const room = yield* roomOf;
        const now = Date.now();
        for (const viewer of [presenter, player("u1")]) {
          const waiting = stageOf(room, viewer, now);
          expect(waiting).toMatchObject({ phase: "lobby", serve: null, endsAt: null, reveal: null, showBoard: false, finished: false });
        }

        yield* game.start("g1");
        for (const viewer of [presenter, player("u1")]) {
          const open = stageOf(room, viewer, now);
          expect(open.phase).toBe("question");
          expect(open.serve?.q.id).toBe("q1");
          expect(open.endsAt).toBe(room.questionStartedAt! + room.seconds * 1000);
          expect(open.reveal).toBeNull();
          expect(open.showBoard).toBe(false);
        }

        yield* game.advance("g1");
        for (const viewer of [presenter, player("u1")]) {
          const closed = stageOf(room, viewer, now);
          expect(closed.phase).toBe("reveal");
          expect(closed.serve?.q.id).toBe("q1");
          expect(closed.endsAt).toBeNull();
          expect(closed.reveal).toMatchObject({ answer: "True", answered: 0 });
        }

        yield* game.advance("g1");
        const board = stageOf(room, player("u1"), now);
        expect(board).toMatchObject({ phase: "leaderboard", serve: null, reveal: null, showBoard: true });

        yield* game.end("g1");
        for (const viewer of [presenter, player("u1")]) expect(stageOf(room, viewer, now)).toMatchObject({ phase: "ended", showBoard: true, serve: null });
      }),
    );
  });

  test("a player's own answer is known to them while the clock runs, but the result and the key wait for the reveal", async () => {
    const { run } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1", "u2");
        const room = yield* roomOf;
        const now = Date.now();
        expect(stageOf(room, player("u1"), now)).toMatchObject({ answered: false, last: null });
        yield* game.answer("u1", "g1", "q1", true);
        expect(stageOf(room, player("u1"), now)).toMatchObject({ phase: "question", answered: true, last: null, reveal: null });
        expect(stageOf(room, player("u2"), now)).toMatchObject({ answered: false, last: null });

        yield* game.advance("g1");
        const right = stageOf(room, player("u1"), now);
        expect(right.last).toMatchObject({ correct: true, answered: true });
        expect(right.reveal).toMatchObject({ answered: 1 });
        // Who didn't answer gets a result too, so their screen doesn't hang.
        expect(stageOf(room, player("u2"), now).last).toEqual({ correct: false, answered: false, earned: 0 });
        // The presenter has no player result.
        expect(stageOf(room, presenter, now).last).toBeNull();
      }),
    );
  });

  test("a viewer who is not in the game sees no result of their own", async () => {
    const { run } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1");
        yield* game.advance("g1");
        const stranger = stageOf(yield* roomOf, player("u2"), Date.now());
        expect(stranger).toMatchObject({ phase: "reveal", player: undefined, last: null, answered: false });
      }),
    );
  });
});

describe("Stage: a student-paced game", () => {
  const student = (over: GameOptions = {}) => world({ session: { pacing: "student" }, ...over });

  test("the presenter watches the standings; a player waits in the lobby until they press Play", async () => {
    const { run } = student();
    await run(
      Effect.gen(function* () {
        const game = yield* lobby("u1");
        const room = yield* roomOf;
        const now = Date.now();
        expect(stageOf(room, presenter, now)).toMatchObject({ phase: "lobby", showBoard: true, serve: null });
        expect(stageOf(room, player("u1"), now)).toMatchObject({ phase: "lobby", showBoard: false });
        yield* game.start("g1");
        expect(stageOf(room, presenter, now)).toMatchObject({ phase: "leaderboard", showBoard: true, serve: null });
        // Started, but this player hasn't pressed Play.
        expect(stageOf(room, player("u1"), now)).toMatchObject({ phase: "lobby", serve: null });
      }),
    );
  });

  test("a player's question runs on their own clock, shows its key only once they answered, and ends with the standings", async () => {
    const { run } = student();
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1");
        yield* game.next("u1", "g1");
        const room = yield* roomOf;
        const p = room.byUser.get("u1")!;
        const now = Date.now();
        const first = paperOf(room, p)[0]!;
        const open = stageOf(room, player("u1"), now);
        expect(open).toMatchObject({ phase: "question", index: 0, answered: false, reveal: null, last: null, showBoard: true });
        expect(open.serve).toEqual({ q: first, seed: p.seed });
        expect(open.endsAt).toBe(p.startedAt! + room.seconds * 1000);

        yield* game.answer("u1", "g1", first.id, true);
        const answered = stageOf(room, player("u1"), now);
        expect(answered).toMatchObject({ phase: "reveal", answered: true, endsAt: null });
        expect(answered.reveal).toMatchObject({ buckets: [], answer: expect.any(String), answered: 1 });
        expect(answered.last).toMatchObject({ answered: true });

        yield* game.next("u1", "g1");
        yield* game.answer("u1", "g1", paperOf(room, p)[1]!.id, true);
        yield* game.next("u1", "g1");
        expect(stageOf(room, player("u1"), now)).toMatchObject({ phase: "leaderboard", finished: true, showBoard: true, serve: null });
      }),
    );
  });
});

describe("Stage: a Team Relay", () => {
  const relay = () =>
    world({
      session: { pacing: "student", relay: relaySettings({ rescue: true }), relayPassword: "SUN" },
      questions: [trueFalse("q1", true), trueFalse("q2", true), trueFalse("q3", true), trueFalse("q4", true)],
      roster: ["u1", "u2", "u3"],
    });

  const started = Effect.gen(function* () {
    const game = yield* lobby("u1", "u2", "u3");
    yield* game.assignTeam("g1", "a1", "team1");
    yield* game.assignTeam("g1", "a2", "team1");
    yield* game.assignTeam("g1", "a3", "team2");
    yield* game.start("g1");
    return game;
  });

  test("a relay player's question count is their own paper, and a right answer shows no key", async () => {
    const { run } = relay();
    await run(
      Effect.gen(function* () {
        const game = yield* started;
        yield* game.next("u1", "g1");
        const room = yield* roomOf;
        const p = room.byUser.get("u1")!;
        const paper = paperOf(room, p);
        const open = stageOf(room, player("u1"), Date.now());
        expect(open.count).toBe(paper.length);
        expect(open.count).toBeLessThan(room.questions.length);
        yield* game.answer("u1", "g1", paper[0]!.id, true);
        const answered = stageOf(room, player("u1"), Date.now());
        expect(answered.phase).toBe("reveal");
        expect(answered.reveal?.answer).toBeNull();
      }),
    );
  });

  test("once their team's round is over a player is finished and sees the standings, while the other team plays on", async () => {
    const { run } = relay();
    await run(
      Effect.gen(function* () {
        const game = yield* started;
        yield* game.next("u1", "g1");
        yield* game.submitPassword("u1", "g1", "SUN");
        const room = yield* roomOf;
        expect(room.status).toBe("running");
        const now = Date.now();
        expect(stageOf(room, player("u1"), now)).toMatchObject({ phase: "leaderboard", finished: true, showBoard: true, serve: null });
        expect(stageOf(room, player("u3"), now).finished).toBe(false);
      }),
    );
  });

  test("a teammate's question the player took is served on its own clock, after the last of their own", async () => {
    const { run } = relay();
    await run(
      Effect.gen(function* () {
        yield* started;
        const room = yield* roomOf;
        const p = room.byUser.get("u1")!;
        const mate = room.byUser.get("u2")!;
        const team = room.teams.get("team1")!;
        const slot = [...team.slots.values()].find((s) => s.owner === mate.attemptId)!;
        slot.rescuer = p.attemptId;
        slot.rescueClaimedAt = Date.now() - 1000;
        const now = Date.now();
        const stage = stageOf(room, player("u1"), now);
        expect(stage.phase).toBe("question");
        expect(stage.serve).toEqual({ q: room.byId.get(slot.questionId)!, seed: p.seed });
        expect(stage.endsAt).toBe(slot.rescueClaimedAt! + room.seconds * 1000);
        expect(stage.rescuing).toBe(slot);
        expect(stage.index).toBe(Math.max(stage.count - 1, 0));
        // The owner is not on it.
        expect(stageOf(room, player("u2"), now).rescuing).toBeUndefined();
      }),
    );
  });
});

describe("Views: what a screen of each role may carry", () => {
  const view = (viewer: Viewer) =>
    Effect.gen(function* () {
      const views = yield* GameViews;
      return yield* views.view(yield* roomOf, viewer);
    });

  test("the question never carries its answer key, for a player or the presenter, and the answer only comes with the reveal", async () => {
    const { run } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1", "u2");
        for (const viewer of [presenter, player("u1")]) {
          const open = yield* view(viewer);
          expect(open.phase).toBe("question");
          expect(open.question).not.toBeNull();
          expect("answer" in open.question!).toBe(false);
          expect(open.reveal).toBeNull();
        }
        yield* game.advance("g1");
        const closed = yield* view(player("u1"));
        expect(closed.phase).toBe("reveal");
        expect("answer" in closed.question!).toBe(false);
        expect(closed.reveal?.answer).toBe("True");
      }),
    );
  });

  test("only the presenter gets the question list, the roster and the removed players", async () => {
    const { run } = world();
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1", "u2");
        yield* game.kick("g1", "a2");
        const host = yield* view(presenter);
        expect(host.outline.map((o) => o.prompt)).toEqual(["Question q1", "Question q2"]);
        expect(host.players.map((p) => p.name)).toEqual(["Name u1"]);
        expect(host.removed.map((r) => r.userId)).toEqual(["u2"]);
        const mine = yield* view(player("u1"));
        expect(mine.outline).toEqual([]);
        expect(mine.players).toEqual([]);
        expect(mine.removed).toEqual([]);
        expect(mine.me?.attemptId).toBe("a1");
        expect(host.me).toBeNull();
      }),
    );
  });

  test("a student-paced player sees the key of their own question only after answering it", async () => {
    const { run } = world({ session: { pacing: "student" } });
    await run(
      Effect.gen(function* () {
        const game = yield* running("u1");
        yield* game.next("u1", "g1");
        const room = yield* roomOf;
        const first = paperOf(room, room.byUser.get("u1")!)[0]!;
        const open = yield* view(player("u1"));
        expect(open.reveal).toBeNull();
        expect("answer" in open.question!).toBe(false);
        yield* game.answer("u1", "g1", first.id, true);
        const answered = yield* view(player("u1"));
        expect(answered.reveal?.answer).toEqual(expect.any(String));
        expect(answered.me?.last).toMatchObject({ answered: true });
      }),
    );
  });

  test("a relay player's team and password stay hidden from the other team until their round is over", async () => {
    const { run } = world({
      session: { pacing: "student", relay: relaySettings(), relayPassword: "SUN" },
      questions: [trueFalse("q1", true), trueFalse("q2", true), trueFalse("q3", true), trueFalse("q4", true)],
      roster: ["u1", "u2", "u3"],
    });
    await run(
      Effect.gen(function* () {
        const game = yield* lobby("u1", "u2", "u3");
        yield* game.assignTeam("g1", "a1", "team1");
        yield* game.assignTeam("g1", "a2", "team1");
        yield* game.assignTeam("g1", "a3", "team2");
        yield* game.start("g1");
        const before = yield* view(player("u3"));
        expect(before.relay?.team?.id).toBe("team2");
        expect(before.relay?.teams.every((t) => t.password === null)).toBe(true);
        yield* game.next("u1", "g1");
        yield* game.submitPassword("u1", "g1", "SUN");
        const after = yield* view(player("u3"));
        // Team 1 solved it, but its password is for its own members and the presenter.
        expect(after.relay?.teams.find((t) => t.id === "team1")).toMatchObject({ finished: true, password: null });
        expect((yield* view(player("u1"))).relay?.teams.find((t) => t.id === "team1")?.password).toBe("SUN");
        expect((yield* view(presenter)).relay?.teams.find((t) => t.id === "team1")?.password).toBe("SUN");
      }),
    );
  });
});
