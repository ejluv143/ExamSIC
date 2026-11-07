import { describe, expect, test } from "bun:test";
import {
  analyzeSession,
  awayCount,
  defaultIntegrity,
  eventsLevel,
  integrityReport,
  integrityRules,
  isAway,
  levelOf,
  type IntegrityAttempt,
} from "./integrity.ts";
import type { Question } from "./question.ts";
import type { Answer, AnswerValue, IntegrityEvent, IntegrityEventType } from "./quiz.ts";

const start = Date.parse("2026-10-26T08:00:00Z");
const at = (seconds: number) => new Date(start + seconds * 1000).toISOString();
const event = (type: IntegrityEventType, seconds = 0, durationMs?: number): IntegrityEvent =>
  durationMs === undefined ? { type, at: at(seconds) } : { type, at: at(seconds), durationMs };

// Multiple choice, the right choice "b".
const choice = (id: string): Question => ({
  id,
  prompt: `Pick one (${id})`,
  points: 1,
  gamePoints: "standard",
  partialCredit: false,
  type: "multiple_choice",
  choices: ["a", "b", "c", "d"].map((c) => ({ id: c, text: c.toUpperCase() })),
  correctChoiceIds: ["b"],
  multipleCorrect: false,
});

type Given = { value: AnswerValue; seconds?: number; timeSpentMs?: number };

// A submitted attempt (started at `start`, submitted after an hour) with `given` answers by question id.
const attempt = (
  id: string,
  given: Record<string, Given> = {},
  over: Partial<Omit<IntegrityAttempt, "attempt" | "answers">> = {},
): IntegrityAttempt => ({
  attempt: { id, sessionId: "s1", studentId: `user-${id}`, seed: 1, status: "graded", startedAt: at(0), submittedAt: at(3600), pledgeAcceptedAt: null },
  studentId: `student-${id}`,
  answers: Object.entries(given).map(
    ([questionId, g]): Answer => ({
      attemptId: id,
      questionId,
      value: g.value,
      correct: g.value === "b",
      autoScore: g.value === "b" ? 1 : 0,
      manualScore: null,
      feedback: null,
      markedForReview: false,
      answeredAt: at(g.seconds ?? 60),
      ...(g.timeSpentMs === undefined ? {} : { timeSpentMs: g.timeSpentMs }),
    }),
  ),
  integrityEvents: [],
  ip: null,
  deviceId: null,
  client: null,
  ...over,
});

describe("defaultIntegrity", () => {
  test("exams turn everything on and submit after the third time away", () => {
    const exam = defaultIntegrity("exam");
    expect(exam).toMatchObject({ requireFullscreen: true, trackFocus: true, blockSecondScreen: true, watermark: true, autoSubmitAfter: 3 });
    expect(exam).toMatchObject({ blockCopy: true, blockPaste: true, blockPrint: true, blockRightClick: true, clearClipboardOnStart: true });
  });

  test("quizzes block nothing, mastery only copying, and games don't watch at all", () => {
    expect(defaultIntegrity("quiz")).toMatchObject({ requireFullscreen: true, trackFocus: true, blockCopy: false, blockPaste: false, autoSubmitAfter: null });
    expect(defaultIntegrity("mastery")).toMatchObject({ blockCopy: true, blockPaste: false, blockRightClick: false });
    expect(defaultIntegrity("game")).toMatchObject({ requireFullscreen: false, trackFocus: false, blockCopy: false });
  });
});

