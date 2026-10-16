import { describe, expect, test } from "bun:test";
import type { Question } from "@examinus/domain/question";
import { Effect } from "effect";
import { attemptWorld, player, type WorldOptions } from "../../testing/attempt-world.ts";
import { harness } from "../../testing/config.ts";
import { answerItem, attemptItem, choiceQuestion } from "../../testing/session-rows.ts";
import { Results } from "./Results.ts";

const setup = (options: WorldOptions = {}) => {
  const world = attemptWorld(options);
  return { ...world, ...harness(world.layer) };
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const submitted = (over: Parameters<typeof attemptItem>[0] = {}) =>
  attemptItem({ id: "done", status: "needs_grading", startedAt: minutesAgo(20), submittedAt: minutesAgo(10), ...over });

const latest = (userId = "student1") =>
  Effect.gen(function* () {
    return yield* (yield* Results).latest("sess1", player(userId));
  });
const myScores = Effect.gen(function* () {
  return yield* (yield* Results).myScores(player("student1"));
});

describe("Results.latest", () => {
  test("a student who isn't on the roster has no such session", async () => {
    const { fail } = setup();
    expect((await fail(latest("stranger")))._tag).toBe("NotFound");
  });

  test("an attempt still in progress is not a result", async () => {
    const { run } = setup({ attempts: [attemptItem({ id: "open" })] });
    const { last, result } = await run(latest());
    expect(last).toBeUndefined();
    expect(result).toMatchObject({ visible: false, summary: null, items: [], attemptsUsed: 1, submittedAt: null });
  });

  test("held results show nothing of the paper: no score, no questions, no answers", async () => {
    const { run } = setup({
      session: { resultsRelease: "manual" },
      attempts: [submitted()],
      answers: [answerItem("done", "q1", { value: "b", autoScore: 1 })],
    });
    const { last, result } = await run(latest());
    expect(last?.id).toBe("done");
    expect(result).toMatchObject({ visible: false, summary: null, items: [], paperVersion: expect.any(String) });
  });

  test("released results list every question with the student's points, and essays wait for the teacher", async () => {
    const { run } = setup({
      session: { resultsRelease: "manual", resultsReleased: true },
      attempts: [submitted()],
      answers: [answerItem("done", "q1", { value: "b", autoScore: 1, feedback: "Good" }), answerItem("done", "q2", { value: "essay text" })],
    });
    const { result } = await run(latest());
    expect(result.visible).toBe(true);
    expect(result.summary).toEqual({ score: 2, max: 7, pendingEssays: 1 });
    expect(result.items.map((i) => [i.question.id, i.answer, i.points, i.feedback])).toEqual([
      ["q1", "b", 2, "Good"],
      ["q2", "essay text", null, ""],
    ]);
  });

  test("the released result carries the question's answers but none of its grading secrets (issue #14)", async () => {
    const codeQ: Question = {
      id: "qc",
      prompt: "Write it",
      points: 4,
      gamePoints: "standard",
      partialCredit: false,
      type: "code",
      language: "python",
      starterCode: "print()",
      tests: [
        { id: "shown", input: "1", expectedOutput: "one", hidden: false },
        { id: "secret", input: "2", expectedOutput: "HIDDEN-ANSWER", hidden: true },
      ],
      rubric: "teacher-only grading notes",
    };
    const { run } = setup({
      session: { resultsRelease: "immediately" },
      attempts: [submitted({ status: "graded" })],
      questions: [codeQ],
      answers: [answerItem("done", "qc", { value: "print(1)", manualScore: 4 })],
    });
    const { result } = await run(latest());
    const q = result.items[0]!.question;
    expect(q.type).toBe("code");
    expect("rubric" in q).toBe(false);
    if (q.type === "code") expect(q.tests.every((t) => !t.hidden)).toBe(true);
    // Nothing a student could mine: no hidden test's expected output, no rubric.
    expect(JSON.stringify(result)).not.toContain("HIDDEN-ANSWER");
    expect(JSON.stringify(result)).not.toContain("teacher-only grading notes");
  });

  test("a question the student never touched scores 0, and a teacher's score wins over the automatic one", async () => {
    const { run } = setup({
      session: { resultsRelease: "immediately" },
      attempts: [submitted({ status: "graded" })],
      questions: [choiceQuestion("q1"), choiceQuestion("q3")],
      answers: [answerItem("done", "q1", { value: "a", autoScore: 0, manualScore: 1.5 })],
    });
    const { result } = await run(latest());
    expect(result.items.map((i) => i.points)).toEqual([1.5, 0]);
    expect(result.summary).toEqual({ score: 1.5, max: 4, pendingEssays: 0 });
  });

  test("results released after the close stay hidden while the session runs and show once it ended", async () => {
    const running = setup({ session: { resultsRelease: "after_close" }, attempts: [submitted()] });
    expect((await running.run(latest())).result.visible).toBe(false);
    const ended = setup({ session: { resultsRelease: "after_close", status: "ended", endedAt: new Date() }, attempts: [submitted()] });
    expect((await ended.run(latest())).result.visible).toBe(true);
  });

  test("with several attempts the result is the latest submitted one, not the one in progress", async () => {
    const first = submitted({ id: "first", attemptNumber: 1, submittedAt: minutesAgo(60) });
    const second = submitted({ id: "second", attemptNumber: 2, submittedAt: minutesAgo(30) });
    const third = attemptItem({ id: "third", attemptNumber: 3 });
    const { run } = setup({ session: { attemptsAllowed: null }, attempts: [first, second, third] });
    const { last, result } = await run(latest());
    expect(last?.id).toBe("second");
    expect(result.attemptsUsed).toBe(3);
  });
});

describe("Results.myScores", () => {
  test("a student with nothing on their roster has no scores", async () => {
    const { run } = setup({ roster: [] });
    expect(await run(myScores)).toEqual([]);
  });

  test("a session not attempted yet shows no score and nothing pending", async () => {
    const { run } = setup();
    const [row] = await run(myScores);
    expect(row).toMatchObject({ sessionId: "sess1", attempted: false, score: null, pending: false, maxScore: 7, closed: false });
  });

  test("a submission waiting for the teacher is pending with no score, even when results are visible", async () => {
    const { run } = setup({ attempts: [submitted()], answers: [answerItem("done", "q1", { value: "b", autoScore: 1 }), answerItem("done", "q2", { value: "x" })] });
    const [row] = await run(myScores);
    expect(row).toMatchObject({ attempted: true, score: null, pending: true });
  });

  test("a fully graded submission shows its score once released and is pending while held", async () => {
    const options = {
      attempts: [submitted({ status: "graded" })],
      questions: [choiceQuestion("q1")],
      answers: [answerItem("done", "q1", { value: "b", autoScore: 1 })],
    };
    const shown = setup({ ...options, session: { resultsRelease: "immediately" } });
    expect((await shown.run(myScores))[0]).toMatchObject({ score: 2, pending: false });
    const held = setup({ ...options, session: { resultsRelease: "manual" } });
    expect((await held.run(myScores))[0]).toMatchObject({ score: null, pending: true });
  });

  test("a session past its close is reported closed", async () => {
    const { run } = setup({ session: { closesAt: minutesAgo(5) } });
    expect((await run(myScores))[0]!.closed).toBe(true);
  });
});
