import { describe, expect, test } from "bun:test";
import { Conflict, NotFound } from "@examinus/contract/errors";
import type { SessionSettingsFields } from "@examinus/contract/session";
import { Effect } from "effect";
import type { AttemptItem } from "../../database/schemas/index.ts";
import type { Actor } from "../auth/Session.ts";
import { harness } from "../../testing/config.ts";
import { attemptItem, exam, sessionItem, sessionSettings } from "../../testing/session-rows.ts";
import { teacher, intruder, otherOrganization, sessionWorld, type SessionWorldOptions } from "../../testing/session-world.ts";
import { SessionLifecycle } from "./Lifecycle.ts";

const setup = (options: SessionWorldOptions = {}) => {
  const world = sessionWorld(options);
  return { ...world, ...harness(world.layer) };
};

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000);
const create = (over: Partial<SessionSettingsFields> = {}, input: { quizId?: string; classId?: string | null; startNow?: boolean } = {}, actor: Actor = teacher) =>
  Effect.gen(function* () {
    return yield* (yield* SessionLifecycle).create(actor, { quizId: "quiz1", classId: "class1", startNow: false, ...input, ...sessionSettings(over) });
  });
const update = (sessionId: string, over: Partial<SessionSettingsFields> = {}, classId: string | null = "class1", actor: Actor = teacher) =>
  Effect.gen(function* () {
    return yield* (yield* SessionLifecycle).update(actor, { sessionId, classId, ...sessionSettings(over) });
  });

describe("SessionLifecycle.create", () => {
  test("a teacher can't create a session from someone else's quiz or for someone else's class", async () => {
    const { fail, state } = setup();
    expect((await fail(create({}, { quizId: "theirs" })))._tag).toBe("NotFound");
    expect((await fail(create({}, { classId: "theirs" })))._tag).toBe("NotFound");
    expect((await fail(create({}, {}, intruder)))._tag).toBe("NotFound");
    expect(state.inserted).toEqual([]);
  });

  test("a scheduled session is stored as scheduled and the class roster is copied onto it", async () => {
    const { run, state } = setup({ sessions: [] });
    const session = await run(create({ opensAt: hoursFromNow(1).toISOString(), closesAt: hoursFromNow(2).toISOString() }));
    expect(session.status).toBe("scheduled");
    expect(state.inserted[0]).toMatchObject({ quizId: "quiz1", classId: "class1", status: "scheduled", mode: "quiz" });
    expect(state.syncs).toEqual([{ sessionId: session.id, classId: "class1", replace: false }]);
  });

  test("a session without a class has no roster to copy", async () => {
    const { run, state } = setup({ sessions: [] });
    await run(create({}, { classId: null }));
    expect(state.syncs).toEqual([]);
  });

  test("starting now opens it at once, with a start time", async () => {
    const { run, state } = setup({ sessions: [] });
    const session = await run(create({}, { startNow: true }));
    expect(state.inserted[0]).toMatchObject({ status: "running" });
    expect(state.inserted[0]!.startedAt).toBeInstanceOf(Date);
    expect(session.status).toBe("running");
    expect(session.startedAt).not.toBeNull();
  });

  test("starting now with a close time already past is refused", async () => {
    const { fail, state } = setup({ sessions: [] });
    const err = await fail(create({ closesAt: hoursFromNow(-1).toISOString() }, { startNow: true }));
    expect(err).toMatchObject({ _tag: "Conflict", message: "The close time is already past." });
    expect(state.inserted).toEqual([]);
  });

  test("a game starting now opens its lobby instead of running, after the game accepts the quiz", async () => {
    const { run, state } = setup({ sessions: [] });
    const session = await run(
      create({ mode: "game", pacing: "teacher", game: { questionSeconds: 20, showLeaderboard: true, streakBonus: true, relay: null } }, { startNow: true }),
    );
    expect(state.inserted[0]).toMatchObject({ status: "scheduled" });
    expect(state.game).toEqual(["validate:quiz1:teacher", `openLobby:${session.id}`]);
  });

  test("a game the quiz can't support is refused before anything is stored", async () => {
    const { fail, state } = setup({ sessions: [], gameInvalid: "This quiz has no questions a game can use." });
    const err = await fail(
      create({ mode: "game", pacing: "teacher", game: { questionSeconds: 20, showLeaderboard: true, streakBonus: true, relay: null } }),
    );
    expect(err).toMatchObject({ _tag: "Conflict", message: "This quiz has no questions a game can use." });
    expect(state.inserted).toEqual([]);
  });

  test("the room password and networks are stored trimmed, and a blank password means none", async () => {
    const { run, state } = setup({ sessions: [] });
    await run(create({ roomPassword: "  tiger ", ipAllowlist: [" 10.0.4.0/24 ", "  "] }));
    expect(state.inserted[0]).toMatchObject({ roomPassword: "tiger", ipAllowlist: ["10.0.4.0/24"] });
    await run(create({ roomPassword: "   " }));
    expect(state.inserted[1]).toMatchObject({ roomPassword: null });
  });

  test("only exam sessions keep exam settings: a quiz sent with exam settings stores none", async () => {
    const quiz = setup({ sessions: [] });
    await quiz.run(create({ exam }));
    expect(quiz.state.inserted[0]).toMatchObject({ exam: null });
  });

  const invalid: [string, Partial<SessionSettingsFields>][] = [
    ["a close time before the open time", { opensAt: hoursFromNow(2).toISOString(), closesAt: hoursFromNow(1).toISOString() }],
    ["a date that isn't a date", { opensAt: "tomorrow-ish" }],
    ["a time limit under a minute", { timeLimitMinutes: 0 }],
    ["no attempts at all", { attemptsAllowed: 0 }],
    ["a question time without one question at a time", { questionTimeLimitSeconds: 30 }],
    ["a question time under five seconds", { oneQuestionAtATime: true, questionTimeLimitSeconds: 3 }],
    ["limits on going back without one question at a time", { navigation: "forward_only" }],
    ["more marks than the maximum", { maxMarked: 501 }],
    ["a mastery session without mastery settings", { mode: "mastery" }],
    ["an exam with its locked settings off", { mode: "exam", exam }],
    ["a late-join cutoff under a minute", { lateJoinMinutes: 0 }],
    ["a room password that is too long", { roomPassword: "x".repeat(65) }],
    ["a network that isn't an address", { ipAllowlist: ["not-an-ip"] }],
    ["guests in a quiz", { allowGuests: true }],
  ];
  for (const [name, over] of invalid)
    test(`refuses ${name} with a Conflict and stores nothing`, async () => {
      const { fail, state } = setup({ sessions: [] });
      expect((await fail(create(over)))._tag).toBe("Conflict");
      expect(state.inserted).toEqual([]);
    });
});

