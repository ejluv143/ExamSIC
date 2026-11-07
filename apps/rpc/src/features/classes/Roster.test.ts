// The class roster against a real Postgres: who is on a session's roster after students join and leave a class, a
// session is made or moved, or an imported entry is claimed.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { noAccommodations } from "@examinus/domain/accommodations";
import { and, eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { attempts, classes, classMembers, quizSessions, quizzes, sessionStudents, students } from "../../database/schemas/index.ts";
import { testPostgres } from "../../testing/postgres.ts";
import { attemptRow, quizRow, sessionRow } from "../../testing/rows.ts";
import { seedOrganizations, seedUsers } from "../../testing/seed.ts";
import { ClassRoster } from "./Roster.ts";

const pg = await testPostgres();
const { db } = pg;
afterAll(() => pg.close());

const rosterLayer = ClassRoster.layer.pipe(Layer.provide(pg.layer));
const run = <A>(use: (roster: ClassRoster["Service"]) => Effect.Effect<A>) =>
  Effect.runPromise(ClassRoster.use(use).pipe(Effect.provide(rosterLayer)));

// Teacher t1 with classes c1 and c2 (organization org1), a quiz and, per class, an open session (s-c1, s-c2) and an
// ended one (old-c1). Students: ann (account u-ann), ben (account u-ben) and an imported entry without an account.
beforeEach(async () => {
  await pg.reset();
  await seedOrganizations(db, "org1");
  await seedUsers(db, "t1", "u-ann", "u-ben", "u-cy", "u-dee");
  const klass = (id: string) => ({ id, teacherId: "t1", organizationId: "org1", courseCode: id, title: id, joinCode: id });
  await db.insert(classes).values([klass("c1"), klass("c2")]);
  await db.insert(quizzes).values(quizRow({ id: "quiz1", ownerId: "t1", organizationId: "org1" }));
  await db.insert(quizSessions).values([
    sessionRow({ id: "s-c1", quizId: "quiz1", classId: "c1", status: "lobby" }),
    sessionRow({ id: "s-c2", quizId: "quiz1", classId: "c2", status: "running" }),
    sessionRow({ id: "old-c1", quizId: "quiz1", classId: "c1", status: "ended" }),
  ]);
  const student = (id: string, userId: string | null) => ({
    id,
    organizationId: "org1",
    userId,
    firstName: id,
    lastName: "X",
    email: `${id}@test.dev`,
  });
  await db.insert(students).values([student("ann", "u-ann"), student("ben", "u-ben"), student("imported", null)]);
});

const rosterOf = async (sessionId: string) =>
  (await db.select({ id: sessionStudents.studentId }).from(sessionStudents).where(eq(sessionStudents.sessionId, sessionId)).orderBy(sessionStudents.studentId)).map(
    (r) => r.id,
  );
const membersOf = async (classId: string) =>
  (await db.select({ id: classMembers.studentId }).from(classMembers).where(eq(classMembers.classId, classId)).orderBy(classMembers.studentId)).map((r) => r.id);
const onRoster = (sessionId: string, studentId: string, removedAt: Date | null = null) =>
  db.insert(sessionStudents).values({ sessionId, studentId, removedAt });
const attemptOf = (sessionId: string, studentId: string) =>
  db.insert(attempts).values(attemptRow({ id: `att-${sessionId}-${studentId}`, sessionId, studentId }));

describe("a student joins a class", () => {
  test("they become a member and go on the class's open sessions only", async () => {
    expect(await run((r) => r.joined("c1", "ann"))).toBe(true);
    expect(await membersOf("c1")).toEqual(["ann"]);
    expect(await rosterOf("s-c1")).toEqual(["u-ann"]);
    expect(await rosterOf("old-c1")).toEqual([]);
    expect(await rosterOf("s-c2")).toEqual([]);
  });

  test("a roster entry without an account is a member but is on no roster yet", async () => {
    expect(await run((r) => r.joined("c1", "imported"))).toBe(true);
    expect(await membersOf("c1")).toEqual(["imported"]);
    expect(await rosterOf("s-c1")).toEqual([]);
  });

  test("joining again changes nothing, but puts a member missing from a session back on it", async () => {
    await run((r) => r.joined("c1", "ann"));
    await db.delete(sessionStudents);
    expect(await run((r) => r.joined("c1", "ann"))).toBe(false);
    expect(await rosterOf("s-c1")).toEqual(["u-ann"]);
  });

  test("a student the teacher removed from the session stays removed", async () => {
    const removedAt = new Date("2026-03-01T00:00:00Z");
    await onRoster("s-c1", "u-ann", removedAt);
    await run((r) => r.joined("c1", "ann"));
    const [row] = await db.select().from(sessionStudents);
    expect(row?.removedAt).toEqual(removedAt);
  });
});

describe("a student leaves a class, or the teacher removes them", () => {
  const joinBoth = () => Promise.all([run((r) => r.joined("c1", "ann")), run((r) => r.joined("c1", "ben"))]);

  test("they come off the open sessions of the class and nobody else does", async () => {
    await joinBoth();
    await onRoster("s-c2", "u-ann");
    await onRoster("old-c1", "u-ann");
    expect(await run((r) => r.left("c1", "ann"))).toBe(true);
    expect(await membersOf("c1")).toEqual(["ben"]);
    expect(await rosterOf("s-c1")).toEqual(["u-ben"]);
    // Another class's session, and one that has ended, are not the class's open sessions.
    expect(await rosterOf("s-c2")).toEqual(["u-ann"]);
    expect(await rosterOf("old-c1")).toEqual(["u-ann"]);
  });

  test("a student who already started keeps their place on the session", async () => {
    await joinBoth();
    await attemptOf("s-c1", "u-ann");
    await run((r) => r.left("c1", "ann"));
    expect(await rosterOf("s-c1")).toEqual(["u-ann", "u-ben"]);
  });

  test("the teacher's removal from a session outlives leaving the class and joining it again", async () => {
    await joinBoth();
    const removedAt = new Date("2026-03-01T00:00:00Z");
    await db.update(sessionStudents).set({ removedAt }).where(eq(sessionStudents.studentId, "u-ann"));
    await run((r) => r.left("c1", "ann"));
    await run((r) => r.joined("c1", "ann"));
    const [row] = await db.select().from(sessionStudents).where(and(eq(sessionStudents.sessionId, "s-c1"), eq(sessionStudents.studentId, "u-ann")));
    expect(row?.removedAt).toEqual(removedAt);
  });

  test("someone who isn't a member changes nothing", async () => {
    await run((r) => r.joined("c1", "ben"));
    await onRoster("s-c1", "u-ann");
    expect(await run((r) => r.left("c1", "ann"))).toBe(false);
    expect(await rosterOf("s-c1")).toEqual(["u-ann", "u-ben"]);
  });
});

describe("an imported entry is claimed", () => {
  test("the account goes on the open sessions of every class the entry is in", async () => {
    await run((r) => r.joined("c1", "imported"));
    await run((r) => r.joined("c2", "imported"));
    await db.update(students).set({ userId: "u-cy" }).where(eq(students.id, "imported"));
    await run((r) => r.claimed("imported"));
    expect(await rosterOf("s-c1")).toEqual(["u-cy"]);
    expect(await rosterOf("s-c2")).toEqual(["u-cy"]);
    expect(await rosterOf("old-c1")).toEqual([]);
  });
});

describe("a session gets its class", () => {
  test("its members with an account go on the roster; those already on it or removed from it stay as they are", async () => {
    await Promise.all(["ann", "ben", "imported"].map((id) => run((r) => r.joined("c1", id))));
    await db.delete(sessionStudents);
    await db.insert(sessionStudents).values({ sessionId: "s-c1", studentId: "u-ann", accommodations: { ...noAccommodations, timeMultiplier: 2 } });
    const removedAt = new Date("2026-03-01T00:00:00Z");
    await onRoster("s-c1", "u-ben", removedAt);
    await run((r) => r.sessionFilled("s-c1", "c1"));
    const rows = await db.select().from(sessionStudents).orderBy(sessionStudents.studentId);
    expect(rows.map((r) => r.studentId)).toEqual(["u-ann", "u-ben"]);
    expect(rows[0]?.accommodations).toEqual({ ...noAccommodations, timeMultiplier: 2 });
    expect(rows[1]?.removedAt).toEqual(removedAt);
  });
});

describe("a session moves to another class", () => {
  test("the old class's students go, except those with an attempt or removed by the teacher, and the new class's come", async () => {
    await run((r) => r.joined("c1", "ann"));
    await run((r) => r.joined("c2", "ben"));
    await onRoster("s-c1", "u-ben");
    // The session is for c2 now. ann has an attempt; ben (c2's member) was added by hand; cy goes; dee was removed by the teacher.
    await attemptOf("s-c1", "u-ann");
    await onRoster("s-c1", "u-cy");
    await onRoster("s-c1", "u-dee", new Date("2026-03-01T00:00:00Z"));
    await run((r) => r.sessionMoved("s-c1", "c2"));
    expect(await rosterOf("s-c1")).toEqual(["u-ann", "u-ben", "u-dee"]);
  });
});
