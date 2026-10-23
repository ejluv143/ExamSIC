import { describe, expect, test } from "bun:test";
import { noAccommodations, type Accommodations } from "@examinus/domain/accommodations";
import { harness } from "../../testing/config.ts";
import { attemptItem, sessionItem } from "../../testing/session-rows.ts";
import { teacher, intruder, otherOrganization, sessionWorld, type SessionWorldOptions } from "../../testing/session-world.ts";
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
    const session = await run(actions.use((a) => a.pause(teacher, "sess1")));
    expect(session.pausedAt).not.toBeNull();
    expect(state.updates[0]!.set.pausedAt).toBeInstanceOf(Date);
    expect(state.incidents).toEqual([{ sessionId: "sess1", attemptId: null, actorId: "teacher1", kind: "pause" }]);
    expect(state.sessionChanged).toEqual(["sess1"]);
  });

  test("a session that isn't running or is already paused can't be paused", async () => {
    const scheduled = setup({ sessions: [sessionItem({ status: "scheduled", startedAt: null })] });
    expect(await scheduled.fail(actions.use((a) => a.pause(teacher, "sess1")))).toMatchObject({ _tag: "Conflict", message: "The session isn't running." });
    const paused = setup({ sessions: [sessionItem({ pausedAt: minutesAgo(1) })] });
    expect(await paused.fail(actions.use((a) => a.pause(teacher, "sess1")))).toMatchObject({ _tag: "Conflict", message: "The session is already paused." });
    expect([...scheduled.state.updates, ...paused.state.updates, ...scheduled.state.incidents]).toEqual([]);
  });

  test("resuming gives every deadline back the time that was paused, and records how long it was", async () => {
    const { run, state } = setup({ sessions: [sessionItem({ pausedAt: minutesAgo(5) })] });
    const session = await run(actions.use((a) => a.resume(teacher, "sess1")));
    expect(state.shifts).toHaveLength(1);
    expect(state.shifts[0]).toMatchObject({ sessionId: "sess1", shiftQuestions: true, set: { pausedAt: null } });
    expect(Math.abs(state.shifts[0]!.ms - 5 * 60_000)).toBeLessThan(2000);
    expect(state.incidents[0]).toMatchObject({ kind: "resume", seconds: 300 });
    expect(session.status).toBe("running");
  });

  test("a session that isn't paused can't be resumed", async () => {
    const { fail, state } = setup();
    expect((await fail(actions.use((a) => a.resume(teacher, "sess1"))))._tag).toBe("Conflict");
    expect(state.shifts).toEqual([]);
  });

  test("only the owner may pause", async () => {
    const { fail, state } = setup();
    expect((await fail(actions.use((a) => a.pause(intruder, "sess1"))))._tag).toBe("NotFound");
    expect(state.updates).toEqual([]);
  });
});

describe("SessionLiveActions.addTime", () => {
  test("time for everyone moves every deadline of the session", async () => {
    const { run, state } = setup();
    await run(actions.use((a) => a.addTime(teacher, { sessionId: "sess1", seconds: 120 })));
    expect(state.shifts).toEqual([{ sessionId: "sess1", ms: 120_000, shiftQuestions: false, set: {} }]);
    expect(state.incidents[0]).toMatchObject({ kind: "add_time", attemptId: null, seconds: 120 });
    expect(state.sessionChanged).toEqual(["sess1"]);
  });

  test("time for one student adds to their own extra time and tells their page", async () => {
    const { run, state } = setup({ attempts: [open({ extraMs: 60_000 })] });
    await run(actions.use((a) => a.addTime(teacher, { sessionId: "sess1", attemptId: "att1", seconds: 90 })));
    expect(state.attemptUpdates).toEqual([{ attemptId: "att1", set: { extraMs: 150_000 } }]);
    expect(state.shifts).toEqual([]);
    expect(state.attemptChanges).toEqual([{ attemptId: "att1", state: true }]);
  });

  test("time can't be added to a student who already submitted, or an attempt of another session", async () => {
    const submitted = setup({ attempts: [open({ status: "graded" })] });
    expect((await submitted.fail(actions.use((a) => a.addTime(teacher, { sessionId: "sess1", attemptId: "att1", seconds: 60 }))))._tag).toBe("Conflict");
    const other = setup({
      sessions: [sessionItem(), sessionItem({ id: "sess2" })],
      attempts: [open({ sessionId: "sess2" })],
    });
    expect((await other.fail(actions.use((a) => a.addTime(teacher, { sessionId: "sess1", attemptId: "att1", seconds: 60 }))))._tag).toBe("NotFound");
    expect([...submitted.state.attemptUpdates, ...other.state.attemptUpdates]).toEqual([]);
  });

  test("time can only be added to a session that is running", async () => {
    const { fail, state } = setup({ sessions: [sessionItem({ status: "ended" })] });
    expect((await fail(actions.use((a) => a.addTime(teacher, { sessionId: "sess1", seconds: 60 }))))._tag).toBe("Conflict");
    expect(state.shifts).toEqual([]);
  });
});