describe("SessionLifecycle.update", () => {
  test("someone else's session doesn't exist for you", async () => {
    const { fail, state } = setup();
    expect((await fail(update("sess1", {}, "class1", intruder)))._tag).toBe("NotFound");
    expect(state.updates).toEqual([]);
  });

  test("an ended session can't be changed", async () => {
    const { fail, state } = setup({ sessions: [sessionItem({ status: "ended", endedAt: hoursFromNow(-1) })] });
    expect(await fail(update("sess1"))).toMatchObject({ _tag: "Conflict", message: "This session has ended." });
    expect(state.updates).toEqual([]);
  });

  test("a session that hasn't opened can change everything, including its class, and the roster follows", async () => {
    const { run, state } = setup({ sessions: [sessionItem({ status: "scheduled", startedAt: null })], classes: ["class1", "class2"] });
    const changed = await run(update("sess1", { mode: "mastery", mastery: { retryLimit: 3, targetPercent: null, showCorrectAnswer: false }, attemptsAllowed: 5 }, "class2"));
    expect(changed.mode).toBe("mastery");
    expect(changed.attemptsAllowed).toBe(5);
    expect(changed.classId).toBe("class2");
    expect(state.syncs).toEqual([{ sessionId: "sess1", classId: "class2", replace: true }]);
  });

  test("once it is running the mode, class, paper rules and anti-cheat settings stay as they were", async () => {
    const running = sessionItem({ mode: "quiz", classId: "class1", oneQuestionAtATime: false, navigation: "free", maxMarked: 3 });
    const { run, state } = setup({ sessions: [running], classes: ["class1", "class2"] });
    const changed = await run(
      update(
        "sess1",
        { mode: "mastery", mastery: { retryLimit: 2, targetPercent: null, showCorrectAnswer: true }, oneQuestionAtATime: true, maxMarked: 0, attemptsAllowed: 4, timeLimitMinutes: 30 },
        "class2",
      ),
    );
    expect(changed).toMatchObject({ mode: "quiz", classId: "class1", oneQuestionAtATime: false, maxMarked: 3, mastery: null });
    // What may change while it runs does.
    expect(changed).toMatchObject({ attemptsAllowed: 4, timeLimitMinutes: 30 });
    expect(state.syncs).toEqual([{ sessionId: "sess1", classId: "class1", replace: false }]);
  });

  test("a bad setting is refused and nothing is written", async () => {
    const { fail, state } = setup();
    expect((await fail(update("sess1", { timeLimitMinutes: 0 })))._tag).toBe("Conflict");
    expect(state.updates).toEqual([]);
  });

  test("moving to a class that isn't yours is NotFound", async () => {
    const { fail, state } = setup({ sessions: [sessionItem({ status: "scheduled", startedAt: null })] });
    expect((await fail(update("sess1", {}, "theirs")))._tag).toBe("NotFound");
    expect(state.updates).toEqual([]);
  });

  test("a game session tells the running game about its new settings", async () => {
    const { run, state } = setup({ sessions: [sessionItem({ mode: "game", status: "scheduled", pacing: "teacher", startedAt: null })] });
    await run(update("sess1", { mode: "game", pacing: "teacher", game: { questionSeconds: 30, showLeaderboard: true, streakBonus: false, relay: null } }));
    expect(state.game).toContain("applySettings:sess1");
  });
});