describe("integrityRules", () => {
  test("lists only the settings that are on, in words for the student", () => {
    const rules = integrityRules(defaultIntegrity("game"), "game");
    expect(rules).toEqual([]);
    const exam = integrityRules(defaultIntegrity("exam"), "exam");
    expect(exam).toContain("Copying and cutting are turned off, and the question text can't be selected.");
    expect(exam.at(-1)).toBe(
      "You can leave (switch away or exit full screen) and come back 3 times. Leaving once more submits your exam automatically.",
    );
  });

  test("says 'time' for one, and mentions the code editor when pasting there is allowed", () => {
    const rules = integrityRules({ ...defaultIntegrity("exam"), autoSubmitAfter: 1, allowPasteInCode: true }, "quiz");
    expect(rules.some((r) => r.includes("come back 1 time. Leaving once more submits your quiz"))).toBe(true);
    expect(rules).toContain("Pasting and dragging text in are turned off, except in the code editor (every paste there is recorded).");
  });

  test("names the one client a session allows", () => {
    expect(integrityRules({ ...defaultIntegrity("quiz"), allowedClients: ["desktop"] }, "exam")[0]).toBe(
      "Take it in the Examinus Desktop app; a web browser can't open it.",
    );
  });
});

describe("leaving", () => {
  test("switching away, a second screen and leaving full screen count; the mouse leaving and copying don't", () => {
    for (const type of ["left_page", "switched_app", "alt_tab", "second_screen", "exit_fullscreen", "kiosk_exited"] as const)
      expect(isAway(event(type))).toBe(true);
    for (const type of ["mouse_left", "copy", "window_resize", "disconnected"] as const) expect(isAway(event(type))).toBe(false);
    expect(awayCount([event("left_page"), event("mouse_left"), event("exit_fullscreen"), event("copy")])).toBe(2);
  });
});

describe("integrityReport", () => {
  const report = integrityReport([
    event("exit_fullscreen", 300, 20_000),
    event("left_page", 100, 30_000),
    event("disconnected", 200, 90_000),
    event("left_page", 50, 5_000),
    event("copy", 10),
  ]);

  test("puts the events in time order, most frequent type first", () => {
    expect(report.timeline.map((e) => e.at)).toEqual([at(10), at(50), at(100), at(200), at(300)]);
    expect(report.byType.map((r) => [r.type, r.count])).toEqual([
      ["left_page", 2],
      ["copy", 1],
      ["disconnected", 1],
      ["exit_fullscreen", 1],
    ]);
    expect(report.byType[0]).toMatchObject({ totalMs: 35_000, times: [at(50), at(100)] });
  });

  test("adds up time away, out of full screen and offline separately, and finds the longest gap", () => {
    expect(report).toMatchObject({ awayMs: 35_000, fullscreenMs: 20_000, disconnectedMs: 90_000, longestGapMs: 90_000 });
  });

  test("an attempt with no events has an empty report", () => {
    expect(integrityReport([])).toEqual({ byType: [], awayMs: 0, fullscreenMs: 0, disconnectedMs: 0, longestGapMs: 0, timeline: [] });
  });
});

describe("levels", () => {
  test("3 points make medium and 8 make high", () => {
    expect([0, 2.5, 3, 7.9, 8, 20].map(levelOf)).toEqual(["low", "low", "medium", "medium", "high", "high"]);
  });

  test("a student's own events add up, but one noisy signal is capped", () => {
    expect(eventsLevel([])).toBe("low");
    expect(eventsLevel([event("left_page"), event("left_page"), event("alt_tab")])).toBe("medium");
    // Leaving 20 times scores 6, not 20: still medium on its own.
    expect(eventsLevel(Array.from({ length: 20 }, (_, i) => event("left_page", i)))).toBe("medium");
    expect(eventsLevel([...Array.from({ length: 20 }, (_, i) => event("left_page", i)), event("device_changed")])).toBe("high");
  });
});

