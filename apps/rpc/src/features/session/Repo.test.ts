// The session Repo's rules against a real Postgres: who is on a session's roster (in an organization and in the
// personal space, where the organization is null) and what the teacher may set for them.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { noAccommodations } from "@examinus/domain/accommodations";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { answers, attempts, gradeChanges, questions, quizSessions, quizzes, sessionStudents, students, type QuizSessionItem } from "../../database/schemas/index.ts";
import { testPostgres } from "../../testing/postgres.ts";
import { attemptRow, questionRow, quizRow, sessionRow } from "../../testing/rows.ts";
import { seedOrganizations, seedPart, seedUsers } from "../../testing/seed.ts";
import { SessionRepo } from "./Repo.ts";

const pg = await testPostgres();
const { db } = pg;
afterAll(() => pg.close());

const repoLayer = SessionRepo.layer.pipe(Layer.provide(pg.layer));
const run = <A>(use: (repo: SessionRepo["Service"]) => Effect.Effect<A, any>) =>
  Effect.runPromise(SessionRepo.use(use).pipe(Effect.provide(repoLayer)) as Effect.Effect<A>);

beforeEach(async () => {
  await pg.reset();
  await seedOrganizations(db, "org1");
  await seedUsers(db, "teacher1", "ann", "ben");
});

// A quiz in the organization (null: the teacher's personal space) with one session, and a student account on its
// roster with the roster entry `roster-<id>` in the same space.
const seedRoster = async (organizationId: string | null, accounts: string[]) => {
  await db.insert(quizzes).values(quizRow({ id: "quiz1", ownerId: "teacher1", organizationId }));
  await db.insert(quizSessions).values(sessionRow({ id: "sess1", quizId: "quiz1" }));
  for (const id of accounts) {
    await db.insert(students).values({ id: `roster-${id}`, organizationId, userId: id, firstName: id, lastName: "X", email: `${id}@test.dev` });
    await db.insert(sessionStudents).values({ sessionId: "sess1", studentId: id });
  }
};

describe.each([
  ["an organization", "org1" as string | null],
  ["the personal space", null],
])("the roster of a session in %s", (_name, organizationId) => {
  test("lists the entries of the students on it, not those the teacher removed", async () => {
    await seedRoster(organizationId, ["ann", "ben"]);
    await db.update(sessionStudents).set({ removedAt: new Date() }).where(eq(sessionStudents.studentId, "ben"));
    expect((await run((repo) => repo.rosterIds("sess1"))).map((r) => r.rosterId)).toEqual(["roster-ann"]);
  });

  test("a roster entry's accommodations are set and cleared, and the open attempt is reported", async () => {
    await seedRoster(organizationId, ["ann"]);
    const set = await run((repo) => repo.setAccommodations("sess1", "roster-ann", { ...noAccommodations, timeMultiplier: 1.5 }));
    expect(set).toEqual({ openAttemptId: null });
    expect((await run((repo) => repo.rosterIds("sess1")))[0]!.accommodations).toEqual({ ...noAccommodations, timeMultiplier: 1.5 });
    await run((repo) => repo.setAccommodations("sess1", "roster-ann", null));
    expect((await run((repo) => repo.rosterIds("sess1")))[0]!.accommodations).toBeNull();
  });

  test("an entry that isn't on the roster, or was removed from it, can't be given accommodations", async () => {
    await seedRoster(organizationId, ["ann", "ben"]);
    await db.update(sessionStudents).set({ removedAt: new Date() }).where(eq(sessionStudents.studentId, "ben"));
    expect(await run((repo) => repo.setAccommodations("sess1", "roster-ben", { ...noAccommodations, timeMultiplier: 2 }))).toBeNull();
    expect(await run((repo) => repo.setAccommodations("sess1", "roster-nobody", { ...noAccommodations, timeMultiplier: 2 }))).toBeNull();
  });
});

describe("the roster entry of another space", () => {
  test("a student's entry in another organization is not the one on this session's roster", async () => {
    await seedRoster("org1", ["ann"]);
    await seedOrganizations(db, "org2");
    await db.insert(students).values({ id: "other-ann", organizationId: "org2", userId: "ann", firstName: "ann", lastName: "X", email: "ann@test.dev" });
    expect((await run((repo) => repo.rosterIds("sess1"))).map((r) => r.rosterId)).toEqual(["roster-ann"]);
    expect(await run((repo) => repo.setAccommodations("sess1", "other-ann", { ...noAccommodations, timeMultiplier: 2 }))).toBeNull();
  });
});