describe("SessionLifecycle.start, end, remove and releaseResults", () => {
  const lifecycle = <A, E>(f: (l: SessionLifecycle["Service"]) => Effect.Effect<A, E>) =>
    Effect.gen(function* () { return yield* f(yield* SessionLifecycle); });

  test("starting opens a scheduled session now and tells the screens watching", async () => {
    const { run, state } = setup({ sessions: [sessionItem({ status: "scheduled", startedAt: null, opensAt: hoursFromNow(5) })] });
    const session = await run(lifecycle((l) => l.start(teacher, "sess1")));
    expect(session.status).toBe("running");
    const set = state.updates[0]!.set;
    expect(set.status).toBe("running");
    // Opening early moves the opening time to now rather than keeping the future one.
    expect((set.opensAt as Date).getTime()).toBeLessThanOrEqual(Date.now());
    expect(state.sessionChanged).toEqual(["sess1"]);
  });

  test("starting keeps an opening time that already passed and the first start time", async () => {
    const opensAt = hoursFromNow(-2);
    const startedAt = hoursFromNow(-1);
    const { run, state } = setup({ sessions: [sessionItem({ status: "scheduled", opensAt, startedAt })] });
    await run(lifecycle((l) => l.start(teacher, "sess1")));
    expect(state.updates[0]!.set).toMatchObject({ opensAt, startedAt });
  });

  test("an ended session can't be started again, and a game starts from its presenter screen", async () => {
    const ended = setup({ sessions: [sessionItem({ status: "ended" })] });
    expect((await ended.fail(lifecycle((l) => l.start(teacher, "sess1"))))._tag).toBe("Conflict");
    const game = setup({ sessions: [sessionItem({ mode: "game", status: "scheduled" })] });
    expect(await game.fail(lifecycle((l) => l.start(teacher, "sess1")))).toMatchObject({ _tag: "Conflict" });
    expect([...ended.state.updates, ...game.state.updates]).toEqual([]);
  });

  test("only the owner can start, end, remove or release", async () => {
    const { fail, state } = setup();
    const actions: Effect.Effect<unknown, NotFound | Conflict, SessionLifecycle>[] = [
      lifecycle((l) => l.start(intruder, "sess1")),
      lifecycle((l) => l.end(intruder, "sess1")),
      lifecycle((l) => l.remove(intruder, "sess1")),
      lifecycle((l) => l.releaseResults(intruder, "sess1", true)),
    ];
    for (const action of actions) expect((await fail(action))._tag).toBe("NotFound");
    expect([state.updates, state.removed, state.ended, state.game]).toEqual([[], [], [], []]);
  });

  test("ending a quiz ends it and submits every attempt still in progress as ended with the session", async () => {
    const { run, state } = setup({
      attempts: [
        { ...sessionAttempt("a1") },
        { ...sessionAttempt("a2") },
        { ...sessionAttempt("done", { status: "graded" }) },
      ],
    });
    const session = await run(lifecycle((l) => l.end(teacher, "sess1")));
    expect(session.status).toBe("ended");
    expect(state.ended).toEqual(["sess1"]);
    expect(state.submitted).toEqual([
      { attemptId: "a1", auto: true, reason: "session_ended" },
      { attemptId: "a2", auto: true, reason: "session_ended" },
    ]);
    expect(state.sessionChanged).toEqual(["sess1"]);
  });

  test("ending a game goes through the game so the screens show the standings", async () => {
    const { run, state } = setup({ sessions: [sessionItem({ mode: "game" })] });
    await run(lifecycle((l) => l.end(teacher, "sess1")));
    expect(state.game).toEqual(["end:sess1"]);
    expect(state.ended).toEqual([]);
  });

  test("removing deletes the session; releasing results flips the flag", async () => {
    const { run, state } = setup({ sessions: [sessionItem({ resultsRelease: "manual" })] });
    const released = await run(lifecycle((l) => l.releaseResults(teacher, "sess1", true)));
    expect(released.resultsReleased).toBe(true);
    const held = await run(lifecycle((l) => l.releaseResults(teacher, "sess1", false)));
    expect(held.resultsReleased).toBe(false);
    await run(lifecycle((l) => l.remove(teacher, "sess1")));
    expect(state.removed).toEqual(["sess1"]);
  });

  test("the detail view gives the owner the room password and networks, and others nothing", async () => {
    const row = sessionItem({ roomPassword: "tiger", ipAllowlist: ["10.0.0.0/8"] });
    const { run, fail } = setup({ sessions: [row], roster: ["s1", "s2"] });
    const detail = await run(lifecycle((l) => l.get(teacher, "sess1")));
    expect(detail).toMatchObject({ roomPassword: "tiger", ipAllowlist: ["10.0.0.0/8"], studentIds: ["s1", "s2"] });
    // The session itself only says that a password is needed.
    expect(detail.session.roomPasswordRequired).toBe(true);
    expect(JSON.stringify(detail.session)).not.toContain("tiger");
    expect((await fail(lifecycle((l) => l.get(intruder, "sess1"))))._tag).toBe("NotFound");
  });

  test("the list shows each session's status as the clock sees it, not as stored", async () => {
    const stale = sessionItem({ status: "running", closesAt: hoursFromNow(-1) });
    const { run } = setup({ sessions: [stale] });
    const [item] = await run(lifecycle((l) => l.list(teacher, {})));
    expect(item!.session.status).toBe("ended");
    expect(item).toMatchObject({ studentCount: 3, submittedCount: 1 });
  });
});

