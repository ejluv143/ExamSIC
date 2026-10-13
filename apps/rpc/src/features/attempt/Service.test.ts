import { describe, expect, test } from "bun:test";
import type { AttemptItem, QuizSessionItem } from "../../database/schemas/index.ts";
import { Effect } from "effect";
import { attemptWorld, type WorldOptions } from "../../testing/attempt-world.ts";
import { harness } from "../../testing/config.ts";
import { answerItem, attemptItem, choiceQuestion, exam } from "../../testing/session-rows.ts";
import { AttemptService, type SubmitInput } from "./Service.ts";

const setup = (options: WorldOptions = {}) => {
  const world = attemptWorld(options);
  return { ...world, ...harness(world.layer) };
};

const submit = (input: Partial<SubmitInput> = {}) =>
  Effect.gen(function* () {
    return yield* (yield* AttemptService).submit({ attemptId: "open", auto: false, ...input });
  });

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const open = () => attemptItem({ id: "open", startedAt: minutesAgo(5) });

describe("AttemptService.submit", () => {
  test("an attempt that doesn't exist gives null and writes nothing", async () => {
    const { run, state } = setup();
    expect(await run(submit({ attemptId: "ghost" }))).toBeNull();
    expect(state.submits).toEqual([]);
  });

  test("auto-graded answers are scored, and an essay leaves the attempt waiting for the teacher", async () => {
    const { run, state } = setup({ attempts: [open()] });
    const done = await run(submit({ answers: { q1: "b", q2: "My essay" } }));
    expect(done).toMatchObject({ status: "needs_grading", score: { score: 2, max: 7, ungraded: 1 } });
    expect(state.submits).toHaveLength(1);
    expect(state.submits[0]!.status).toBe("needs_grading");
    expect(state.attempts[0]!.status).toBe("needs_grading");
  });

  test("a quiz with nothing for the teacher to grade is graded at once, and a wrong answer scores 0", async () => {
    const { run } = setup({ attempts: [open()], questions: [choiceQuestion("q1"), choiceQuestion("q3")] });
    const done = await run(submit({ answers: { q1: "b", q3: "a" } }));
    expect(done).toMatchObject({ status: "graded", score: { score: 2, max: 4, ungraded: 0 } });
  });

  test("the submitted answer wins over the autosaved one; a question not sent keeps what was autosaved", async () => {
    const { run } = setup({
      attempts: [open()],
      questions: [choiceQuestion("q1"), choiceQuestion("q3")],
      answers: [answerItem("open", "q1", { value: "a", autoScore: 0 }), answerItem("open", "q3", { value: "b", autoScore: 1 })],
    });
    const done = await run(submit({ answers: { q1: "b" } }));
    expect(done?.score).toMatchObject({ score: 4, max: 4, ungraded: 0 });
  });

  test("with no answers sent at all, what was autosaved is what counts", async () => {
    const { run } = setup({ attempts: [open()], answers: [answerItem("open", "q1", { value: "b", autoScore: 1 })] });
    const done = await run(submit());
    expect(done?.score?.score).toBe(2);
  });

  test("submitting twice stores one submission, and the second call returns the same result", async () => {
    const { run, state } = setup({ attempts: [open()], questions: [choiceQuestion("q1")] });
    const first = await run(submit({ answers: { q1: "b" } }));
    const second = await run(submit({ answers: { q1: "a" } }));
    expect(state.submits).toHaveLength(1);
    expect(second).toEqual(first);
    expect(second?.score?.score).toBe(2);
  });

  test("a mastery attempt keeps the answers graded one by one and ignores what the page sends", async () => {
    const { run } = setup({
      session: { mode: "mastery" },
      attempts: [open()],
      questions: [choiceQuestion("q1")],
      answers: [answerItem("open", "q1", { value: "b", autoScore: 1 })],
    });
    const done = await run(submit({ answers: { q1: "a" } }));
    expect(done?.score?.score).toBe(2);
  });

  test("one question at a time, only the question the student is on can still change", async () => {
    const { run, state } = setup({ session: { oneQuestionAtATime: true }, attempts: [open()], questions: [choiceQuestion("q1"), choiceQuestion("q3")] });
    await run(submit({ answers: { q1: "b", q3: "b" } }));
    const stored = Object.fromEntries(state.answers.map((a) => [a.questionId, a.value]));
    expect(stored).toEqual({ q1: "b", q3: null });
  });

  test("a submission by the server is logged as automatic and tells the student why it ended", async () => {
    const { run, state } = setup({ attempts: [open()] });
    await run(submit({ auto: true, reason: "teacher" }));
    expect(state.submits[0]!.events.map((e) => e.type)).toContain("auto_submitted");
    expect(state.changes.at(-1)).toMatchObject({ attemptId: "open", change: { ended: "teacher" } });
  });

  test("an automatic submission with no reason says time is up", async () => {
    const { run, state } = setup({ attempts: [open()] });
    await run(submit({ auto: true }));
    expect(state.changes.at(-1)?.change?.ended).toBe("time_up");
  });

  test("a student's own submit well after the time limit is logged as late", async () => {
    const { run, state } = setup({ session: { timeLimitMinutes: 10 }, attempts: [attemptItem({ id: "open", startedAt: minutesAgo(15) })] });
    await run(submit());
    expect(state.submits[0]!.events.map((e) => e.type)).toEqual(["late_submit"]);
  });

  test("a submit inside the limit's one minute of slack is not late", async () => {
    const { run, state } = setup({ session: { timeLimitMinutes: 10 }, attempts: [attemptItem({ id: "open", startedAt: minutesAgo(10.5) })] });
    await run(submit());
    expect(state.submits[0]!.events).toEqual([]);
  });

  test("an invalid event time is replaced with the submit time", async () => {
    const { run, state } = setup({ attempts: [open()] });
    await run(submit({ events: [{ type: "alt_tab", at: "not a date" }] }));
    const [event] = state.submits[0]!.events;
    expect(event!.type).toBe("alt_tab");
    expect(Number.isNaN(Date.parse(event!.at))).toBe(false);
  });
});

