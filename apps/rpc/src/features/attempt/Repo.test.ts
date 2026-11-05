// The attempt Repo's write rules against a real Postgres: what a save keeps, when it counts as too fast, the limit on
// marked questions, and who wins a submit.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { tooFastMs } from "@examinus/domain/integrity";
import type { AnswerValue } from "@examinus/domain/quiz";
import { asc, eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import {
  answerHistory,
  answers,
  attempts,
  integrityEvents,
  questions,
  quizSessions,
  quizzes,
  sessionStudents,
  type AttemptItem,
  type QuizSessionItem,
} from "../../database/schemas/index.ts";
import { testPostgres } from "../../testing/postgres.ts";
import { answerRow, attemptRow, questionRow, quizRow, sessionRow } from "../../testing/rows.ts";
import { seedOrganizations, seedPart, seedUsers } from "../../testing/seed.ts";
import { choiceQuestion, essayQuestion } from "../../testing/session-rows.ts";
import { AttemptRepo, type GradedAnswer, type SubmitWrite } from "./Repo.ts";

const pg = await testPostgres();
const { db } = pg;
afterAll(() => pg.close());

const repoLayer = AttemptRepo.layer.pipe(Layer.provide(pg.layer));
const run = <A>(use: (repo: AttemptRepo["Service"]) => Effect.Effect<A>) =>
  Effect.runPromise(AttemptRepo.use(use).pipe(Effect.provide(repoLayer)));

const now = new Date("2026-03-02T09:00:00.000Z");

// A quiz of two questions (q1 multiple choice, q2 essay) with one session and one attempt by student1 in progress.
const seed = async (session: Partial<QuizSessionItem> = {}) => {
  await seedOrganizations(db, "org1");
  await seedUsers(db, "teacher1", "student1");
  await db.insert(quizzes).values(quizRow({ id: "quiz1", ownerId: "teacher1", organizationId: "org1" }));
  await seedPart(db, "quiz1", "part1");
  await db.insert(questions).values([questionRow({ id: "q1", partId: "part1", position: 0 }), questionRow({ id: "q2", partId: "part1", position: 1 })]);
  await db.insert(quizSessions).values(sessionRow({ id: "sess1", quizId: "quiz1", mode: "quiz", ...session }));
  await db.insert(attempts).values(attemptRow({ id: "att1", sessionId: "sess1", studentId: "student1" }));
};

const sessionOf = async (): Promise<QuizSessionItem> => (await db.select().from(quizSessions).where(eq(quizSessions.id, "sess1")))[0]!;
const attemptOf = async (): Promise<AttemptItem> => (await db.select().from(attempts).where(eq(attempts.id, "att1")))[0]!;
const historyOf = async () => (await db.select().from(answerHistory).orderBy(asc(answerHistory.savedAt), asc(answerHistory.questionId)));
const eventsOf = async () => (await db.select().from(integrityEvents).orderBy(asc(integrityEvents.at)));
const answersOf = async () => (await db.select().from(answers).orderBy(asc(answers.questionId)));

beforeEach(async () => {
  await pg.reset();
});

const save = (over: { value: AnswerValue; spentMs?: number | null; at?: Date; mode?: QuizSessionItem["mode"] }) =>
  run((repo) =>
    repo.saveAnswer({
      attemptId: "att1",
      mode: over.mode ?? "quiz",
      question: choiceQuestion(),
      value: over.value,
      typing: undefined,
      spentMs: over.spentMs === undefined ? 10_000 : over.spentMs,
      now: over.at ?? now,
    }),
  );

describe("saveAnswer", () => {
  test("a quiz or exam keeps every save in the history and the latest as the answer", async () => {
    await seed();
    await save({ value: ["a"], at: new Date(now.getTime() + 1000) });
    await save({ value: ["b"], at: new Date(now.getTime() + 2000) });

    expect((await answersOf()).map((a) => a.value)).toEqual([["b"]]);
    expect((await historyOf()).map((h) => h.value)).toEqual([["a"], ["b"]]);
  });

  test("mastery and games keep no history", async () => {
    await seed({ mode: "mastery" });
    await save({ value: ["a"], mode: "mastery" });
    await save({ value: ["b"], mode: "mastery" });

    expect((await answersOf()).map((a) => a.value)).toEqual([["b"]]);
    expect(await historyOf()).toEqual([]);
  });

  test("the first real answer given faster than anyone can read records a too_fast event", async () => {
    await seed();
    await save({ value: ["a"], spentMs: tooFastMs - 1 });

    expect(await eventsOf()).toMatchObject([{ attemptId: "att1", type: "too_fast", durationMs: tooFastMs - 1 }]);
  });

  test("a changed answer, a slow one, a blank one and an unknown time record nothing", async () => {
    await seed();
    await save({ value: [""], spentMs: 100 });
    await save({ value: ["a"], spentMs: tooFastMs });
    await save({ value: ["b"], spentMs: null });
    await save({ value: ["a"], spentMs: 100 });

    // The last save is not the first answer: ["b"] already stood.
    expect(await eventsOf()).toEqual([]);
  });

  test("the time spent is kept when a later save does not know it", async () => {
    await seed();
    await save({ value: ["a"], spentMs: 4000 });
    await save({ value: ["b"], spentMs: null });

    expect((await answersOf()).map((a) => a.timeSpentMs)).toEqual([4000]);
  });
});

describe("setMark", () => {
  const mark = (questionId: string, marked: boolean, max: number | null, onPaper = ["q1", "q2", "q3"]) =>
    run((repo) => repo.setMark({ attemptId: "att1", questionId, marked, onPaper: new Set(onPaper), max }));
  const marked = async () => (await answersOf()).filter((a) => a.markedForReview).map((a) => a.questionId);

  test("marks up to the limit and refuses the next", async () => {
    await seed();
    expect(await mark("q1", true, 1)).toBe(true);
    expect(await mark("q2", true, 1)).toBe(false);

    expect(await marked()).toEqual(["q1"]);
  });

  test("marking an already marked question stays within the limit, and unmarking frees a place", async () => {
    await seed();
    await mark("q1", true, 1);
    expect(await mark("q1", true, 1)).toBe(true);
    expect(await mark("q1", false, 1)).toBe(true);
    expect(await mark("q2", true, 1)).toBe(true);

    expect(await marked()).toEqual(["q2"]);
  });

  test("marks on questions that are not on the student's paper do not count", async () => {
    await seed();
    await mark("q1", true, 1, ["q1", "q2"]);

    expect(await mark("q2", true, 1, ["q2"])).toBe(true);
  });

  test("without a limit every question can be marked, and marking keeps the answer given", async () => {
    await seed();
    await save({ value: ["a"] });
    await mark("q1", true, null);
    await mark("q2", true, null);

    expect(await marked()).toEqual(["q1", "q2"]);
    expect((await answersOf())[0]!.value).toEqual(["a"]);
  });

  test("two marks at once cannot both slip under the limit", async () => {
    await seed();
    const results = await Promise.all([mark("q1", true, 1), mark("q2", true, 1)]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await marked()).toHaveLength(1);
  });
});

describe("submit", () => {
  const graded = (value1: AnswerValue, value2: AnswerValue): GradedAnswer[] => [
    { q: choiceQuestion(), value: value1, results: null, auto: 1 },
    { q: essayQuestion(), value: value2, results: null, auto: null },
  ];
  const submit = async (over: Partial<SubmitWrite> = {}) =>
    run((repo) =>
      repo.submit({
        attempt: attemptRow({ id: "att1", sessionId: "sess1", studentId: "student1" }),
        session: sessionRow({ id: "sess1", mode: "quiz" }),
        status: "needs_grading",
        now,
        graded: graded(["b"], "An essay."),
        saved: new Map(),
        typing: undefined,
        events: [],
        ...over,
      }),
    );

  test("stores the status, the graded answers and the integrity events", async () => {
    await seed();
    const won = await submit({ events: [{ type: "left_page", at: now.toISOString(), durationMs: 1500 }] });

    expect(won).toBe(true);
    expect(await attemptOf()).toMatchObject({ status: "needs_grading", submittedAt: now });
    expect(await answersOf()).toMatchObject([
      { questionId: "q1", value: ["b"], correct: true, autoScore: 1 },
      { questionId: "q2", value: "An essay.", correct: null, autoScore: null },
    ]);
    expect(await eventsOf()).toMatchObject([{ type: "left_page", durationMs: 1500 }]);
  });

  test("the first submit wins: a second changes nothing", async () => {
    await seed();
    const later = new Date(now.getTime() + 60_000);

    expect(await submit()).toBe(true);
    expect(
      await submit({
        status: "graded",
        now: later,
        graded: graded(["a"], "Changed."),
        events: [{ type: "left_page", at: later.toISOString() }],
      }),
    ).toBe(false);

    expect(await attemptOf()).toMatchObject({ status: "needs_grading", submittedAt: now });
    expect((await answersOf()).map((a) => a.value)).toEqual([["b"], "An essay."]);
    expect(await eventsOf()).toEqual([]);
  });

  test("a quiz or exam keeps the final answer in the history when it differs from the last autosave", async () => {
    await seed();
    // q1 was autosaved as "a" and ends as "b"; q2 ends as it was saved.
    await save({ value: ["a"] });
    const saved = new Map([
      ["q1", answerRow({ questionId: "q1", value: ["a"] })],
      ["q2", answerRow({ questionId: "q2", value: "An essay." })],
    ]);
    await submit({ saved });

    expect((await historyOf()).map((h) => [h.questionId, h.value])).toEqual([
      ["q1", ["a"]],
      ["q1", ["b"]],
    ]);
  });

  test("mastery keeps no history of the final answers", async () => {
    await seed({ mode: "mastery" });
    await submit({ session: sessionRow({ id: "sess1", mode: "mastery" }) });

    expect(await historyOf()).toEqual([]);
    expect(await answersOf()).toHaveLength(2);
  });

  test("a final answer replaces the saved one, keeping the time spent and the mark", async () => {
    await seed();
    await save({ value: ["a"], spentMs: 5000 });
    await run((repo) => repo.setMark({ attemptId: "att1", questionId: "q1", marked: true, onPaper: new Set(["q1"]), max: null }));
    await submit();

    expect(await answersOf()).toMatchObject([{ questionId: "q1", value: ["b"], timeSpentMs: 5000, markedForReview: true }, { questionId: "q2" }]);
  });
});

describe("which quizzes a student reaches", () => {
  // student1 is on the roster of sess1, whose quiz is in org1, and has an attempt on it.
  const onRoster = async () => {
    await seed();
    await db.insert(sessionStudents).values({ sessionId: "sess1", studentId: "student1" });
  };
  const reach = (organizationId: string | null) => {
    const player = { id: "student1", organizationId };
    return run((repo) =>
      Effect.gen(function* () {
        return {
          session: (yield* repo.rosterSession("sess1", player)) !== null,
          roster: (yield* repo.roster(player)).length,
          attempt: (yield* repo.ownAttempt("att1", player)) !== null,
        };
      }),
    );
  };

  test("a student in the quiz's organization reaches its session, roster entry and attempt", async () => {
    await onRoster();
    expect(await reach("org1")).toEqual({ session: true, roster: 1, attempt: true });
  });

  test("a student working in another organization reaches none of it", async () => {
    await onRoster();
    await seedOrganizations(db, "org2");
    expect(await reach("org2")).toEqual({ session: false, roster: 0, attempt: false });
  });

  test("a student without an organization (a guest) reaches the quiz of any", async () => {
    await onRoster();
    expect(await reach(null)).toEqual({ session: true, roster: 1, attempt: true });
  });

  test("a quiz in a teacher's personal space is reached through its session's roster", async () => {
    await onRoster();
    await db.update(quizzes).set({ organizationId: null }).where(eq(quizzes.id, "quiz1"));
    expect(await reach(null)).toEqual({ session: true, roster: 1, attempt: true });
    expect(await reach("org1")).toEqual({ session: false, roster: 0, attempt: false });
  });

  test("a student the teacher removed from the session no longer reaches it", async () => {
    await onRoster();
    await db.update(sessionStudents).set({ removedAt: now });
    expect(await reach("org1")).toEqual({ session: false, roster: 0, attempt: true });
  });
});
