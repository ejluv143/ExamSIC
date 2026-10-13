import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { attemptWorld, type WorldOptions } from "../../testing/attempt-world.ts";
import { harness } from "../../testing/config.ts";
import { answerItem, attemptItem, choiceQuestion, essayQuestion } from "../../testing/session-rows.ts";
import { Saving } from "./Saving.ts";

const setup = (options: WorldOptions = {}) => {
  const world = attemptWorld(options);
  return { ...world, ...harness(world.layer) };
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const open = (over: Parameters<typeof attemptItem>[0] = {}) => attemptItem({ id: "open", startedAt: minutesAgo(5), ...over });

const save = (questionId: string, value: string | string[] | boolean | null, deviceId = "dev1", userId = "student1") =>
  Effect.gen(function* () {
    return yield* (yield* Saving).saveAnswer(userId, { attemptId: "open", deviceId, questionId, value }, {});
  });

const submit = (answers: Record<string, string> = {}, deviceId = "dev1", headers: Record<string, string> = {}) =>
  Effect.gen(function* () {
    return yield* (yield* Saving).submit("student1", { attemptId: "open", deviceId, answers, events: [], typing: {} }, headers);
  });

describe("Saving.saveAnswer", () => {
  test("an answer is stored cleaned and announced to the teacher watching", async () => {
    const { run, state } = setup({ attempts: [open()] });
    await run(save("q2", "x".repeat(6000)));
    expect(state.savedAnswers).toHaveLength(1);
    expect((state.savedAnswers[0]!.value as string).length).toBe(5000);
    expect(state.changes.at(-1)).toMatchObject({ attemptId: "open", change: { answer: { questionId: "q2" } } });
  });

  test("an answer in the wrong shape for its question is stored as no answer", async () => {
    const { run, state } = setup({ attempts: [open()] });
    await run(save("q1", ["a", "b"]));
    expect(state.savedAnswers).toEqual([{ questionId: "q1", value: null }]);
  });

  test("nothing can be saved once the attempt is submitted", async () => {
    const { fail, state } = setup({ attempts: [open({ status: "graded", submittedAt: minutesAgo(1) })] });
    const err = await fail(save("q1", "b"));
    expect(err).toMatchObject({ _tag: "Conflict", message: "This attempt was already submitted." });
    expect(state.savedAnswers).toEqual([]);
  });

  test("an answer after the time limit and its grace is refused; one inside the grace is taken", async () => {
    const limited = { timeLimitMinutes: 10 };
    const late = setup({ session: limited, attempts: [open({ startedAt: minutesAgo(12) })] });
    expect(await late.fail(save("q1", "b"))).toMatchObject({ _tag: "Conflict", message: "Time is up." });
    expect(late.state.savedAnswers).toEqual([]);

    const grace = setup({ session: limited, attempts: [open({ startedAt: minutesAgo(10.5) })] });
    await grace.run(save("q1", "b"));
    expect(grace.state.savedAnswers).toHaveLength(1);
  });

  test("a session closed by its schedule stops taking answers", async () => {
    const { fail } = setup({ session: { closesAt: minutesAgo(5) }, attempts: [open()] });
    expect(await fail(save("q1", "b"))).toMatchObject({ _tag: "Conflict" });
  });

  test("a paused session or a locked attempt refuses saves", async () => {
    const paused = setup({ session: { pausedAt: new Date() }, attempts: [open()] });
    expect((await paused.fail(save("q1", "b"))).message).toContain("paused");
    const locked = setup({ attempts: [open({ locked: true })] });
    expect((await locked.fail(save("q1", "b"))).message).toContain("locked");
    expect([...paused.state.savedAnswers, ...locked.state.savedAnswers]).toEqual([]);
  });

  test("the attempt of another student doesn't exist for you", async () => {
    const { fail } = setup({ attempts: [open()] });
    expect((await fail(save("q1", "b", "dev1", "student2")))._tag).toBe("NotFound");
  });

  test("a save from another browser is refused and not stored", async () => {
    const { fail, state } = setup({ attempts: [open()] });
    expect((await fail(save("q1", "b", "other")))._tag).toBe("OpenElsewhere");
    expect(state.savedAnswers).toEqual([]);
  });

  test("a question from another quiz is NotFound", async () => {
    const { fail } = setup({ attempts: [open()] });
    expect((await fail(save("elsewhere", "b")))._tag).toBe("NotFound");
  });

  test("mastery answers go through the mastery calls, not autosave", async () => {
    const { fail } = setup({ session: { mode: "mastery" }, attempts: [open()] });
    expect((await fail(save("q1", "b")))._tag).toBe("Conflict");
  });

  test("a game's answers only go through the game", async () => {
    const { fail } = setup({ session: { mode: "game" }, attempts: [open()] });
    expect((await fail(save("q1", "b")))._tag).toBe("PlayInGame");
  });

  test("one question at a time, only the question the student is on can be answered", async () => {
    const { run, fail, state } = setup({ session: { oneQuestionAtATime: true }, attempts: [open()] });
    const err = await fail(save("q2", "essay"));
    expect(err).toMatchObject({ _tag: "Conflict", message: "You can only answer the question you're on." });
    expect(state.savedAnswers).toEqual([]);
    await run(save("q1", "b"));
    expect(state.savedAnswers).toHaveLength(1);
  });

  test("one question at a time with a time per question: the question's time is enforced past its grace", async () => {
    const started = new Date(Date.now() - 60_000);
    const { fail, state } = setup({
      session: { oneQuestionAtATime: true, questionTimeLimitSeconds: 30 },
      attempts: [open({ questionStartedAt: started })],
    });
    // A minute on a 30-second question: the student was moved on, so the first question is no longer theirs.
    expect((await fail(save("q1", "b")))._tag).toBe("Conflict");
    expect(state.savedAnswers).toEqual([]);
  });
});

describe("Saving.submit", () => {
  test("submitting scores the paper and returns the result when results show immediately", async () => {
    const { run, state } = setup({ attempts: [open()] });
    const done = await run(submit({ q1: "b", q2: "an essay" }));
    expect(done).toEqual({ status: "needs_grading", result: { score: 2, max: 7, pendingEssays: 1 } });
    expect(state.submits).toHaveLength(1);
  });

  test("with results held for the teacher the student gets the status but no score", async () => {
    const { run, state } = setup({ session: { resultsRelease: "manual" }, attempts: [open()], questions: [choiceQuestion("q1")] });
    const done = await run(submit({ q1: "b" }));
    expect(done).toEqual({ status: "graded", result: null });
    expect(state.submits).toHaveLength(1);
  });

  test("results held until the session closes are shown once it ended", async () => {
    const { run } = setup({ session: { resultsRelease: "after_close", status: "ended", endedAt: new Date() }, attempts: [open()], questions: [choiceQuestion("q1")] });
    const done = await run(submit({ q1: "b" }));
    expect(done.result).toEqual({ score: 2, max: 2, pendingEssays: 0 });
  });

  test("a submit from another browser is refused and nothing is stored", async () => {
    const { fail, state } = setup({ attempts: [open()] });
    expect((await fail(submit({ q1: "b" }, "other")))._tag).toBe("OpenElsewhere");
    expect(state.submits).toEqual([]);
  });

  test("a locked attempt can't be submitted by the student", async () => {
    const { fail, state } = setup({ attempts: [open({ locked: true })] });
    expect((await fail(submit({ q1: "b" })))._tag).toBe("Conflict");
    expect(state.submits).toEqual([]);
  });

  test("handing in is allowed from outside the network allowlist", async () => {
    const { run, state } = setup({ session: { ipAllowlist: ["10.0.4.0/24"] }, attempts: [open({ ip: "10.0.4.9" })] });
    await run(submit({ q1: "b" }, "dev1", { "x-forwarded-for": "10.0.4.9" }));
    const outside = setup({ session: { ipAllowlist: ["10.0.4.0/24"] }, attempts: [open()] });
    await outside.run(submit({ q1: "b" }, "dev1", { "x-forwarded-for": "172.16.0.1" }));
    expect([state.submits.length, outside.state.submits.length]).toEqual([1, 1]);
  });

  test("an attempt that was already submitted comes back as it is, even from another browser or after time", async () => {
    const { run, state } = setup({
      session: { timeLimitMinutes: 10 },
      attempts: [open({ status: "graded", submittedAt: minutesAgo(30), startedAt: minutesAgo(60) })],
      questions: [choiceQuestion("q1")],
      answers: [answerItem("open", "q1", { value: "b", autoScore: 1 })],
    });
    const done = await run(submit({ q1: "a" }, "other"));
    expect(done).toEqual({ status: "graded", result: { score: 2, max: 2, pendingEssays: 0 } });
    expect(state.submits).toEqual([]);
  });

  test("a time-expired attempt can't be submitted by the student any more (the server submits it)", async () => {
    const { fail, state } = setup({ session: { timeLimitMinutes: 10 }, attempts: [open({ startedAt: minutesAgo(20) })] });
    expect(await fail(submit({ q1: "b" }))).toMatchObject({ _tag: "Conflict", message: "Time is up." });
    expect(state.submits).toEqual([]);
  });

  test("a student's attempt that doesn't exist is NotFound", async () => {
    const { fail } = setup();
    expect((await fail(submit()))._tag).toBe("NotFound");
  });
});

describe("Saving.recordEvents and heartbeat", () => {
  const record = (events: { type: "alt_tab" | "switched_app"; at: string }[], deviceId = "dev1") =>
    Effect.gen(function* () {
      return yield* (yield* Saving).recordEvents("student1", { attemptId: "open", deviceId, events }, {});
    });
  const beat = (deviceId = "dev1") =>
    Effect.gen(function* () {
      return yield* (yield* Saving).heartbeat("student1", { attemptId: "open", deviceId }, {});
    });

  test("events are stored and shown to the teacher", async () => {
    const { run, state } = setup({ attempts: [open()] });
    const at = new Date().toISOString();
    await run(record([{ type: "alt_tab", at }]));
    expect(state.batches).toEqual([[{ type: "alt_tab", at }]]);
    expect(state.changes.at(-1)?.change?.events).toEqual([{ type: "alt_tab", at }]);
  });

  test("a late flush after the submit is dropped without error", async () => {
    const { run, state } = setup({ attempts: [open({ status: "graded", submittedAt: minutesAgo(1) })] });
    await run(record([{ type: "alt_tab", at: new Date().toISOString() }]));
    expect(state.batches).toEqual([]);
    expect(state.checkIns).toEqual([]);
  });

  test("events from another browser are refused", async () => {
    const { fail, state } = setup({ attempts: [open()] });
    expect((await fail(record([{ type: "switched_app", at: new Date().toISOString() }], "other")))._tag).toBe("OpenElsewhere");
    expect(state.batches).toEqual([]);
  });

  test("an empty list stores nothing", async () => {
    const { run, state } = setup({ attempts: [open()] });
    await run(record([]));
    expect(state.batches).toEqual([]);
  });

  test("a heartbeat checks the attempt in; after the submit it does nothing; from another browser it is refused", async () => {
    const live = setup({ attempts: [open()] });
    await live.run(beat());
    expect(live.state.checkIns).toHaveLength(1);
    expect((await live.fail(beat("other")))._tag).toBe("OpenElsewhere");

    const done = setup({ attempts: [open({ status: "graded", submittedAt: minutesAgo(1) })] });
    await done.run(beat("other"));
    expect(done.state.checkIns).toEqual([]);
  });
});

describe("Saving.runSampleTests", () => {
  const run = (questionId: string, code = "print(1)") =>
    Effect.gen(function* () {
      return yield* (yield* Saving).runSampleTests("student1", { attemptId: "open", questionId, code });
    });

  test("only code questions have sample tests to run", async () => {
    const { fail } = setup({ attempts: [open()], questions: [choiceQuestion("q1"), essayQuestion("q2")] });
    expect(await fail(run("q1"))).toMatchObject({ _tag: "Conflict", message: "That isn't a code question." });
  });

  test("a submitted attempt can't run tests", async () => {
    const { fail } = setup({ attempts: [open({ status: "graded", submittedAt: minutesAgo(1) })] });
    expect((await fail(run("q1")))._tag).toBe("Conflict");
  });
});