describe("analyzeSession", () => {
  const questions = ["q1", "q2", "q3", "q4"].map(choice);
  // Eight students who got everything right.
  const honest = Array.from({ length: 8 }, (_, i) =>
    attempt(`h${i}`, Object.fromEntries(questions.map((q) => [q.id, { value: "b" }]))),
  );

  test("the same rare wrong answers on three questions pair two students and raise both", () => {
    const wrong = { q1: { value: "c" }, q2: { value: "d" }, q3: { value: "a" }, q4: { value: "b" } };
    const result = analyzeSession({ attempts: [...honest, attempt("x", wrong), attempt("y", wrong)], questions });
    expect(result.pairs).toEqual([
      expect.objectContaining({ kind: "wrong_answers", a: "x", b: "y", strength: 0.75, questionIds: ["q1", "q2", "q3"] }),
    ]);
    // 2 + 4 × 0.75 points: medium, with the reason given.
    expect(result.attempts.x).toMatchObject({ score: 5, level: "medium" });
    expect(result.attempts.x!.signals).toEqual([{ key: "pairs", label: "Same rare wrong answers as another student", points: 5 }]);
    expect(result.attempts.h0!.level).toBe("low");
  });

  test("a wrong answer half the class gave is a common mistake, not copying", () => {
    const common = honest.map((h, i) =>
      i < 5 ? attempt(h.attempt.id, { q1: { value: "c" }, q2: { value: "c" }, q3: { value: "c" }, q4: { value: "b" } }) : h,
    );
    expect(analyzeSession({ attempts: common, questions }).pairs).toEqual([]);
  });

  test("two students answering at the same moments of their attempts are paired", () => {
    const six = ["t1", "t2", "t3", "t4", "t5", "t6"].map(choice);
    const timed = (id: string, shift: number) =>
      attempt(id, Object.fromEntries(six.map((q, i) => [q.id, { value: "b", seconds: 30 + i * 60 + shift }])));
    const result = analyzeSession({ attempts: [timed("x", 0), timed("y", 3), timed("z", 25)], questions: six });
    expect(result.pairs.map((p) => [p.kind, p.a, p.b])).toEqual([["timing", "x", "y"]]);
    expect(result.attempts.x!.score).toBe(3);
    expect(result.attempts.z!.score).toBe(0);
  });

  test("answers far faster than the class count as too fast", () => {
    const q = [choice("q1")];
    const class_ = [20_000, 22_000, 25_000, 30_000, 18_000].map((ms, i) => attempt(`c${i}`, { q1: { value: "b", timeSpentMs: ms } }));
    const result = analyzeSession({ attempts: [...class_, attempt("fast", { q1: { value: "b", timeSpentMs: 1_000 } })], questions: q });
    expect(result.attempts.fast!.signals).toEqual([{ key: "too_fast", label: "Answered faster than anyone could read", points: 1 }]);
    expect(result.attempts.c0!.signals).toEqual([]);
  });

  test("a shared browser or network address is reported, but scored from the events, not again here", () => {
    const result = analyzeSession({
      attempts: [attempt("x", {}, { deviceId: "dev-1", ip: "10.0.0.5" }), attempt("y", {}, { deviceId: "dev-1", ip: "10.0.0.5" })],
      questions: [],
    });
    expect(result.pairs.map((p) => [p.kind, p.strength])).toEqual([
      ["device", 1],
      ["network", 0.2],
    ]);
    expect(result.attempts.x!.score).toBe(0);
  });

  test("many students on one address is a lab or campus Wi-Fi, not sharing", () => {
    const lab = ["a", "b", "c", "d"].map((id) => attempt(id, {}, { ip: "10.0.0.5" }));
    expect(analyzeSession({ attempts: lab, questions: [] }).pairs).toEqual([]);
  });

  test("one student's two attempts on a shared device pair with the other student, not with each other", () => {
    const again = attempt("x2", {}, { deviceId: "dev-1", studentId: "student-x" });
    const attempts = [attempt("x", {}, { deviceId: "dev-1" }), again, attempt("y", {}, { deviceId: "dev-1" })];
    expect(analyzeSession({ attempts, questions: [] }).pairs.map((p) => [p.a, p.b])).toEqual([
      ["x", "y"],
      ["x2", "y"],
    ]);
  });

  test("pasted-looking typing adds 3 points a history, at most 6, and signals come biggest first", () => {
    const events = [event("left_page"), event("left_page")];
    const result = analyzeSession({ attempts: [attempt("x", {}, { integrityEvents: events })], questions: [], typingFlags: { x: 5 } });
    expect(result.attempts.x!.signals.map((s) => [s.key, s.points])).toEqual([
      ["typing", 6],
      ["left", 2],
    ]);
    expect(result.attempts.x).toMatchObject({ score: 8, level: "high" });
  });
});
