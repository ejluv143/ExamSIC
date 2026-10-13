import { describe, expect, test } from "bun:test";
import {
  analyzeAttempt,
  coachContext,
  coachMaxWords,
  fallbackCoach,
  fitCoachReport,
  median,
  resultTelemetry,
  topicTags,
  weakestTopic,
  type QuestionTelemetry,
  type ReleasedResult,
  type CoachReport,
  type SessionTelemetry,
} from "./analytics.ts";
import * as f from "./test-fixtures.ts";

// --- Builders ---

let n = 0;
const qt = (over: Partial<QuestionTelemetry> = {}): QuestionTelemetry => ({
  questionId: `q${++n}`,
  prompt: "Prompt",
  explanation: null,
  topicTags: ["General"],
  selectedOptionId: null,
  correctOptionId: null,
  userAnswer: null,
  correctAnswer: null,
  isCorrect: true,
  skipped: false,
  timeTakenMs: null,
  targetTimeMs: null,
  optionSwitchesCount: null,
  ...over,
});
const right = (over: Partial<QuestionTelemetry> = {}) => qt({ isCorrect: true, ...over });
const wrong = (over: Partial<QuestionTelemetry> = {}) => qt({ isCorrect: false, ...over });
const repeat = <T>(count: number, make: () => T): T[] => Array.from({ length: count }, make);

const attempt = (questions: QuestionTelemetry[], totalDurationMs = 60_000): SessionTelemetry => ({
  sessionId: "s1",
  userId: "u1",
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:01:00.000Z",
  totalDurationMs,
  questions,
});
const analyze = (questions: QuestionTelemetry[]) => analyzeAttempt(attempt(questions));

// --- Topic tags and median ---

describe("topic tags", () => {
  test("a topic splits on commas, trimmed and without repeats", () => {
    expect(topicTags("Data-Structures, Trees")).toEqual(["Data-Structures", "Trees"]);
    expect(topicTags("A, A , B")).toEqual(["A", "B"]);
  });

  test("no topic is General", () => {
    for (const topic of [undefined, null, "", "  ", ",", " , "]) expect(topicTags(topic)).toEqual(["General"]);
  });
});

