import { describe, expect, test } from "bun:test";
import { AiFailed } from "@examinus/contract/ai";
import type { CoachReport, CoachResult } from "@examinus/domain/analytics";
import { Effect } from "effect";
import { limits, RateLimiter } from "../../platform/RateLimiter.ts";
import { attemptWorld, type WorldOptions } from "../../testing/attempt-world.ts";
import { harness } from "../../testing/config.ts";
import { answerItem, attemptItem, choiceQuestion } from "../../testing/session-rows.ts";
import { Coach } from "./Coach.ts";

const setup = (options: WorldOptions = {}) => {
  const world = attemptWorld({
    questions: [choiceQuestion("q1")],
    ...options,
  });
  return { ...world, ...harness(world.layer) };
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const graded = (over: Parameters<typeof attemptItem>[0] = {}) =>
  attemptItem({ id: "done", status: "graded", startedAt: minutesAgo(20), submittedAt: minutesAgo(10), ...over });
const answers = [answerItem("done", "q1", { value: "b", autoScore: 1 })];

const coach = Effect.gen(function* () {
  return yield* (yield* Coach).coach("sess1", "student1");
});

const aiReport: CoachReport = {
  headline: "Nice work",
  narrativeAssessment: "You did well.",
  primaryTakeaways: ["Keep going"],
  recommendedDrillTopic: null,
};

describe("Coach.coach", () => {
  test("until the results show there is nothing to coach on, and the model is not asked", async () => {
    const { fail, state, ai } = setup({ session: { resultsRelease: "manual" }, attempts: [graded()], answers });
    ai.coach = () => Effect.die(new Error("the model must not be asked"));
    expect((await fail(coach))._tag).toBe("NotFound");
    expect(state.coachReports).toEqual([]);
  });

  test("a student with no submitted attempt has no report", async () => {
    const { fail } = setup({ attempts: [attemptItem({ id: "open" })] });
    expect((await fail(coach))._tag).toBe("NotFound");
  });

  test("the model's report is cut to fit, marked as AI, and kept against the score it was written for", async () => {
    const { run, state, ai } = setup({ attempts: [graded()], answers });
    ai.coach = () => Effect.succeed({ ...aiReport, recommendedDrillTopic: "not a topic of this session" });
    const result = await run(coach);
    expect(result.source).toBe("ai");
    expect(result.report.headline).toBe("Nice work");
    expect(result.report.recommendedDrillTopic).toBeNull();
    expect(state.coachReports).toEqual([{ attemptId: "done", key: "done:2/2/0" }]);
  });

  test("a stored report for the same score is returned without asking the model again", async () => {
    const stored: CoachResult = { report: aiReport, source: "ai", generatedAt: "2026-03-02T08:00:00.000Z" };
    const { run, state, ai } = setup({ attempts: [graded({ coachReport: { key: "done:2/2/0", result: stored } })], answers });
    ai.coach = () => Effect.die(new Error("the model must not be asked"));
    expect(await run(coach)).toEqual(stored);
    expect(state.coachReports).toEqual([]);
  });

  test("a report written for another score (a regrade) is written again", async () => {
    const stale: CoachResult = { report: aiReport, source: "ai", generatedAt: "2026-03-01T08:00:00.000Z" };
    const { run, state, ai } = setup({ attempts: [graded({ coachReport: { key: "done:0/2/0", result: stale } })], answers });
    ai.coach = () => Effect.succeed({ ...aiReport, headline: "Fresh take" });
    const result = await run(coach);
    expect(result.report.headline).toBe("Fresh take");
    expect(state.coachReports).toEqual([{ attemptId: "done", key: "done:2/2/0" }]);
  });

  test("when the model fails the rule-based report stands in and is not stored, so the next visit tries again", async () => {
    const { run, state, ai } = setup({ attempts: [graded()], answers });
    ai.coach = () => Effect.fail(new AiFailed({ message: "no key" }));
    const result = await run(coach);
    expect(result.source).toBe("rules");
    expect(result.report.headline.length).toBeGreaterThan(0);
    expect(state.coachReports).toEqual([]);
  });

  test("too many asks fall back to the rule-based report without calling the model", async () => {
    const { run, ai, limiter, state } = setup({ attempts: [graded()], answers });
    let asked = 0;
    ai.coach = () => Effect.sync(() => (asked++, aiReport));
    // The student has used the whole allowance.
    for (let i = 0; i < limits.aiCoach.max; i++) await run(RateLimiter.use((l) => l.count(limits.aiCoach, "student1")));
    expect(limiter.used(limits.aiCoach, "student1")).toBe(limits.aiCoach.max);
    const result = await run(coach);
    expect(result.source).toBe("rules");
    expect(asked).toBe(0);
    expect(state.coachReports).toEqual([]);
  });
});
