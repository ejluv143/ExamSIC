import { describe, expect, test } from "bun:test";
import { harness } from "../../testing/config.ts";
import { attemptItem, sessionItem } from "../../testing/session-rows.ts";
import { sessionWorld, type SessionWorldOptions } from "../../testing/session-world.ts";
import { SessionService } from "./Service.ts";

const setup = (options: SessionWorldOptions = {}) => {
  const world = sessionWorld(options);
  return { ...world, ...harness(world.layer) };
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const sweep = SessionService.use((s) => s.sweep);

describe("SessionService.sweep", () => {
  test("an attempt past its time limit and the grace is submitted by the server as time up", async () => {
    const { run, state } = setup({
      sessions: [sessionItem({ timeLimitMinutes: 10 })],
      attempts: [attemptItem({ id: "late", startedAt: minutesAgo(30) }), attemptItem({ id: "fine", studentId: "s2", startedAt: minutesAgo(5) })],
    });
    await run(sweep);
    expect(state.submitted).toEqual([{ attemptId: "late", auto: true, reason: "time_up" }]);
  });

  test("an attempt inside the one-minute grace is left alone", async () => {
    const { run, state } = setup({
      sessions: [sessionItem({ timeLimitMinutes: 10 })],
      attempts: [attemptItem({ id: "grace", startedAt: minutesAgo(10.5) })],
    });
    await run(sweep);
    expect(state.submitted).toEqual([]);
  });

  test("time the teacher added to an attempt moves its deadline", async () => {
    const { run, state } = setup({
      sessions: [sessionItem({ timeLimitMinutes: 10 })],
      attempts: [attemptItem({ id: "extended", startedAt: minutesAgo(30), extraMs: 30 * 60_000 })],
    });
    await run(sweep);
    expect(state.submitted).toEqual([]);
  });

  test("a session closed by its schedule submits whoever is still in it", async () => {
    const { run, state } = setup({
      sessions: [sessionItem({ closesAt: minutesAgo(5) })],
      attempts: [attemptItem({ id: "stuck", startedAt: minutesAgo(20) })],
    });
    await run(sweep);
    expect(state.submitted.map((s) => s.attemptId)).toEqual(["stuck"]);
  });

  test("an attempt in a session the teacher ended long ago is submitted, unless the teacher gave it more time", async () => {
    const ended = sessionItem({ status: "ended", endedAt: minutesAgo(10) });
    const { run, state } = setup({
      sessions: [ended],
      attempts: [
        attemptItem({ id: "stuck", startedAt: minutesAgo(40) }),
        attemptItem({ id: "extended", studentId: "s2", startedAt: minutesAgo(40), extraMs: 20 * 60_000 }),
      ],
    });
    await run(sweep);
    expect(state.submitted.map((s) => s.attemptId)).toEqual(["stuck"]);
  });

  test("a session without any limit never expires an attempt", async () => {
    const { run, state } = setup({ attempts: [attemptItem({ id: "slow", startedAt: minutesAgo(24 * 60) })] });
    await run(sweep);
    expect(state.submitted).toEqual([]);
  });

  test("sessions the schedule opened or ended are announced to the screens", async () => {
    const { run, state } = setup({ advanced: ["sess1", "sess2"] });
    await run(sweep);
    expect(state.sessionChanged).toEqual(["sess1", "sess2"]);
  });
});

describe("SessionService.endSession", () => {
  test("the session is marked ended before the attempts are submitted, each as ended by the session", async () => {
    const { run, state } = setup({ attempts: [attemptItem({ id: "a1" }), attemptItem({ id: "a2", studentId: "s2" }), attemptItem({ id: "done", studentId: "s3", status: "graded" })] });
    await run(SessionService.use((s) => s.endSession("sess1")));
    expect(state.ended).toEqual(["sess1"]);
    expect(state.submitted).toEqual([
      { attemptId: "a1", auto: true, reason: "session_ended" },
      { attemptId: "a2", auto: true, reason: "session_ended" },
    ]);
    expect(state.sessionChanged).toEqual(["sess1"]);
  });
});