describe("SessionLiveActions on one student's attempt", () => {
  test("a warning reaches the student and is recorded against them", async () => {
    const { run, state } = setup({ attempts: [open()] });
    await run(actions.use((a) => a.warn(teacher, "att1", "Eyes on your own screen")));
    expect(state.warnings).toEqual([{ attemptId: "att1", message: "Eyes on your own screen" }]);
    expect(state.incidents[0]).toMatchObject({ kind: "warn", attemptId: "att1", sessionId: "sess1", message: "Eyes on your own screen" });
  });

  test("locking and unlocking change the attempt, are recorded as such, and tell the student's page", async () => {
    const { run, state } = setup({ attempts: [open()] });
    await run(actions.use((a) => a.setLocked(teacher, "att1", true)));
    await run(actions.use((a) => a.setLocked(teacher, "att1", false)));
    expect(state.attemptUpdates.map((u) => u.set)).toEqual([{ locked: true }, { locked: false }]);
    expect(state.incidents.map((i) => i.kind)).toEqual(["lock", "unlock"]);
    expect(state.attemptChanges).toEqual([
      { attemptId: "att1", state: true },
      { attemptId: "att1", state: true },
    ]);
  });

  test("forcing a submit records the action first and submits as the teacher's doing", async () => {
    const { run, state } = setup({ attempts: [open()] });
    await run(actions.use((a) => a.forceSubmit(teacher, "att1")));
    expect(state.incidents[0]).toMatchObject({ kind: "force_submit", attemptId: "att1" });
    expect(state.submitted).toEqual([{ attemptId: "att1", auto: true, reason: "teacher" }]);
  });

  test("a student who already submitted can't be warned, locked or force-submitted", async () => {
    const { fail, state } = setup({ attempts: [open({ status: "graded", submittedAt: minutesAgo(1) })] });
    const refusals = await Promise.all([
      fail(actions.use((a) => a.warn(teacher, "att1", "hey"))),
      fail(actions.use((a) => a.setLocked(teacher, "att1", true))),
      fail(actions.use((a) => a.forceSubmit(teacher, "att1"))),
    ]);
    expect(refusals.map((r) => r._tag)).toEqual(["Conflict", "Conflict", "Conflict"]);
    expect([state.warnings, state.attemptUpdates, state.incidents, state.submitted]).toEqual([[], [], [], []]);
  });

  test("an attempt of another teacher's session doesn't exist for you", async () => {
    const { fail, state } = setup({ attempts: [open()] });
    const refusals = await Promise.all([
      fail(actions.use((a) => a.warn(intruder, "att1", "hey"))),
      fail(actions.use((a) => a.setLocked(intruder, "att1", true))),
      fail(actions.use((a) => a.forceSubmit(intruder, "att1"))),
    ]);
    expect(refusals.map((r) => r._tag)).toEqual(["NotFound", "NotFound", "NotFound"]);
    expect([state.warnings, state.attemptUpdates, state.incidents, state.submitted]).toEqual([[], [], [], []]);
  });
});

