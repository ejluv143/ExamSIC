import { describe, expect, test } from "bun:test";
import type { Answer, Attempt } from "./quiz.ts";
import {
  atRiskReasons,
  averagePercent,
  countsInRecord,
  earnedOn,
  integrityOf,
  isMissed,
  latestSubmitted,
  questionNumber,
  questionsOf,
  questionTally,
  scoreOf,
  studentResult,
  topicMastery,
  topicTotals,
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
  test("the later submission wins and unsubmitted attempts are ignored", () => {
    const first = attempt("s1", { submittedAt: "2026-01-01T10:10:00.000Z" });
    const second = attempt("s1", { submittedAt: "2026-01-02T10:10:00.000Z" });
    const open = attempt("s1", { submittedAt: null, status: "in_progress" });
    const other = attempt("s2", { submittedAt: "2026-01-01T09:00:00.000Z" });
    const latest = latestSubmitted([second, first, open, other]);
    expect(latest.get("s1")).toBe(second);
    expect(latest.get("s2")).toBe(other);
    expect(latest.size).toBe(2);
  });

  test("a student with only an open attempt has no latest", () => {
    expect(latestSubmitted([attempt("s1", { submittedAt: null })]).size).toBe(0);
  });
});

describe("results: a student's place in the session", () => {
  const all = [
    attempt("graded", { answers: [answer("mc"), answer("tf")] }),
    attempt("waiting", { status: "needs_grading", order: ["mc", "es"], answers: [answer("mc"), answer("es", { autoScore: null })] }),
    attempt("working", { submittedAt: null, status: "in_progress" }),
    attempt("retake", { submittedAt: "2026-01-01T10:10:00.000Z", answers: [answer("mc", { autoScore: 0 })] }),
    attempt("retake", { submittedAt: "2026-01-02T10:10:00.000Z", startedAt: "2026-01-02T10:00:00.000Z", answers: [answer("mc"), answer("tf")] }),
  ];

  test("graded: score, final percent and time taken", () => {
    const r = studentResult(quiz, "graded", all);
    expect(r.status).toBe("Graded");
    expect(r.score).toEqual({ score: 6, max: 6, gradedMax: 6, ungraded: 0 });
    expect(r.percent).toBe(100);
    expect(r.timeMs).toBe(600_000);
  });

  test("waiting on a teacher: a score but no final percent", () => {
    const r = studentResult(quiz, "waiting", all);
    expect(r.status).toBe("Needs grading");
    expect(r.score?.ungraded).toBe(1);
    expect(r.percent).toBeNull();
  });

  test("started but not submitted, and never started", () => {
    expect(studentResult(quiz, "working", all)).toMatchObject({ status: "In progress", attempts: 1, score: null, percent: null, timeMs: null });
    expect(studentResult(quiz, "ghost", all)).toMatchObject({ status: "Not submitted", attempts: 0, last: undefined });
  });

  test("a retake counts its latest submission and every attempt", () => {
    const r = studentResult(quiz, "retake", all);
    expect(r.attempts).toBe(2);
    expect(r.percent).toBe(100);
  });
});

describe("results: per question and per topic", () => {
  const a = attempt("s1", { order: ["mc", "tf", "es"], answers: [answer("mc"), answer("tf", { autoScore: 0 }), answer("es", { autoScore: null })] });
  const b = attempt("s2", { order: ["mc", "es"], answers: [answer("mc", { autoScore: 0.5, timeSpentMs: 4000 }), answer("es", { manualScore: 5 })] });

  test("a tally covers attempts whose paper had the question, leaving out unscored answers", () => {
    const t = questionTally(mc, [a, b]);
    expect(t.had).toHaveLength(2);
    expect(t.scores).toEqual([2, 1]);
    expect(t.percent).toBe(75);
    expect(t.times).toEqual([4000]);
    // Only s2's essay is scored.
    expect(questionTally(essay, [a, b]).scores).toEqual([5]);
    // A pool paper without the question doesn't count it as a zero.
    expect(questionTally(tf, [a, b]).had).toEqual([a]);
  });

  test("a tally with nothing scored has no percent", () => {
    expect(questionTally(essay, [a]).percent).toBeNull();
  });

  test("topics add points per tag, split a multi-tag topic, and skip answers waiting for a teacher", () => {
    const totals = topicTotals(quiz, [a, b]);
    expect(totals.get("Sets")).toEqual({ got: 3, max: 4, answers: 2, times: [4000] });
    // Logic: mc of both students, plus s2's essay; s1's essay is waiting.
    expect(totals.get("Logic")).toMatchObject({ got: 8, max: 14, answers: 3 });
    // tf has no topic.
    expect(totals.get("General")).toMatchObject({ got: 0, max: 4, answers: 1 });
  });

  test("mastery lists the weakest topic first, with the median time", () => {
    const rows = topicMastery(topicTotals(quiz, [a, b]));
    expect(rows.map((r) => [r.topic, r.percent])).toEqual([
      ["General", 0],
      ["Logic", 57],
      ["Sets", 75],
    ]);
    expect(rows.find((r) => r.topic === "Sets")?.medianTimeMs).toBe(4000);
    expect(rows.find((r) => r.topic === "General")?.medianTimeMs).toBeNull();
  });

  test("a topic with no points at stake is left out", () => {
    const free = f.mc({ id: "free", points: 0, topic: "Bonus" });
    const d = attempt("s1", { order: ["free"], answers: [answer("free")] });
    expect(topicMastery(topicTotals([free], [d]))).toEqual([]);
  });
});

describe("results: integrity", () => {
  test("only each student's latest submitted attempt is analysed", () => {
    const old = attempt("s1", { submittedAt: "2026-01-01T10:10:00.000Z" });
    const last = attempt("s1", { submittedAt: "2026-01-02T10:10:00.000Z" });
    const open = attempt("s2", { submittedAt: null });
    const { attempts } = integrityOf(quiz, [old, last, open]);
    expect(Object.keys(attempts)).toEqual([last.attempt.id]);
  });

  test("typing flags add to the level, and are optional", () => {
    const d = attempt("s1");
    const base = integrityOf(quiz, [d]).attempts[d.attempt.id]!;
    const flagged = integrityOf(quiz, [d], { [d.attempt.id]: 2 }).attempts[d.attempt.id]!;
    expect(flagged.score).toBeGreaterThan(base.score);
  });

  test("two students on one device are flagged as a pair", () => {
    const x = attempt("s1", { deviceId: "dev" });
    const y = attempt("s2", { deviceId: "dev" });
    expect(integrityOf(quiz, [x, y]).pairs.map((p) => p.kind)).toContain("device");
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