describe("median", () => {
  test("the middle value, or the mean of the two middle ones", () => {
    expect(median([])).toBeNull();
    expect(median([3])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  test("leaves its input alone", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});

// --- Telemetry from a result ---

describe("result telemetry", () => {
  const result = (items: ReleasedResult["items"], over: Partial<ReleasedResult> = {}): ReleasedResult => ({
    session: { id: "s1", questionTimeLimitSeconds: null },
    startedAt: "2026-01-01T00:00:00.000Z",
    submittedAt: "2026-01-01T00:02:30.000Z",
    items,
    ...over,
  });
  const item = (question: ReleasedResult["items"][number]["question"], answer: ReleasedResult["items"][number]["answer"], points: number | null, extra: Partial<ReleasedResult["items"][number]> = {}) => ({
    question,
    answer,
    points,
    timeSpentMs: null,
    answerChanges: null,
    ...extra,
  });

  test("a right answer is correct, with the option ids and answer texts", () => {
    const [q] = resultTelemetry(result([item(f.mc({ explanation: "Because." }), "a", 4, { timeSpentMs: 1200, answerChanges: 2 })]), "u9").questions;
    expect(q).toEqual({
      questionId: "mc",
      prompt: "Prompt",
      explanation: "Because.",
      topicTags: ["General"],
      selectedOptionId: "a",
      correctOptionId: "a",
      userAnswer: "Alpha",
      correctAnswer: "Alpha",
      isCorrect: true,
      skipped: false,
      timeTakenMs: 1200,
      targetTimeMs: null,
      optionSwitchesCount: 2,
    });
  });

  test("session fields come through, with the duration between start and submit", () => {
    const t = resultTelemetry(result([]), "u9");
    expect(t).toMatchObject({ sessionId: "s1", userId: "u9", startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:02:30.000Z", totalDurationMs: 150_000 });
  });

  test("without times the start falls back to the submit time, then to the epoch", () => {
    expect(resultTelemetry(result([], { startedAt: null }), "u").totalDurationMs).toBe(0);
    const none = resultTelemetry(result([], { startedAt: null, submittedAt: null }), "u");
    expect(none.startedAt).toBe(new Date(0).toISOString());
    expect(none.completedAt).toBe(none.startedAt);
    expect(none.totalDurationMs).toBe(0);
  });

  test("a submit before the start never gives a negative duration", () => {
    expect(resultTelemetry(result([], { startedAt: "2026-01-02T00:00:00.000Z" }), "u").totalDurationMs).toBe(0);
  });

  test("the question time limit becomes a target in milliseconds", () => {
    const limited = result([item(f.tf(), true, 4)], { session: { id: "s", questionTimeLimitSeconds: 30 } });
    expect(resultTelemetry(limited, "u").questions[0]!.targetTimeMs).toBe(30_000);
    expect(resultTelemetry(result([item(f.tf(), true, 4)]), "u").questions[0]!.targetTimeMs).toBeNull();
  });

  test("a partly right answer counts as wrong, a blank one as skipped, an ungraded one as pending", () => {
    const [partial, blank, pending] = resultTelemetry(
      result([item(f.mc(), "b", 2), item(f.mc(), null, 0), item(f.essay(), "My essay", null)]),
      "u",
    ).questions;
    expect(partial).toMatchObject({ isCorrect: false, skipped: false, userAnswer: "Beta" });
    expect(blank).toMatchObject({ isCorrect: false, skipped: true, userAnswer: null, selectedOptionId: null });
    expect(pending).toMatchObject({ isCorrect: null, skipped: false, userAnswer: "My essay", selectedOptionId: null, correctOptionId: null });
  });

  test("a blank answer is skipped even when the points are still unknown", () => {
    expect(resultTelemetry(result([item(f.essay(), "  ", null)]), "u").questions[0]).toMatchObject({ skipped: true, isCorrect: false });
    expect(resultTelemetry(result([item(f.blank(), ["", ""], null)]), "u").questions[0]).toMatchObject({ skipped: true });
  });

  test("option ids are named for multiple choice and true/false only", () => {
    const [multi, bool, falseAnswer, num] = resultTelemetry(
      result([
        item(f.mc({ multipleCorrect: true, correctChoiceIds: ["a", "b"] }), ["a", "c"], 0),
        item(f.tf({ answer: false }), true, 0),
        item(f.tf(), false, 0),
        item(f.numeric(), "9", 0),
      ]),
      "u",
    ).questions;
    expect(multi).toMatchObject({ selectedOptionId: "a,c", correctOptionId: "a,b" });
    expect(bool).toMatchObject({ selectedOptionId: "true", correctOptionId: "false" });
    expect(falseAnswer).toMatchObject({ selectedOptionId: "false", correctOptionId: "true", skipped: false });
    expect(num).toMatchObject({ selectedOptionId: null, correctOptionId: null, userAnswer: "9", correctAnswer: "3.14 ± 0.01 cm" });
  });

  test("topic tags and an absent explanation come from the question", () => {
    const [q] = resultTelemetry(result([item(f.tf({ topic: "Sets, Logic" }), true, 4)]), "u").questions;
    expect(q!.topicTags).toEqual(["Sets", "Logic"]);
    expect(q!.explanation).toBeNull();
  });
});

// --- Analysis ---

describe("analyzeAttempt", () => {
  test("an empty attempt has nothing to say", () => {
    const a = analyze([]);
    expect(a.summary).toEqual({
      total: 0,
      correct: 0,
      incorrect: 0,
      skipped: 0,
      pending: 0,
      accuracy: null,
      totalDurationMs: 60_000,
      avgTimeMs: null,
      targetTimeMs: null,
      pacingDeltaMs: null,
    });
    expect(a.topics).toEqual([]);
    expect(a.behavior).toEqual({ fluent_recall: 0, effortful_success: 0, impulsive_error: 0, time_sink: 0 });
    expect(a.pacing).toEqual({ firstHalf: { avgTimeMs: null, accuracy: null }, secondHalf: { avgTimeMs: null, accuracy: null }, driftMs: null, fatigue: false });
  });

  test("outcomes are counted, a skipped question counting as wrong in the accuracy", () => {
    const a = analyze([right(), right(), wrong(), qt({ isCorrect: false, skipped: true }), qt({ isCorrect: null })]);
    expect(a.questions.map((q) => q.outcome)).toEqual(["correct", "correct", "incorrect", "skipped", "pending"]);
    expect(a.summary).toMatchObject({ total: 5, correct: 2, incorrect: 1, skipped: 1, pending: 1, accuracy: 50 });
    expect(a.questions.map((q) => q.index)).toEqual([0, 1, 2, 3, 4]);
  });

  test("a skipped question stays skipped even if it is marked correct", () => {
    expect(analyze([qt({ isCorrect: true, skipped: true })]).questions[0]!.outcome).toBe("skipped");
  });

  test("accuracy is null while everything waits for the teacher", () => {
    expect(analyze([qt({ isCorrect: null }), qt({ isCorrect: null })]).summary.accuracy).toBeNull();
  });

  test("accuracy rounds to a whole percent", () => {
    expect(analyze([right(), right(), wrong()]).summary.accuracy).toBe(67);
    expect(analyze([right(), wrong(), wrong()]).summary.accuracy).toBe(33);
  });

  test("speed against the student's own average puts questions in the four quadrants", () => {
    const a = analyze([
      right({ timeTakenMs: 1000 }),
      wrong({ timeTakenMs: 1000 }),
      right({ timeTakenMs: 4000 }),
      wrong({ timeTakenMs: 4000 }),
      right({ timeTakenMs: 2000 }),
    ]);
    expect(a.summary.avgTimeMs).toBe(2400);
    expect(a.questions.map((q) => q.quadrant)).toEqual(["fluent_recall", "impulsive_error", "effortful_success", "time_sink", null]);
    expect(a.questions.map((q) => q.deltaMs)).toEqual([-1400, -1400, 1600, 1600, -400]);
    expect(a.behavior).toEqual({ fluent_recall: 1, effortful_success: 1, impulsive_error: 1, time_sink: 1 });
  });

  test("the quadrant edges are 0.8 and 1.3 times the average", () => {
    // Average 1000: 800 is fast (inclusive), 1300 is slow (inclusive), 801 and 1299 are in the middle band.
    const a = analyze([right({ timeTakenMs: 800 }), right({ timeTakenMs: 1300 }), right({ timeTakenMs: 1000 }), right({ timeTakenMs: 900 })]);
    expect(a.summary.avgTimeMs).toBe(1000);
    expect(a.questions.map((q) => q.quadrant)).toEqual(["fluent_recall", "effortful_success", null, null]);
  });

  test("pending and untimed questions are in no quadrant, and untimed ones have no delta", () => {
    const a = analyze([qt({ isCorrect: null, timeTakenMs: 100 }), right({ timeTakenMs: 5000 }), right({ timeTakenMs: null }), right({ timeTakenMs: 100 })]);
    expect(a.questions[0]!.quadrant).toBeNull();
    expect(a.questions[2]).toMatchObject({ quadrant: null, deltaMs: null });
    expect(a.summary.avgTimeMs).toBe(1733);
  });

  test("no times at all means no average, quadrant or pacing", () => {
    const a = analyze([right(), wrong()]);
    expect(a.summary).toMatchObject({ avgTimeMs: null, pacingDeltaMs: null });
    expect(a.questions.every((q) => q.quadrant === null && q.deltaMs === null)).toBe(true);
    expect(a.pacing.driftMs).toBeNull();
  });

  test("a zero average puts nothing in a quadrant", () => {
    expect(analyze([right({ timeTakenMs: 0 }), wrong({ timeTakenMs: 0 })]).questions.map((q) => q.quadrant)).toEqual([null, null]);
  });

  test("the pacing delta is the average time against the average target", () => {
    const a = analyze([right({ timeTakenMs: 2000, targetTimeMs: 2000 }), right({ timeTakenMs: 3000, targetTimeMs: 2000 })]);
    expect(a.summary).toMatchObject({ avgTimeMs: 2500, targetTimeMs: 2000, pacingDeltaMs: 500 });
    const faster = analyze([right({ timeTakenMs: 1000, targetTimeMs: 2000 })]);
    expect(faster.summary.pacingDeltaMs).toBe(-1000);
    expect(analyze([right({ targetTimeMs: 2000 })]).summary).toMatchObject({ targetTimeMs: 2000, pacingDeltaMs: null });
  });

  test("the total duration is passed through", () => {
    expect(analyzeAttempt(attempt([], 12_345)).summary.totalDurationMs).toBe(12_345);
  });

  test("halves compare the first half's time and accuracy with the second's", () => {
    const a = analyze([
      right({ timeTakenMs: 1000 }),
      wrong({ timeTakenMs: 1000 }),
      right({ timeTakenMs: 4000 }),
      right({ timeTakenMs: 4000 }),
      wrong({ timeTakenMs: 2000 }),
    ]);
    expect(a.pacing.firstHalf).toEqual({ avgTimeMs: 1000, accuracy: 50 });
    expect(a.pacing.secondHalf).toEqual({ avgTimeMs: 3333, accuracy: 67 });
    expect(a.pacing.driftMs).toBe(2333);
  });

  test("fatigue is slower by over 25% with accuracy down by over 15 points", () => {
    const tired = analyze([right({ timeTakenMs: 1000 }), right({ timeTakenMs: 1000 }), wrong({ timeTakenMs: 2000 }), wrong({ timeTakenMs: 2000 })]);
    expect(tired.pacing.fatigue).toBe(true);
    const sameAccuracy = analyze([right({ timeTakenMs: 1000 }), right({ timeTakenMs: 1000 }), right({ timeTakenMs: 2000 }), right({ timeTakenMs: 2000 })]);
    expect(sameAccuracy.pacing.fatigue).toBe(false);
    const sameSpeed = analyze([right({ timeTakenMs: 1000 }), right({ timeTakenMs: 1000 }), wrong({ timeTakenMs: 1000 }), wrong({ timeTakenMs: 1000 })]);
    expect(sameSpeed.pacing.fatigue).toBe(false);
    const barelySlower = analyze([right({ timeTakenMs: 1000 }), right({ timeTakenMs: 1000 }), wrong({ timeTakenMs: 1250 }), wrong({ timeTakenMs: 1250 })]);
    expect(barelySlower.pacing.fatigue).toBe(false);
  });

  test("an accuracy drop of exactly 15 points is not fatigue", () => {
    // First half 100% over 1 question... use 20 questions: 20 of 20 right then 17 of 20 right is a 15 point drop.
    const first = repeat(20, () => right({ timeTakenMs: 1000 }));
    const second = [...repeat(17, () => right({ timeTakenMs: 2000 })), ...repeat(3, () => wrong({ timeTakenMs: 2000 }))];
    const a = analyze([...first, ...second]);
    expect(a.pacing.firstHalf.accuracy! - a.pacing.secondHalf.accuracy!).toBe(15);
    expect(a.pacing.fatigue).toBe(false);
  });
});

describe("topics", () => {
  test("a question with two tags counts under both, and weights are shares of the attempt", () => {
    const a = analyze([right({ topicTags: ["Sets", "Logic"] }), wrong({ topicTags: ["Logic"] }), right({ topicTags: ["General"] }), right({ topicTags: ["General"] })]);
    const byTopic = Object.fromEntries(a.topics.map((t) => [t.topic, t]));
    expect(byTopic.Sets).toMatchObject({ total: 1, graded: 1, correct: 1, accuracy: 100, weight: 0.25 });
    expect(byTopic.Logic).toMatchObject({ total: 2, graded: 2, correct: 1, accuracy: 50, weight: 0.5 });
    expect(byTopic.General).toMatchObject({ total: 2, accuracy: 100, weight: 0.5 });
  });

  test("topics sort by size, then by name", () => {
    const a = analyze([
      ...repeat(5, () => right({ topicTags: ["B"] })),
      ...repeat(5, () => right({ topicTags: ["A"] })),
      ...repeat(4, () => right({ topicTags: ["D"] })),
      ...repeat(2, () => right({ topicTags: ["C"] })),
    ]);
    expect(a.topics.map((t) => t.topic)).toEqual(["A", "B", "D", "C"]);
    expect(a.topics[0]!.weight).toBe(5 / 16);
  });

  test("pending questions count in the total but not in what is graded", () => {
    const a = analyze([right(), qt({ isCorrect: null }), qt({ isCorrect: null })]);
    expect(a.topics[0]).toMatchObject({ total: 3, graded: 1, correct: 1, accuracy: 100 });
    const allPending = analyze([qt({ isCorrect: null })]);
    expect(allPending.topics[0]).toMatchObject({ total: 1, graded: 0, correct: 0, accuracy: null, badge: null });
  });

  test("accuracy sets the badge: 80% is a strength, under 60% needs review, between is neither", () => {
    const topic = (name: string, ok: number, bad: number) => [
      ...repeat(ok, () => right({ topicTags: [name] })),
      ...repeat(bad, () => wrong({ topicTags: [name] })),
    ];
    const a = analyze([...topic("Eighty", 4, 1), ...topic("Sixty", 3, 2), ...topic("Fifty", 1, 1), ...topic("Seventy5", 3, 1), ...topic("Fifty7", 4, 3)]);
    const badge = (name: string) => a.topics.find((t) => t.topic === name)!.badge;
    expect(badge("Eighty")).toBe("strength");
    expect(badge("Sixty")).toBeNull();
    expect(badge("Seventy5")).toBeNull();
    expect(badge("Fifty")).toBe("needs_review");
    expect(badge("Fifty7")).toBe("needs_review");
  });

  test("a right but slow topic is a hesitation zone, a right and quick one a strength", () => {
    const a = analyze([
      ...repeat(2, () => right({ topicTags: ["Slow"], timeTakenMs: 4000 })),
      ...repeat(4, () => right({ topicTags: ["Fast"], timeTakenMs: 1000 })),
    ]);
    const topic = (name: string) => a.topics.find((t) => t.topic === name)!;
    expect(topic("Slow")).toMatchObject({ badge: "hesitation", medianTimeMs: 4000 });
    expect(topic("Fast")).toMatchObject({ badge: "strength", medianTimeMs: 1000 });
  });

  test("slow at 70% is hesitation, slow under 60% still needs review, slow at 60-69% has no badge", () => {
    const slow = (name: string, ok: number, bad: number) => [
      ...repeat(ok, () => right({ topicTags: [name], timeTakenMs: 5000 })),
      ...repeat(bad, () => wrong({ topicTags: [name], timeTakenMs: 5000 })),
    ];
    const fast = repeat(20, () => right({ topicTags: ["Quick"], timeTakenMs: 500 }));
    const a = analyze([...fast, ...slow("S75", 3, 1), ...slow("S50", 1, 1), ...slow("S60", 3, 2)]);
    const badge = (name: string) => a.topics.find((t) => t.topic === name)!.badge;
    expect(badge("S75")).toBe("hesitation");
    expect(badge("S50")).toBe("needs_review");
    expect(badge("S60")).toBeNull();
  });
});

describe("weakest topic", () => {
  const topicsOf = (spec: Record<string, [number, number]>) =>
    analyze(Object.entries(spec).flatMap(([name, [ok, bad]]) => [...repeat(ok, () => right({ topicTags: [name] })), ...repeat(bad, () => wrong({ topicTags: [name] }))]));

  test("the least accurate topic under 80%", () => {
    expect(weakestTopic(topicsOf({ A: [3, 1], B: [1, 2], C: [4, 1] }))).toBe("B");
  });

  test("ties go to the topic with more questions", () => {
    expect(weakestTopic(topicsOf({ Small: [1, 1], Big: [2, 2] }))).toBe("Big");
  });

  test("none when every topic is at 80% or better, or nothing is graded", () => {
    expect(weakestTopic(topicsOf({ A: [4, 1], B: [3, 0] }))).toBeNull();
    expect(weakestTopic(analyze([]))).toBeNull();
    expect(weakestTopic(analyze([qt({ isCorrect: null })]))).toBeNull();
  });
});

// --- The coach ---

describe("coach context", () => {
  test("the score, the times and the counts are in plain numbers", () => {
    const a = analyze([
      right({ timeTakenMs: 1000 }),
      wrong({ timeTakenMs: 1000 }),
      right({ timeTakenMs: 4000 }),
      wrong({ timeTakenMs: 4000 }),
      right({ timeTakenMs: 2000 }),
    ]);
    const ctx = coachContext(a);
    expect(ctx.score).toBe("3/5 (60%)");
    expect(ctx.total_time_seconds).toBe(60);
    expect(ctx.avg_time_per_question_seconds).toBe(2);
    expect(ctx.fatigue_flag).toBe(false);
    expect(ctx.behavioral_counts).toEqual({ fluent_recall: 1, effortful_success: 1, impulsive_errors: 1, time_sinks: 1 });
  });

  test("an empty attempt scores 0/0", () => {
    const ctx = coachContext(analyze([]));
    expect(ctx.score).toBe("0/0 (0%)");
    expect(ctx.avg_time_per_question_seconds).toBeNull();
    expect(ctx.critical_misses).toEqual([]);
  });

  test("misses are the slowest first, at most five, with long text cut", () => {
    const misses = [100, 700, 300, 900, 500, 200, 800].map((ms) => wrong({ timeTakenMs: ms, prompt: `p${ms}` }));
    const ctx = coachContext(analyze(misses));
    expect(ctx.critical_misses.map((m) => m.prompt)).toEqual(["p900", "p800", "p700", "p500", "p300"]);
    const long = coachContext(analyze([wrong({ prompt: "x".repeat(400), userAnswer: "y".repeat(300), correctAnswer: "z".repeat(300) })])).critical_misses[0]!;
    expect(long.prompt).toHaveLength(300);
    expect(long.user_answer).toHaveLength(200);
    expect(long.correct_answer).toHaveLength(200);
    expect(long.prompt.endsWith("…")).toBe(true);
  });

  test("a miss without texts is described, and skipped questions are misses too", () => {
    const [m] = coachContext(analyze([qt({ isCorrect: false, skipped: true, topicTags: ["A", "B"] })])).critical_misses;
    expect(m).toMatchObject({ user_answer: "(no answer)", correct_answer: "(see explanation)", topic: "A, B", time_spent_s: null, quadrant: null });
  });

  test("strengths, weaknesses and hesitations list their topics with accuracy", () => {
    const a = analyze([
      ...repeat(5, () => right({ topicTags: ["Good"] })),
      ...repeat(2, () => wrong({ topicTags: ["Bad"] })),
    ]);
    const ctx = coachContext(a);
    expect(ctx.top_strengths).toEqual([{ topic: "Good", accuracy: "100%", median_time_s: null }]);
    expect(ctx.top_weaknesses).toEqual([{ topic: "Bad", accuracy: "0%", median_time_s: null }]);
    expect(ctx.hesitation_topics).toEqual([]);
  });
});

describe("fallback coach", () => {
  test("an empty attempt gets the plain template", () => {
    expect(fallbackCoach(analyze([]))).toEqual({
      headline: "Rebuild the foundations",
      narrativeAssessment: "You answered 0 of 0 correctly.\n\nNo pattern of rushed or stuck answers stood out.",
      primaryTakeaways: ["Retake the quiz later to check the gains hold."],
      recommendedDrillTopic: null,
    });
  });

  test("a strong session praises its strengths", () => {
    const report = fallbackCoach(analyze(repeat(10, () => right())));
    expect(report.headline).toBe("Strong, confident session");
    expect(report.narrativeAssessment).toBe("You were sure-footed in General.\n\nNo pattern of rushed or stuck answers stood out.");
    expect(report.primaryTakeaways).toEqual(["Keep your pace from General as your benchmark.", "Retake the quiz later to check the gains hold."]);
    expect(report.recommendedDrillTopic).toBeNull();
  });

  test("the headline steps at 85% and 60%", () => {
    const withAccuracy = (ok: number, bad: number) => fallbackCoach(analyze([...repeat(ok, () => right()), ...repeat(bad, () => wrong())])).headline;
    expect(withAccuracy(17, 3)).toBe("Strong, confident session");
    expect(withAccuracy(16, 4)).toBe("Solid base with room to sharpen");
    expect(withAccuracy(3, 2)).toBe("Solid base with room to sharpen");
    expect(withAccuracy(2, 3)).toBe("Rebuild the foundations, starting with General");
  });

  test("gaps are named, with a drill on the weakest topic", () => {
    const a = analyze([...repeat(5, () => right({ topicTags: ["A"] })), right({ topicTags: ["B"] }), ...repeat(2, () => wrong({ topicTags: ["B"] }))]);
    const report = fallbackCoach(a);
    expect(report.headline).toBe("Solid base, with gaps in B");
    expect(report.narrativeAssessment).toBe("You were sure-footed in A.\n\nB needs another look before the next assessment.");
    expect(report.primaryTakeaways).toEqual(["Practise B until it feels as quick as your best topics.", "Keep your pace from A as your benchmark.", "Retake the quiz later to check the gains hold."]);
    expect(report.recommendedDrillTopic).toBe("B");
  });

  test("several topics are listed with 'and' and take a plural verb", () => {
    const a = analyze([...repeat(5, () => right({ topicTags: ["A"] })), ...repeat(2, () => wrong({ topicTags: ["B"] })), ...repeat(2, () => wrong({ topicTags: ["C"] }))]);
    expect(fallbackCoach(a).narrativeAssessment).toContain("B and C need another look");
  });

  test("slow misses, quick misses and quick hits each add their line and takeaway", () => {
    const a = analyze([
      right({ timeTakenMs: 1000 }),
      wrong({ timeTakenMs: 1000 }),
      right({ timeTakenMs: 4000 }),
      wrong({ timeTakenMs: 4000 }),
      right({ timeTakenMs: 2000 }),
    ]);
    const report = fallbackCoach(a);
    expect(report.headline).toBe("Solid base with room to sharpen");
    expect(report.narrativeAssessment).toContain("came quickly and right: that recall is secure.");
    expect(report.narrativeAssessment).toContain("1 question took long and still went wrong");
    expect(report.narrativeAssessment).toContain("1 quick miss looks like misreading");
    expect(report.primaryTakeaways).toEqual([
      "Practise General until it feels as quick as your best topics.",
      "Review the explanations of the questions you spent longest on and missed.",
      "Read each question to the end before choosing an answer.",
    ]);
  });

  test("hesitation and fatigue are mentioned", () => {
    const a = analyze([
      ...repeat(2, () => right({ topicTags: ["Slow"], timeTakenMs: 4000 })),
      ...repeat(4, () => right({ topicTags: ["Fast"], timeTakenMs: 1000 })),
    ]);
    const report = fallbackCoach(a);
    expect(report.narrativeAssessment).toContain("In Slow you got there, but slowly");
    expect(report.primaryTakeaways).toContain("Use quick recall drills on Slow to turn hesitation into speed.");
    const tired = fallbackCoach(analyze([right({ timeTakenMs: 1000 }), right({ timeTakenMs: 1000 }), wrong({ timeTakenMs: 2000 }), wrong({ timeTakenMs: 2000 })]));
    expect(tired.narrativeAssessment).toContain("You slowed down and slipped in the second half");
  });

  test("never more than three takeaways, and the narrative has two paragraphs", () => {
    const a = analyze([
      right({ timeTakenMs: 1000 }),
      wrong({ timeTakenMs: 1000 }),
      right({ timeTakenMs: 4000 }),
      wrong({ timeTakenMs: 4000 }),
      right({ timeTakenMs: 2000 }),
    ]);
    const report = fallbackCoach(a);
    expect(report.primaryTakeaways.length).toBeLessThanOrEqual(3);
    expect(report.narrativeAssessment.split("\n\n")).toHaveLength(2);
  });

  test("the template always fits the word limit", () => {
    const a = analyze([
      right({ timeTakenMs: 1000 }),
      wrong({ timeTakenMs: 1000 }),
      right({ timeTakenMs: 4000 }),
      wrong({ timeTakenMs: 4000 }),
    ]);
    const report = fallbackCoach(a);
    expect(fitCoachReport(report, ["General"])).toEqual(report);
  });
});

describe("fitCoachReport", () => {
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  const total = (r: CoachReport) => words(r.headline) + words(r.narrativeAssessment) + r.primaryTakeaways.reduce((s, t) => s + words(t), 0);
  const sentence = (count: number, word = "w") => Array.from({ length: count }, () => word).join(" ");

  test("a report within the limits is left as it is", () => {
    const report = { headline: "A short headline", narrativeAssessment: "One.\n\nTwo.", primaryTakeaways: ["a", "b", "c"], recommendedDrillTopic: "Algebra" };
    expect(fitCoachReport(report, ["Algebra"])).toEqual(report);
  });

  test("the headline is cut at 12 words and takeaways at 3 of 20 words", () => {
    const out = fitCoachReport(
      { headline: sentence(20), narrativeAssessment: "x", primaryTakeaways: [sentence(30), "two", "three", "four"], recommendedDrillTopic: null },
      [],
    );
    expect(words(out.headline)).toBe(12);
    expect(out.headline.endsWith("…")).toBe(true);
    expect(out.primaryTakeaways).toHaveLength(3);
    expect(words(out.primaryTakeaways[0]!)).toBe(20);
    expect(out.primaryTakeaways.slice(1)).toEqual(["two", "three"]);
  });

  test("empty takeaways are dropped and spacing is tidied", () => {
    const out = fitCoachReport(
      { headline: "  Many   spaces ", narrativeAssessment: "a  b\n\n c", primaryTakeaways: ["", "  ", "keep   this"], recommendedDrillTopic: null },
      [],
    );
    expect(out.headline).toBe("Many spaces");
    expect(out.primaryTakeaways).toEqual(["keep this"]);
    expect(out.narrativeAssessment).toBe("a b\n\nc");
  });

  test("a long narrative is cut so the takeaways keep their place, and the whole fits the limit", () => {
    const out = fitCoachReport(
      { headline: "Three word headline", narrativeAssessment: `${sentence(200)}\n\n${sentence(200)}`, primaryTakeaways: [sentence(5), sentence(5), sentence(5)], recommendedDrillTopic: null },
      [],
    );
    expect(out.primaryTakeaways.map(words)).toEqual([5, 5, 5]);
    expect(out.narrativeAssessment.split("\n\n")).toHaveLength(1);
    expect(total(out)).toBeLessThanOrEqual(coachMaxWords);
    expect(out.narrativeAssessment.endsWith("…")).toBe(true);
  });

  test("a second paragraph gets what the first leaves, and a third is dropped", () => {
    const out = fitCoachReport(
      { headline: "H", narrativeAssessment: `${sentence(10)}\n\n${sentence(300)}\n\nthird`, primaryTakeaways: [], recommendedDrillTopic: null },
      [],
    );
    const paragraphs = out.narrativeAssessment.split("\n\n");
    expect(paragraphs).toHaveLength(2);
    expect(words(paragraphs[0]!)).toBe(10);
    expect(words(paragraphs[1]!)).toBe(coachMaxWords - 1 - 10);
    expect(total(out)).toBeLessThanOrEqual(coachMaxWords);
  });

  test("the drill topic must be one the session had", () => {
    const report = { headline: "H", narrativeAssessment: "N", primaryTakeaways: [], recommendedDrillTopic: "Made up" };
    expect(fitCoachReport(report, ["Real"]).recommendedDrillTopic).toBeNull();
    expect(fitCoachReport({ ...report, recommendedDrillTopic: "Real" }, ["Real"]).recommendedDrillTopic).toBe("Real");
    expect(fitCoachReport({ ...report, recommendedDrillTopic: "" }, [""]).recommendedDrillTopic).toBeNull();
    expect(fitCoachReport({ ...report, recommendedDrillTopic: null }, ["Real"]).recommendedDrillTopic).toBeNull();
  });
});