describe("SessionLiveActions across organizations", () => {
  test("a session or an attempt of another organization doesn't exist for the teacher working in a different one", async () => {
    const { fail, state } = setup({ attempts: [attemptItem({ id: "att1", sessionId: "sess1", status: "in_progress" })] });
    const results = await Promise.all([
      fail(actions.use((a) => a.pause(otherOrganization, "sess1"))),
      fail(actions.use((a) => a.addTime(otherOrganization, { sessionId: "sess1", seconds: 60 }))),
      fail(actions.use((a) => a.warn(otherOrganization, "att1", "hey"))),
      fail(actions.use((a) => a.forceSubmit(otherOrganization, "att1"))),
    ]);
    expect(results.map((e) => e._tag)).toEqual(["NotFound", "NotFound", "NotFound", "NotFound"]);
    expect([...state.updates, ...state.incidents, ...state.submitted]).toEqual([]);
  });
});

describe("SessionLiveActions.setAccommodations", () => {
  const given: Accommodations = { ...noAccommodations, timeMultiplier: 1.5, extraMinutes: 10, exempt: ["fullscreen"], note: "Dyslexia" };
  const input = { sessionId: "sess1", studentId: "roster-student1", accommodations: given };

  test("sets them for a student on the roster and refreshes the teacher's screens", async () => {
    const { run, state } = setup({ roster: ["roster-student1", "roster-student2"] });
    await run(actions.use((a) => a.setAccommodations(teacher, input)));
    expect(state.accommodations.get("roster-student1")).toEqual(given);
    expect(state.accommodations.has("roster-student2")).toBe(false);
    expect(state.sessionChanged).toEqual(["sess1"]);
    expect(state.attemptChanges).toEqual([]);
  });

  test("a student taking the session gets the new deadline", async () => {
    const { run, state } = setup({ roster: ["roster-student1"], attempts: [open()] });
    await run(actions.use((a) => a.setAccommodations(teacher, input)));
    expect(state.attemptChanges).toEqual([{ attemptId: "att1", state: true }]);
  });

  test("clearing, or saving nothing at all, removes them", async () => {
    const { run, state } = setup({ roster: ["roster-student1"], accommodations: { "roster-student1": given } });
    await run(actions.use((a) => a.setAccommodations(teacher, { ...input, accommodations: null })));
    expect(state.accommodations.has("roster-student1")).toBe(false);
    await run(actions.use((a) => a.setAccommodations(teacher, { ...input, accommodations: noAccommodations })));
    expect(state.accommodations.has("roster-student1")).toBe(false);
  });

  test("an ended session can't change them", async () => {
    const { fail, state } = setup({ roster: ["roster-student1"], sessions: [sessionItem({ status: "ended", endedAt: minutesAgo(1) })] });
    expect((await fail(actions.use((a) => a.setAccommodations(teacher, input))))._tag).toBe("Conflict");
    expect(state.accommodations.size).toBe(0);
  });

  test("only the owner may set them", async () => {
    const { fail, state } = setup({ roster: ["roster-student1"] });
    expect((await fail(actions.use((a) => a.setAccommodations(intruder, input))))._tag).toBe("NotFound");
    expect((await fail(actions.use((a) => a.setAccommodations(otherOrganization, input))))._tag).toBe("NotFound");
    expect(state.accommodations.size).toBe(0);
  });

  test("a student who isn't on the roster is NotFound", async () => {
    const { fail, state } = setup({ roster: ["roster-student1"] });
    expect((await fail(actions.use((a) => a.setAccommodations(teacher, { ...input, studentId: "roster-stranger" }))))._tag).toBe("NotFound");
    expect(state.accommodations.size).toBe(0);
    expect(state.sessionChanged).toEqual([]);
  });
});
