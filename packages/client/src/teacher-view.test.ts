import { describe, expect, test } from "bun:test";
import type { Incident, LiveStudent, LiveTeacherEvent } from "@examinus/contract/live";
import type { Session } from "@examinus/domain/quiz";
import {
  attemptWatch,
  deviceChangeFound,
  dismissToast,
  freshAlertMs,
  isWaiting,
  maxToasts,
  placeholderStudent,
  reduce,
  startTeacherView,
  studentRow,
  watchFor,
  type TeacherView,
} from "./teacher-view.ts";

const now = Date.parse("2026-01-01T10:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

const session = (mode: "exam" | "quiz" = "exam", trackFocus = false) =>
  ({ id: "s1", mode, integrity: { trackFocus, requireFullscreen: false } }) as unknown as Session;

const student = (id: string, attemptId: string | null, over: Partial<LiveStudent> = {}): LiveStudent => ({
  ...placeholderStudent(id, 3),
  attemptId,
  status: attemptId ? "in_progress" : null,
  ...over,
});

const incident = (id: string, attemptId: string | null, kind: string, at: string) =>
  ({ id, sessionId: "s1", attemptId, kind, at }) as unknown as Incident;

const run = (view: TeacherView, ...events: LiveTeacherEvent[]) => events.reduce((v, e) => reduce(v, e, now).view, view);

const snapshot = (students: LiveStudent[], incidents: Incident[] = []): LiveTeacherEvent => ({
  _tag: "snapshot",
  session: session(),
  students,
  incidents,
});

const integrity = (attemptId: string, ...events: { type: string; at: string }[]) =>
  ({ _tag: "integrity", attemptId, events }) as unknown as LiveTeacherEvent;

const exam = () => startTeacherView(watchFor(session("exam")));

describe("watchFor", () => {
  test("exams and anti-cheating quizzes are monitored; a plain quiz is not", () => {
    expect(watchFor(session("exam"))).toEqual({ exam: true, monitored: true });
    expect(watchFor(session("quiz", true))).toEqual({ exam: false, monitored: true });
    expect(watchFor(session("quiz"))).toEqual({ exam: false, monitored: false });
  });
});

describe("snapshot then student events", () => {
  test("a snapshot replaces rows and clears answers; a student event replaces one row", () => {
    let view = run(exam(), snapshot([student("a", "t1"), student("b", null)]));
    view = run(view, { _tag: "answer", attemptId: "t1", questionId: "q1", value: "x", at: "" } as LiveTeacherEvent);
    expect(view.values.t1).toEqual({ q1: "x" });

    view = run(view, { _tag: "student", student: student("b", "t2") });
    expect(Object.keys(view.rows).sort()).toEqual(["a", "b"]);
    expect(view.rows.b?.attemptId).toBe("t2");
    expect(view.pulses).toEqual({ t1: 2, t2: 1 });

    view = run(view, snapshot([student("a", "t1")]));
    expect(Object.keys(view.rows)).toEqual(["a"]);
    expect(view.values).toEqual({});
    expect(view.changed).toEqual({});
  });

  test("a student without a row reads as a placeholder", () => {
    const view = run(exam(), snapshot([student("a", "t1")]));
    expect(studentRow(view, "z", 7)).toEqual(placeholderStudent("z", 7));
    expect(studentRow(view, "a", 7).attemptId).toBe("t1");
  });

  test("the session event replaces the session without touching rows", () => {
    const view = run(run(exam(), snapshot([student("a", "t1")])), { _tag: "session", session: { ...session(), id: "s2" } });
    expect(view.session?.id).toBe("s2");
    expect(Object.keys(view.rows)).toEqual(["a"]);
  });
});

describe("answer events", () => {
  const answer = (attemptId: string, questionId: string, value: string) =>
    ({ _tag: "answer", attemptId, questionId, value, at: "" }) as unknown as LiveTeacherEvent;

  test("keep the latest value per question and remember the question changed last", () => {
    const view = run(exam(), answer("t1", "q1", "a"), answer("t1", "q2", "b"), answer("t1", "q1", "c"), answer("t2", "q9", "z"));
    expect(view.values.t1).toEqual({ q1: "c", q2: "b" });
    expect(view.changed).toEqual({ t1: "q1", t2: "q9" });
    expect(attemptWatch(view, "t1")).toEqual({ values: { q1: "c", q2: "b" }, justChanged: "q1", pulse: 3, waiting: false });
  });

  test("an attempt with no events has an empty watch", () => {
    expect(attemptWatch(exam(), null)).toEqual({ values: undefined, justChanged: undefined, pulse: 0, waiting: false });
  });
});

describe("approval and waiting", () => {
  test("waiting once a device changed and nobody approved", () => {
    const view = run(exam(), integrity("t1", { type: "device_changed", at: ago(1000) }));
    expect(isWaiting(view, "t1")).toBe(true);
    expect(isWaiting(view, null)).toBe(false);
  });

  test("an approval newer than the device change clears waiting; a newer device change waits again", () => {
    let view = run(exam(), integrity("t1", { type: "device_changed", at: ago(5000) }));
    view = run(view, { _tag: "incident", incident: incident("i1", "t1", "device_switch_allowed", ago(4000)) });
    expect(isWaiting(view, "t1")).toBe(false);

    view = run(view, integrity("t1", { type: "device_changed", at: ago(1000) }));
    expect(isWaiting(view, "t1")).toBe(true);

    view = run(view, { _tag: "incident", incident: incident("i2", "t1", "allow_back_in", ago(500)) });
    expect(isWaiting(view, "t1")).toBe(false);
  });

  test("an approval at the same instant as the device change counts as approved", () => {
    const at = ago(1000);
    const view = run(
      exam(),
      integrity("t1", { type: "device_changed", at }),
      { _tag: "incident", incident: incident("i1", "t1", "allow_back_in", at) },
    );
    expect(isWaiting(view, "t1")).toBe(false);
  });

  test("other incidents don't approve", () => {
    const view = run(
      exam(),
      integrity("t1", { type: "device_changed", at: ago(5000) }),
      { _tag: "incident", incident: incident("i1", "t1", "warn", ago(1000)) },
    );
    expect(isWaiting(view, "t1")).toBe(true);
  });

  test("a session-wide incident is logged once and approves nobody", () => {
    const event: LiveTeacherEvent = { _tag: "incident", incident: incident("i1", null, "pause", ago(1000)) };
    const view = run(exam(), event, event);
    expect(view.incidents).toHaveLength(1);
    expect(view.approvedAt).toEqual({});
    expect(view.pulses).toEqual({});
  });

  test("a snapshot takes the latest approval per attempt from its incidents", () => {
    const view = run(
      exam(),
      snapshot(
        [student("a", "t1")],
        [
          incident("i1", "t1", "allow_back_in", ago(9000)),
          incident("i2", "t1", "device_switch_allowed", ago(3000)),
          incident("i3", "t1", "warn", ago(100)),
        ],
      ),
    );
    expect(view.approvedAt).toEqual({ t1: ago(3000) });
  });

  test("a snapshot asks for the device change of open attempts with alerts, and the answer makes them wait", () => {
    const step = reduce(
      exam(),
      snapshot([
        student("a", "t1", { alerts: 2 }),
        student("b", "t2", { alerts: 0 }),
        student("c", "t3", { alerts: 1, submittedAt: ago(10) }),
        student("d", null),
      ]),
      now,
    );
    expect(step.requests).toEqual([{ attemptId: "t1" }]);

    const waiting = deviceChangeFound(step.view, "t1", ago(2000));
    expect(isWaiting(waiting, "t1")).toBe(true);
    // An attempt that never changed device stays as it was.
    expect(deviceChangeFound(step.view, "t1", undefined)).toBe(step.view);
  });

  test("a device change found after an approval doesn't wait if it is older", () => {
    const step = reduce(
      exam(),
      snapshot([student("a", "t1", { alerts: 1 })], [incident("i1", "t1", "allow_back_in", ago(1000))]),
      now,
    );
    expect(isWaiting(deviceChangeFound(step.view, "t1", ago(5000)), "t1")).toBe(false);
  });

  test("outside exams a snapshot asks for nothing and approvals aren't read", () => {
    const view = startTeacherView(watchFor(session("quiz", true)));
    const step = reduce(view, snapshot([student("a", "t1", { alerts: 3 })], [incident("i1", "t1", "allow_back_in", ago(1))]), now);
    expect(step.requests).toEqual([]);
    expect(step.view.approvedAt).toEqual({});
  });
});

describe("alerts", () => {
  test("alerts older than the fresh window are neither toasts nor a wait", () => {
    const view = run(exam(), integrity("t1", { type: "device_changed", at: ago(freshAlertMs + 1) }));
    expect(view.toasts).toEqual([]);
    expect(isWaiting(view, "t1")).toBe(false);
    // The event still counts for an open panel.
    expect(view.pulses.t1).toBe(1);
  });

  test("a fresh alert is a toast; only some types interrupt", () => {
    const view = run(
      exam(),
      integrity("t1", { type: "left_page", at: ago(1000) }, { type: "copy_blocked", at: ago(900) }),
    );
    expect(view.toasts).toEqual([{ id: `t1-left_page-${ago(1000)}`, attemptId: "t1", type: "left_page", at: ago(1000) }]);
  });

  test("a replayed alert is not shown twice", () => {
    const event = integrity("t1", { type: "left_page", at: ago(1000) }, { type: "left_page", at: ago(1000) });
    const view = run(exam(), event, event);
    expect(view.toasts).toHaveLength(1);
  });

  test("toasts keep the newest few", () => {
    const events = Array.from({ length: maxToasts + 2 }, (_, i) => ({ type: "left_page", at: ago(10_000 - i) }));
    const view = run(exam(), integrity("t1", ...events));
    expect(view.toasts.map((t) => t.at)).toEqual(events.slice(-maxToasts).map((e) => e.at));
  });

  test("dismissing removes one toast", () => {
    const view = run(exam(), integrity("t1", { type: "left_page", at: ago(2000) }, { type: "alt_tab", at: ago(1000) }));
    const [first, second] = view.toasts;
    expect(dismissToast(view, first!.id).toasts).toEqual([second!]);
  });

  test("an unmonitored session counts the event but shows nothing", () => {
    const view = run(startTeacherView(watchFor(session("quiz"))), integrity("t1", { type: "device_changed", at: ago(10) }));
    expect(view.toasts).toEqual([]);
    expect(view.waitingAt).toEqual({});
    expect(view.pulses).toEqual({ t1: 1 });
  });
});
