import { describe, expect, test } from "bun:test";
import type { Actor } from "../auth/Session.ts";
import { harness } from "../../testing/config.ts";
import { answerItem, attemptItem, exam, questionRow, sessionItem } from "../../testing/session-rows.ts";
import { teacher, intruder, otherOrganization, sessionWorld, type SessionWorldOptions } from "../../testing/session-world.ts";
import { SessionReports } from "./Reports.ts";

const setup = (options: SessionWorldOptions = {}) => {
  const world = sessionWorld(options);
  return { ...world, ...harness(world.layer) };
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

describe("SessionReports.grade", () => {
  const submitted = attemptItem({ id: "att1", sessionId: "sess1", status: "needs_grading", submittedAt: minutesAgo(5) });
  const base = (over: SessionWorldOptions = {}): SessionWorldOptions => ({
    attempts: [submitted],
    questions: [questionRow("q1", 4)],
    answers: [answerItem("att1", "q1", { value: "b", autoScore: 1 })],
    ...over,
  });
  const grade = (manualScore: number | null, feedback: string | null = null, reason?: string, actor: Actor = teacher) =>
    SessionReports.use((r) => r.grade(actor, { attemptId: "att1", questionId: "q1", manualScore, feedback, ...(reason === undefined ? {} : { reason }) }));

  test("the teacher's score is stored in points, never above what the question is worth or below zero", async () => {
    const { run, state } = setup(base());
    await run(grade(99));
    await run(grade(-3));
    expect(state.grades.map((g) => g.manualScore)).toEqual([4, 0]);
  });

  test("clearing the score (null) stores null so the automatic score applies again", async () => {
    const { run, state } = setup(base());
    await run(grade(null));
    expect(state.grades[0]!.manualScore).toBeNull();
  });

  test("blank feedback is stored as none", async () => {
    const { run, state } = setup(base());
    await run(grade(2, "   "));
    await run(grade(2, "Well argued"));
    expect(state.grades.map((g) => g.feedback)).toEqual([null, "Well argued"]);
  });

  test("another teacher's attempt, or a question that isn't in the quiz, is NotFound and nothing is stored", async () => {
    const { fail, state } = setup(base());
    expect((await fail(grade(2, null, undefined, intruder)))._tag).toBe("NotFound");
    const missing = await fail(SessionReports.use((r) => r.grade(teacher, { attemptId: "att1", questionId: "nope", manualScore: 1, feedback: null })));
    expect(missing._tag).toBe("NotFound");
    expect(state.grades).toEqual([]);
  });

  test("a quiz can be regraded after the results are out without a reason", async () => {
    const { run, state } = setup(base());
    await run(grade(1));
    expect(state.grades[0]!.change).toBeNull();
  });

  describe("in an exam whose results are out", () => {
    const released = base({ sessions: [sessionItem({ mode: "exam", exam, resultsRelease: "immediately" })] });

    test("changing a score needs a reason, and without one nothing is stored", async () => {
      const { fail, state } = setup(released);
      const err = await fail(grade(1));
      expect(err).toMatchObject({ _tag: "Conflict" });
      expect((await fail(grade(1, null, "   ")))._tag).toBe("Conflict");
      expect(state.grades).toEqual([]);
    });

    test("the change is logged with who made it, the old and new score and the trimmed reason", async () => {
      const { run, state } = setup(released);
      await run(grade(1, null, "  Misread the rubric "));
      expect(state.grades[0]!.change).toEqual({ changedBy: "teacher1", oldScore: 4, newScore: 1, reason: "Misread the rubric" });
    });

    test("a score that ends up the same needs no reason and logs nothing", async () => {
      // The automatic score is the full 4 points, so giving 4 changes nothing.
      const { run, state } = setup(released);
      await run(grade(4));
      expect(state.grades[0]!.change).toBeNull();
    });

    test("feedback alone can change without a reason", async () => {
      const { run, state } = setup(released);
      await run(grade(4, "Nice"));
      expect(state.grades[0]).toMatchObject({ feedback: "Nice", change: null });
    });
  });

  test("an exam whose results are still held can be graded freely", async () => {
    const { run, state } = setup(base({ sessions: [sessionItem({ mode: "exam", exam, resultsRelease: "manual" })] }));
    await run(grade(1));
    expect(state.grades[0]!.change).toBeNull();
  });

  test("an exam attempt still in progress can be scored freely", async () => {
    const { run, state } = setup(
      base({ sessions: [sessionItem({ mode: "exam", exam })], attempts: [attemptItem({ id: "att1", sessionId: "sess1" })] }),
    );
    await run(grade(1));
    expect(state.grades[0]!.change).toBeNull();
  });
});

describe("SessionReports.classScores", () => {
  const done = (id: string, studentId: string, minutes: number) =>
    attemptItem({ id, sessionId: "sess1", studentId, status: "graded", submittedAt: minutesAgo(minutes) });

  test("each student's latest submitted attempt counts, in points", async () => {
    const { run } = setup({
      attempts: [done("old", "s1", 60), done("new", "s1", 10)],
      answers: [
        answerItem("old", "q1", { autoScore: 0 }),
        answerItem("new", "q1", { autoScore: 1 }),
        answerItem("new", "q2", { manualScore: 3 }),
      ],
    });
    const [session] = await run(SessionReports.use((r) => r.classScores(teacher, "class1")));
    expect(session!.maxScore).toBe(7);
    expect(session!.scores).toHaveLength(1);
    expect(session!.scores[0]).toMatchObject({ studentId: "roster-s1", score: 5 });
  });

  test("a student whose essay isn't graded yet has no score rather than a partial one", async () => {
    const { run } = setup({
      attempts: [done("a", "s1", 10), done("b", "s2", 10)],
      answers: [
        answerItem("a", "q1", { autoScore: 1 }),
        answerItem("a", "q2", { manualScore: 5 }),
        answerItem("b", "q1", { autoScore: 1 }),
        answerItem("b", "q2", { value: "essay text" }),
      ],
    });
    const [session] = await run(SessionReports.use((r) => r.classScores(teacher, "class1")));
    expect(session!.scores.map((s) => [s.studentId, s.score])).toEqual([
      ["roster-s1", 7],
      ["roster-s2", null],
    ]);
  });

  test("attempts still in progress aren't in the table, and the session reports its clock status", async () => {
    const { run } = setup({
      sessions: [sessionItem({ closesAt: minutesAgo(1) })],
      attempts: [attemptItem({ id: "open", sessionId: "sess1", studentId: "s1" })],
    });
    const [session] = await run(SessionReports.use((r) => r.classScores(teacher, "class1")));
    expect(session!.scores).toEqual([]);
    expect(session!.status).toBe("ended");
  });
});

describe("SessionReports ownership", () => {
  test("the attempts of someone else's session and a single attempt of it are NotFound", async () => {
    const { fail } = setup({ attempts: [attemptItem({ id: "att1", sessionId: "sess1" })] });
    expect((await fail(SessionReports.use((r) => r.attempts(intruder, "sess1"))))._tag).toBe("NotFound");
    expect((await fail(SessionReports.use((r) => r.liveAttempt(intruder, "att1"))))._tag).toBe("NotFound");
  });
});

describe("SessionReports across organizations", () => {
  test("a session and an attempt of another organization are NotFound for the teacher working in a different one", async () => {
    const { fail } = setup({ attempts: [attemptItem({ id: "att1", sessionId: "sess1", status: "needs_grading" })] });
    expect((await fail(SessionReports.use((r) => r.attempts(otherOrganization, "sess1"))))._tag).toBe("NotFound");
    expect((await fail(SessionReports.use((r) => r.liveAttempt(otherOrganization, "att1"))))._tag).toBe("NotFound");
    const graded = SessionReports.use((r) => r.grade(otherOrganization, { attemptId: "att1", questionId: "q1", manualScore: 2, feedback: null }));
    expect((await fail(graded))._tag).toBe("NotFound");
  });
});
