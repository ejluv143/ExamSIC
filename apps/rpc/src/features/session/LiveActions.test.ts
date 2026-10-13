import { describe, expect, test } from "bun:test";
import { harness } from "../../testing/config.ts";
import { attemptItem, sessionItem } from "../../testing/session-rows.ts";
import { sessionWorld, type SessionWorldOptions } from "../../testing/session-world.ts";
import { SessionLiveActions } from "./LiveActions.ts";

const setup = (options: SessionWorldOptions = {}) => {
  const world = sessionWorld(options);
  return { ...world, ...harness(world.layer) };
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const actions = SessionLiveActions;
const open = (over: Parameters<typeof attemptItem>[0] = {}) => attemptItem({ id: "att1", sessionId: "sess1", ...over });

describe("SessionLiveActions.pause and resume", () => {
  test("pausing stops a running session, records it and tells the screens", async () => {
    const { run, state } = setup();
    const session = await run(actions.use((a) => a.pause("teacher1", "sess1")));
    expect(session.pausedAt).not.toBeNull();
    expect(state.updates[0]!.set.pausedAt).toBeInstanceOf(Date);
    expect(state.incidents).toEqual([{ sessionId: "sess1", attemptId: null, actorId: "teacher1", kind: "pause" }]);
    expect(state.sessionChanged).toEqual(["sess1"]);
  });

  test("a session that isn't running or is already paused can't be paused", async () => {
    const scheduled = setup({ sessions: [sessionItem({ status: "scheduled", startedAt: null })] });
    expect(await scheduled.fail(actions.use((a) => a.pause("teacher1", "sess1")))).toMatchObject({ _tag: "Conflict", message: "The session isn't running." });
    const paused = setup({ sessions: [sessionItem({ pausedAt: minutesAgo(1) })] });
    expect(await paused.fail(actions.use((a) => a.pause("teacher1", "sess1")))).toMatchObject({ _tag: "Conflict", message: "The session is already paused." });
    expect([...scheduled.state.updates, ...paused.state.updates, ...scheduled.state.incidents]).toEqual([]);
  });

  test("resuming gives every deadline back the time that was paused, and records how long it was", async () => {
    const { run, state } = setup({ sessions: [sessionItem({ pausedAt: minutesAgo(5) })] });
    const session = await run(actions.use((a) => a.resume("teacher1", "sess1")));
    expect(state.shifts).toHaveLength(1);
    expect(state.shifts[0]).toMatchObject({ sessionId: "sess1", shiftQuestions: true, set: { pausedAt: null } });
    expect(Math.abs(state.shifts[0]!.ms - 5 * 60_000)).toBeLessThan(2000);
    expect(state.incidents[0]).toMatchObject({ kind: "resume", seconds: 300 });
    expect(session.status).toBe("running");
  });

  test("a session that isn't paused can't be resumed", async () => {
    const { fail, state } = setup();
    expect((await fail(actions.use((a) => a.resume("teacher1", "sess1"))))._tag).toBe("Conflict");
    expect(state.shifts).toEqual([]);
  });

  test("only the owner may pause", async () => {
    const { fail, state } = setup();
    expect((await fail(actions.use((a) => a.pause("intruder", "sess1"))))._tag).toBe("NotFound");
    expect(state.updates).toEqual([]);
  });
});

describe("SessionLiveActions.addTime", () => {
  test("time for everyone moves every deadline of the session", async () => {
    const { run, state } = setup();
    await run(actions.use((a) => a.addTime("teacher1", { sessionId: "sess1", seconds: 120 })));
    expect(state.shifts).toEqual([{ sessionId: "sess1", ms: 120_000, shiftQuestions: false, set: {} }]);
    expect(state.incidents[0]).toMatchObject({ kind: "add_time", attemptId: null, seconds: 120 });
    expect(state.sessionChanged).toEqual(["sess1"]);
  });

  test("time for one student adds to their own extra time and tells their page", async () => {
    const { run, state } = setup({ attempts: [open({ extraMs: 60_000 })] });
    await run(actions.use((a) => a.addTime("teacher1", { sessionId: "sess1", attemptId: "att1", seconds: 90 })));
    expect(state.attemptUpdates).toEqual([{ attemptId: "att1", set: { extraMs: 150_000 } }]);
    expect(state.shifts).toEqual([]);
    expect(state.attemptChanges).toEqual([{ attemptId: "att1", state: true }]);
  });

  test("time can't be added to a student who already submitted, or an attempt of another session", async () => {
    const submitted = setup({ attempts: [open({ status: "graded" })] });
    expect((await submitted.fail(actions.use((a) => a.addTime("teacher1", { sessionId: "sess1", attemptId: "att1", seconds: 60 }))))._tag).toBe("Conflict");
    const other = setup({
      sessions: [sessionItem(), sessionItem({ id: "sess2" })],
      attempts: [open({ sessionId: "sess2" })],
    });
    expect((await other.fail(actions.use((a) => a.addTime("teacher1", { sessionId: "sess1", attemptId: "att1", seconds: 60 }))))._tag).toBe("NotFound");
    expect([...submitted.state.attemptUpdates, ...other.state.attemptUpdates]).toEqual([]);
  });

  test("time can only be added to a session that is running", async () => {
    const { fail, state } = setup({ sessions: [sessionItem({ status: "ended" })] });
    expect((await fail(actions.use((a) => a.addTime("teacher1", { sessionId: "sess1", seconds: 60 }))))._tag).toBe("Conflict");
    expect(state.shifts).toEqual([]);
  });
});

describe("SessionLiveActions on one student's attempt", () => {
  test("a warning reaches the student and is recorded against them", async () => {
    const { run, state } = setup({ attempts: [open()] });
    await run(actions.use((a) => a.warn("teacher1", "att1", "Eyes on your own screen")));
    expect(state.warnings).toEqual([{ attemptId: "att1", message: "Eyes on your own screen" }]);
    expect(state.incidents[0]).toMatchObject({ kind: "warn", attemptId: "att1", sessionId: "sess1", message: "Eyes on your own screen" });
  });

  test("locking and unlocking change the attempt, are recorded as such, and tell the student's page", async () => {
    const { run, state } = setup({ attempts: [open()] });
    await run(actions.use((a) => a.setLocked("teacher1", "att1", true)));
    await run(actions.use((a) => a.setLocked("teacher1", "att1", false)));
    expect(state.attemptUpdates.map((u) => u.set)).toEqual([{ locked: true }, { locked: false }]);
    expect(state.incidents.map((i) => i.kind)).toEqual(["lock", "unlock"]);
    expect(state.attemptChanges).toEqual([
      { attemptId: "att1", state: true },
      { attemptId: "att1", state: true },
    ]);
  });

  test("forcing a submit records the action first and submits as the teacher's doing", async () => {
    const { run, state } = setup({ attempts: [open()] });
    await run(actions.use((a) => a.forceSubmit("teacher1", "att1")));
    expect(state.incidents[0]).toMatchObject({ kind: "force_submit", attemptId: "att1" });
    expect(state.submitted).toEqual([{ attemptId: "att1", auto: true, reason: "teacher" }]);
  });

  test("a student who already submitted can't be warned, locked or force-submitted", async () => {
    const { fail, state } = setup({ attempts: [open({ status: "graded", submittedAt: minutesAgo(1) })] });
    const refusals = await Promise.all([
      fail(actions.use((a) => a.warn("teacher1", "att1", "hey"))),
      fail(actions.use((a) => a.setLocked("teacher1", "att1", true))),
      fail(actions.use((a) => a.forceSubmit("teacher1", "att1"))),
    ]);
    expect(refusals.map((r) => r._tag)).toEqual(["Conflict", "Conflict", "Conflict"]);
    expect([state.warnings, state.attemptUpdates, state.incidents, state.submitted]).toEqual([[], [], [], []]);
  });

  test("an attempt of another teacher's session doesn't exist for you", async () => {
    const { fail, state } = setup({ attempts: [open()] });
    const refusals = await Promise.all([
      fail(actions.use((a) => a.warn("intruder", "att1", "hey"))),
      fail(actions.use((a) => a.setLocked("intruder", "att1", true))),
      fail(actions.use((a) => a.forceSubmit("intruder", "att1"))),
    ]);
    expect(refusals.map((r) => r._tag)).toEqual(["NotFound", "NotFound", "NotFound"]);
    expect([state.warnings, state.attemptUpdates, state.incidents, state.submitted]).toEqual([[], [], [], []]);
  });
});