describe("AttemptService.requireOpen and requireWritable", () => {
  const check = (name: "requireOpen" | "requireWritable", attempt = open()) =>
    Effect.gen(function* () {
      const service = yield* AttemptService;
      return yield* service[name](attempt, world.state.session);
    });
  let world = setup();
  const use = (options: WorldOptions) => (world = setup(options));

  test("a submitted attempt is closed", async () => {
    use({});
    const err = await world.fail(check("requireOpen", attemptItem({ status: "graded" })));
    expect(err).toMatchObject({ _tag: "Conflict", message: "This attempt was already submitted." });
  });

  test("past the time limit plus the one-minute grace the attempt is closed, inside it still open", async () => {
    use({ session: { timeLimitMinutes: 10 } });
    await world.run(check("requireOpen", attemptItem({ startedAt: minutesAgo(10.5) })));
    const err = await world.fail(check("requireOpen", attemptItem({ startedAt: minutesAgo(12) })));
    expect(err).toMatchObject({ _tag: "Conflict", message: "Time is up." });
  });

  test("time the teacher added extends the deadline", async () => {
    use({ session: { timeLimitMinutes: 10 } });
    await world.run(check("requireOpen", attemptItem({ startedAt: minutesAgo(12), extraMs: 5 * 60_000 })));
  });

  test("while the session is paused the clock stopped at the pause, but nothing may change", async () => {
    use({ session: { timeLimitMinutes: 10, pausedAt: minutesAgo(8) } });
    const stale = attemptItem({ startedAt: minutesAgo(30) });
    // Paused 8 minutes ago, 22 minutes after the start: still past the deadline.
    expect((await world.fail(check("requireOpen", stale)))._tag).toBe("Conflict");
    const recent = attemptItem({ startedAt: minutesAgo(12) });
    await world.run(check("requireOpen", recent));
    const err = await world.fail(check("requireWritable", recent));
    expect(err.message).toContain("paused");
  });

  test("a locked attempt can be read but not changed", async () => {
    use({});
    const locked = attemptItem({ locked: true });
    await world.run(check("requireOpen", locked));
    expect((await world.fail(check("requireWritable", locked))).message).toContain("locked");
  });
});

describe("AttemptService.guard", () => {
  const guard = (
    attempt: AttemptItem,
    session: QuizSessionItem,
    deviceId: string | undefined,
    ip: string | null,
    options?: { required?: boolean; network?: boolean },
  ) =>
    Effect.gen(function* () {
      return yield* (yield* AttemptService).guard(attempt, session, deviceId, ip, options);
    });

  test("the attempt's own browser passes and its check-in is stored", async () => {
    const { run, state } = setup();
    await run(guard(open(), state.session, "dev1", null));
    expect(state.checkIns).toEqual([{ attemptId: "open" }]);
    expect(state.seen).toEqual(["open"]);
  });

  test("a missing device token passes unless the call requires one", async () => {
    const { run, fail, state } = setup();
    await run(guard(open(), state.session, undefined, null));
    expect((await fail(guard(open(), state.session, undefined, null, { required: true })))._tag).toBe("OpenElsewhere");
  });

  test("another browser is logged at most once a minute", async () => {
    const { fail, state } = setup();
    await fail(guard(open(), state.session, "other", null));
    await fail(guard(open(), state.session, "other", null));
    expect(state.events.filter((e) => e.type === "device_changed")).toHaveLength(1);
  });

  test("an attempt from before devices were tracked adopts the first browser that checks in", async () => {
    const { run, state } = setup();
    await run(guard(attemptItem({ id: "open", deviceId: null }), state.session, "first", null));
    expect(state.checkIns).toEqual([{ attemptId: "open", deviceId: "first" }]);
  });

  test("a change of network address is logged and remembered", async () => {
    const { run, state } = setup();
    await run(guard(attemptItem({ id: "open", ip: "10.0.0.1" }), state.session, "dev1", "10.0.0.2"));
    expect(state.events).toEqual([{ attemptId: "open", type: "network_changed" }]);
    expect(state.checkIns).toEqual([{ attemptId: "open", ip: "10.0.0.2" }]);
  });

  test("a long silence since the last check-in is logged as a disconnection", async () => {
    const { run, state } = setup();
    await run(guard(attemptItem({ id: "open", lastSeenAt: minutesAgo(5) }), state.session, "dev1", null));
    expect(state.events).toEqual([{ attemptId: "open", type: "disconnected" }]);
  });

  test("an address outside the allowlist is Forbidden, unless the call skips the network check", async () => {
    const { run, fail, state } = setup({ session: { ipAllowlist: ["10.0.4.0/24"] } });
    expect((await fail(guard(open(), state.session, "dev1", "192.168.0.1")))._tag).toBe("Forbidden");
    await run(guard(open(), state.session, "dev1", "192.168.0.1", { network: false }));
  });

  test("in an exam the same device away longer than the grace period needs approval; within it, it passes", async () => {
    const { run, fail, state } = setup({ session: { mode: "exam", exam: { ...exam, deviceGraceMinutes: 5 } } });
    await run(guard(attemptItem({ id: "open", lastSeenAt: minutesAgo(3) }), state.session, "dev1", null));
    const err = await fail(guard(attemptItem({ id: "open", lastSeenAt: minutesAgo(8) }), state.session, "dev1", null));
    expect(err._tag).toBe("DeviceApprovalRequired");
  });
});
