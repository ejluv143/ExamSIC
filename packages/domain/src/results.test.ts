import { describe, expect, test } from "bun:test";
import type { Answer, Attempt } from "./quiz.ts";
import {
  atRiskReasons,
  averagePercent,
  countsInRecord,
  earnedOn,
  finalPercent,
  finalScore,
  isMissed,
  latestSubmitted,
  questionNumber,
  questionsOf,
  scoreOf,
  sessionResults,
  type ResultAttempt,
} from "./results.ts";
import * as f from "./test-fixtures.ts";

const answer = (questionId: string, over: Partial<Answer> = {}): Answer => ({
  attemptId: "x",
  questionId,
  value: null,
  correct: true,
  autoScore: 1,
  manualScore: null,
  feedback: null,
  markedForReview: false,
  ...over,
});

let n = 0;
const attempt = (
  studentId: string,
  over: { submittedAt?: string | null; status?: Attempt["status"]; startedAt?: string; order?: string[]; answers?: Answer[]; deviceId?: string } = {},
): ResultAttempt => {
  const id = `a${++n}`;
  return {
    attempt: {
      id,
      sessionId: "s",
      studentId,
      seed: 1,
      status: over.status ?? "graded",
      startedAt: over.startedAt ?? "2026-01-01T10:00:00.000Z",
      submittedAt: over.submittedAt === undefined ? "2026-01-01T10:10:00.000Z" : over.submittedAt,
      pledgeAcceptedAt: null,
    },
    studentId,
    questionOrder: over.order ?? ["mc", "tf"],
    answers: over.answers ?? [],
    integrityEvents: [],
    ip: null,
    deviceId: over.deviceId ?? null,
    client: null,
  };
};

const mc = f.mc({ id: "mc", points: 2, topic: "Sets, Logic" });
const tf = f.tf({ id: "tf", points: 4 });
const essay = f.essay({ id: "es", points: 10, topic: "Logic" });
const quiz = [mc, tf, essay];

describe("results: the paper", () => {
  test("a student's questions are the drawn ones, in the quiz's order", () => {
    const d = attempt("s1", { order: ["tf", "es"] });
    expect(questionsOf(quiz, d).map((q) => q.id)).toEqual(["tf", "es"]);
  });

  test("a score counts missing answers as 0 and waits on essays", () => {
    const d = attempt("s1", { order: ["mc", "tf", "es"], answers: [answer("mc", { autoScore: 0.5 }), answer("es", { autoScore: null })] });
    expect(scoreOf(quiz, d)).toEqual({ score: 1, max: 16, gradedMax: 6, ungraded: 1 });
  });

  test("a question's earned points: 0 unanswered, null while a teacher has to score it", () => {
    const d = attempt("s1", { answers: [answer("es", { autoScore: null })] });
    expect(earnedOn(tf, d)).toBe(0);
    expect(earnedOn(essay, d)).toBeNull();
    expect(earnedOn(mc, attempt("s1", { answers: [answer("mc", { manualScore: 9 })] }))).toBe(2);
  });

  test("question numbers start at 1; an unknown question is 0", () => {
    expect(questionNumber(quiz, "tf")).toBe(2);
    expect(questionNumber(quiz, "nope")).toBe(0);
  });
});

describe("results: latest submitted attempt", () => {
  type Row = { key: string | null; status: string; submittedAt: Date | string | null };
  const row = (key: string | null, submittedAt: Date | string | null, status = "graded"): Row => ({ key, status, submittedAt });
  const pick = (rows: Row[]) => latestSubmitted(rows, (r) => r.key, (r) => r);

  test("the later submission wins, whatever order they come in", () => {
    const first = row("s1", "2026-01-01T10:10:00.000Z");
    const second = row("s1", "2026-01-02T10:10:00.000Z");
    const other = row("s2", "2026-01-01T09:00:00.000Z");
    const latest = pick([second, first, other]);
    expect(latest.get("s1")).toBe(second);
    expect(latest.get("s2")).toBe(other);
    expect(latest.size).toBe(2);
  });

  test("attempts in progress, unsubmitted ones and items without a key are skipped", () => {
    expect(pick([row("s1", null, "in_progress"), row("s2", null), row("s3", "2026-01-01T10:10:00.000Z", "in_progress"), row(null, "2026-01-01T10:10:00.000Z")]).size).toBe(0);
  });

  test("dates and ISO strings compare by time, and a tie keeps the first", () => {
    const early = row("s1", new Date("2026-01-01T10:00:00.000Z"));
    const late = row("s1", "2026-01-01T10:00:00.001Z");
    expect(pick([late, early]).get("s1")).toBe(late);
    const tie = row("s1", "2026-01-01T10:00:00.000Z");
    expect(pick([early, tie]).get("s1")).toBe(early);
  });
});