const sessionAttempt = (id: string, over: Partial<AttemptItem> = {}) => attemptItem({ id, sessionId: "sess1", ...over });

describe("SessionLifecycle across organizations", () => {
  const lifecycle = <A, E>(f: (l: SessionLifecycle["Service"]) => Effect.Effect<A, E>) =>
    Effect.gen(function* () { return yield* f(yield* SessionLifecycle); });

  test("a session of another organization is NotFound for the teacher working in a different one", async () => {
    const { fail, state } = setup();
    const actions: Effect.Effect<unknown, NotFound | Conflict, SessionLifecycle>[] = [
      lifecycle((l) => l.get(otherOrganization, "sess1")),
      lifecycle((l) => l.start(otherOrganization, "sess1")),
      lifecycle((l) => l.end(otherOrganization, "sess1")),
      lifecycle((l) => l.remove(otherOrganization, "sess1")),
      lifecycle((l) => l.releaseResults(otherOrganization, "sess1", true)),
      update("sess1", {}, "class1", otherOrganization),
    ];
    for (const action of actions) expect((await fail(action))._tag).toBe("NotFound");
    expect([...state.updates, ...state.removed, ...state.ended]).toEqual([]);
  });

  test("a quiz or a class of another organization can't be used to create a session", async () => {
    const { fail, state } = setup();
    expect((await fail(create({}, {}, otherOrganization)))._tag).toBe("NotFound");
    expect(state.inserted).toEqual([]);
  });
});