describe("shifting the clocks", () => {
  const closesAt = new Date("2026-03-02T10:00:00.000Z");
  const questionStartedAt = new Date("2026-03-02T09:00:00.000Z");
  const seedClocks = async (session: Partial<QuizSessionItem> = {}) => {
    await db.insert(quizzes).values(quizRow({ id: "quiz1", ownerId: "teacher1", organizationId: "org1" }));
    await db.insert(quizSessions).values(sessionRow({ id: "sess1", quizId: "quiz1", closesAt, pausedAt: new Date("2026-03-02T09:30:00.000Z"), ...session }));
    await db.insert(attempts).values([
      attemptRow({ id: "att1", sessionId: "sess1", studentId: "ann", extraMs: 1000, questionStartedAt }),
      attemptRow({ id: "att2", sessionId: "sess1", studentId: "ben", extraMs: 2000, questionStartedAt }),
    ]);
  };
  const attemptOf = async (id: string) => (await db.select().from(attempts).where(eq(attempts.id, id)))[0]!;
  const sessionOf = async () => (await db.select().from(quizSessions).where(eq(quizSessions.id, "sess1")))[0]!;

  test("the close and the planned attempts move, adding to what the rows hold, and the pause is cleared", async () => {
    await seedClocks();
    await run((repo) => repo.shiftClocks("sess1", 60_000, [{ attemptId: "att1", extraMs: 60_000, questionMs: 7000 }], { pausedAt: null }));
    const session = await sessionOf();
    expect(session.closesAt).toEqual(new Date(closesAt.getTime() + 60_000));
    expect(session.pausedAt).toBeNull();
    const moved = await attemptOf("att1");
    expect(moved.extraMs).toBe(61_000);
    expect(moved.questionStartedAt).toEqual(new Date(questionStartedAt.getTime() + 7000));
    // Not in the plan: left as it was.
    expect(await attemptOf("att2")).toMatchObject({ extraMs: 2000, questionStartedAt });
  });

  test("a session without a close keeps none, and the pause stays when the plan doesn't clear it", async () => {
    await seedClocks({ closesAt: null });
    await run((repo) => repo.shiftClocks("sess1", 60_000, [], {}));
    const session = await sessionOf();
    expect(session.closesAt).toBeNull();
    expect(session.pausedAt).not.toBeNull();
  });

  test("lists the attempts in progress of the session with what the teacher set for each student", async () => {
    await seedClocks();
    await db.insert(students).values({ id: "roster-ann", organizationId: "org1", userId: "ann", firstName: "ann", lastName: "X", email: "ann@test.dev" });
    await db.insert(sessionStudents).values({ sessionId: "sess1", studentId: "ann", accommodations: { ...noAccommodations, timeMultiplier: 2 } });
    await db.update(attempts).set({ status: "graded" }).where(eq(attempts.id, "att2"));
    const open = await run((repo) => repo.openAttemptsOf("sess1"));
    expect(open.map((o) => [o.attempt.id, o.accommodations])).toEqual([["att1", { ...noAccommodations, timeMultiplier: 2 }]]);
  });
});

describe("saving a grade", () => {
  const seedGrading = async () => {
    await db.insert(quizzes).values(quizRow({ id: "quiz1", ownerId: "teacher1", organizationId: "org1" }));
    await seedPart(db, "quiz1", "part1");
    await db.insert(questions).values(questionRow({ id: "q1", partId: "part1", position: 0 }));
    await db.insert(quizSessions).values(sessionRow({ id: "sess1", quizId: "quiz1" }));
    await db.insert(attempts).values(attemptRow({ id: "att1", sessionId: "sess1", studentId: "ann", status: "needs_grading" }));
  };

  test("stores the score and feedback on the one answer row of the question, writing it again changes it", async () => {
    await seedGrading();
    await run((repo) => repo.saveGrade({ attemptId: "att1", questionId: "q1", manualScore: 3, feedback: "Good", change: null }));
    await run((repo) => repo.saveGrade({ attemptId: "att1", questionId: "q1", manualScore: null, feedback: null, change: null }));
    const rows = await run((repo) => repo.answersOfAttempt("att1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ questionId: "q1", value: null, manualScore: null, feedback: null });
    expect(await db.select().from(gradeChanges)).toEqual([]);
  });

  test("logs a change with who made it and why", async () => {
    await seedGrading();
    const change = { changedBy: "teacher1", oldScore: 4, newScore: 1, reason: "Misread" };
    await run((repo) => repo.saveGrade({ attemptId: "att1", questionId: "q1", manualScore: 1, feedback: null, change }));
    const [answer] = await db.select().from(answers);
    const logged = await db.select().from(gradeChanges);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ answerId: answer!.id, ...change });
  });
});