describe("results: what is final", () => {
  test("points and percent are final only once nothing waits for a teacher", () => {
    const done = { score: 6, max: 8, gradedMax: 8, ungraded: 0 };
    const waiting = { score: 6, max: 8, gradedMax: 6, ungraded: 1 };
    expect(finalScore(done)).toBe(6);
    expect(finalPercent(done)).toBe(75);
    expect(finalScore(waiting)).toBeNull();
    expect(finalPercent(waiting)).toBeNull();
  });
});

describe("results: the teacher's view of a session", () => {
  const graded = attempt("graded", { answers: [answer("mc", { value: "a", timeSpentMs: 2000 }), answer("tf", { value: true })] });
  const waiting = attempt("waiting", {
    status: "needs_grading",
    order: ["mc", "es"],
    answers: [answer("mc", { value: "a", autoScore: 0.5, timeSpentMs: 4000 }), answer("es", { autoScore: null })],
  });
  const working = attempt("working", { submittedAt: null, status: "in_progress" });
  const retakeOld = attempt("retake", { answers: [answer("mc", { autoScore: 0 })] });
  const retakeNew = attempt("retake", { submittedAt: "2026-01-02T10:10:00.000Z", startedAt: "2026-01-02T10:00:00.000Z", answers: [answer("mc"), answer("tf", { value: true })] });
  const attempts = [graded, waiting, working, retakeOld, retakeNew];
  const view = sessionResults({ questions: quiz, studentIds: ["graded", "waiting", "working", "retake", "ghost"], attempts });

  test("each roster student's place: latest submission, status, final and provisional percent", () => {
    expect(view.rows.map((r) => [r.studentId, r.status, r.attempts, r.percent, r.scorePercent, r.timeMs])).toEqual([
      ["graded", "Graded", 1, 100, 100, 600_000],
      // The essay waits: a score so far, but no final percent.
      ["waiting", "Needs grading", 1, null, 8, 600_000],
      ["working", "In progress", 1, null, null, null],
      ["retake", "Graded", 2, 100, 100, 600_000],
      ["ghost", "Not submitted", 0, null, null, null],
    ]);
    expect(view.rows[1]!.score).toEqual({ score: 1, max: 12, gradedMax: 2, ungraded: 1 });
    expect(view.rows[3]!.last).toBe(retakeNew);
    expect(view.latest.size).toBe(3);
  });

  test("the summary counts only final percents, and every status", () => {
    expect(view.summary).toEqual({
      students: 5,
      submitted: 3,
      percents: [100, 100],
      average: 100,
      median: 100,
      highest: 100,
      lowest: 100,
      averageTimeMs: 600_000,
      distribution: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
      status: { Graded: 2, "Needs grading": 1, "In progress": 1, "Not submitted": 1 },
    });
  });

  test("a question covers the latest attempts whose paper had it and leaves out answers waiting for a teacher", () => {
    expect(view.questions.map(({ question, ...t }) => [question.id, t])).toEqual([
      ["mc", { number: 1, had: 3, answered: 2, scored: 3, got: 5, max: 6, percent: 83, meanTimeMs: 3000 }],
      // A pool paper without the question doesn't count it as a zero.
      ["tf", { number: 2, had: 2, answered: 2, scored: 2, got: 8, max: 8, percent: 100, meanTimeMs: null }],
      ["es", { number: 3, had: 1, answered: 0, scored: 0, got: 0, max: 0, percent: null, meanTimeMs: null }],
    ]);
  });

  test("a part's percent adds the points of its questions", () => {
    expect(view.earnedPercent(["mc", "tf"])).toBe(93);
    expect(view.earnedPercent(["es"])).toBeNull();
    expect(view.earnedPercent([])).toBeNull();
  });

  test("topics split a multi-tag topic, skip answers waiting for a teacher and list the weakest first", () => {
    expect(view.topics).toEqual([
      { topic: "Sets", percent: 83, answers: 3, medianTimeMs: 3000 },
      { topic: "Logic", percent: 83, answers: 3, medianTimeMs: 3000 },
      // tf has no topic.
      { topic: "General", percent: 100, answers: 2, medianTimeMs: null },
    ]);
    // Each student's own points per topic, for a record across sessions.
    expect(view.rows[0]!.topics.get("Sets")).toEqual({ got: 2, max: 2, answers: 1, times: [2000] });
    expect(view.rows[4]!.topics.size).toBe(0);
  });

  test("a topic with no points at stake is left out", () => {
    const free = f.mc({ id: "free", points: 0, topic: "Bonus" });
    const d = attempt("s1", { order: ["free"], answers: [answer("free")] });
    expect(sessionResults({ questions: [free], studentIds: ["s1"], attempts: [d] }).topics).toEqual([]);
  });

  test("a session nobody submitted gives empty figures, not errors", () => {
    const empty = sessionResults({ questions: quiz, studentIds: ["s1"], attempts: [] });
    expect(empty.summary).toMatchObject({ submitted: 0, percents: [], average: null, median: null, highest: null, lowest: null, averageTimeMs: null });
    expect(empty.questions.every((q) => q.percent === null)).toBe(true);
  });

  test("only each student's latest submitted attempt is analysed for integrity, and every row carries its level", () => {
    expect(Object.keys(view.integrity.attempts).sort()).toEqual([graded, waiting, retakeNew].map((d) => d.attempt.id).sort());
    expect(view.rows[0]!.integrity?.attemptId).toBe(graded.attempt.id);
    expect(view.rows[2]!.integrity).toBeNull();
  });

  test("typing flags add to the level, and are optional", () => {
    const d = attempt("s1");
    const base = sessionResults({ questions: quiz, studentIds: ["s1"], attempts: [d] }).rows[0]!.integrity!;
    const flagged = sessionResults({ questions: quiz, studentIds: ["s1"], attempts: [d], typingFlags: { [d.attempt.id]: 2 } }).rows[0]!.integrity!;
    expect(flagged.score).toBeGreaterThan(base.score);
  });

  test("two students on one device are flagged as a pair", () => {
    const x = attempt("s1", { deviceId: "dev" });
    const y = attempt("s2", { deviceId: "dev" });
    expect(sessionResults({ questions: quiz, studentIds: ["s1", "s2"], attempts: [x, y] }).integrity.pairs.map((p) => p.kind)).toContain("device");
  });
});

describe("results: a class's record", () => {
  test("games stay out of the record", () => {
    expect(countsInRecord("game")).toBe(false);
    expect(countsInRecord("quiz")).toBe(true);
    expect(countsInRecord("exam")).toBe(true);
  });

  test("missed means ended with no submission", () => {
    expect(isMissed("ended", false)).toBe(true);
    expect(isMissed("ended", true)).toBe(false);
    expect(isMissed("running", false)).toBe(false);
  });

  test("at risk below an average of 60 or after 2 missed sessions", () => {
    expect(atRiskReasons(59, 0)).toEqual(["average 59%"]);
    expect(atRiskReasons(60, 1)).toEqual([]);
    expect(atRiskReasons(null, 2)).toEqual(["2 missed sessions"]);
    expect(atRiskReasons(40, 3)).toEqual(["average 40%", "3 missed sessions"]);
  });

  test("the average is a whole percent, null when empty", () => {
    expect(averagePercent([])).toBeNull();
    expect(averagePercent([70, 75])).toBe(73);
  });
});
