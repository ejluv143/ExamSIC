// Who is in a class and who is on the roster of its sessions, kept together. A class's sessions that haven't ended are
// for its members: callers say what happened (a student joined or left, an imported entry was claimed, a session got
// its class) and the rules below follow. One rule for the exceptions, whichever way a student comes off a session:
//   - a student with an attempt keeps the row (their paper and result stay with the session);
//   - a student the teacher removed from the session keeps the marker (`removed_at`), so leaving a class and joining
//     it again never lets them back in.
import { and, eq, inArray, isNotNull, isNull, ne, notExists } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database, type Db } from "../../platform/Database.ts";
import { attempts, classMembers, quizSessions, sessionStudents, students } from "../../database/schemas/index.ts";

// The accounts behind a class's current members (members without an account are not on any roster yet).
const accountsOf = (d: Db, classId: string) =>
  d
    .select({ userId: students.userId })
    .from(classMembers)
    .innerJoin(students, eq(classMembers.studentId, students.id))
    .where(and(eq(classMembers.classId, classId), isNotNull(students.userId)))
    .then((rows) => rows.map((r) => r.userId!));

const openSessionsOf = (d: Db, classIds: readonly string[]) =>
  d
    .select({ id: quizSessions.id })
    .from(quizSessions)
    .where(and(inArray(quizSessions.classId, [...classIds]), ne(quizSessions.status, "ended")))
    .then((rows) => rows.map((r) => r.id));

// Puts every account on every session, leaving rows (and markers) already there as they are.
const putOn = async (d: Db, sessionIds: readonly string[], userIds: readonly string[]) => {
  if (sessionIds.length === 0 || userIds.length === 0) return;
  await d
    .insert(sessionStudents)
    .values(sessionIds.flatMap((sessionId) => userIds.map((studentId) => ({ sessionId, studentId }))))
    .onConflictDoNothing();
};

// Takes the sessions' students off their rosters, except those who have an attempt or were removed by the teacher.
// `userIds` null: everyone on them.
const takeOff = async (d: Db, sessionIds: readonly string[], userIds: readonly string[] | null) => {
  if (sessionIds.length === 0 || userIds?.length === 0) return;
  await d.delete(sessionStudents).where(
    and(
      inArray(sessionStudents.sessionId, [...sessionIds]),
      userIds === null ? undefined : inArray(sessionStudents.studentId, [...userIds]),
      isNull(sessionStudents.removedAt),
      notExists(
        d
          .select({ id: attempts.id })
          .from(attempts)
          .where(and(eq(attempts.sessionId, sessionStudents.sessionId), eq(attempts.studentId, sessionStudents.studentId))),
      ),
    ),
  );
};

export class ClassRoster extends Context.Service<
  ClassRoster,
  {
    // A student joined the class (with its code, or from Classroom): a member, and on its open sessions when they
    // have an account. false: they already were a member (the sessions are still made right).
    readonly joined: (classId: string, studentId: string) => Effect.Effect<boolean>;
    // A student left the class, or the teacher removed them: off its open sessions, see the exceptions above.
    // false: they weren't a member.
    readonly left: (classId: string, studentId: string) => Effect.Effect<boolean>;
    // A roster entry imported without an account became the account's: it joins the open sessions of its classes.
    readonly claimed: (studentId: string) => Effect.Effect<void>;
    // A session was made for the class, or kept it: its members are on the roster. Those already on it, or removed
    // from it, stay as they are.
    readonly sessionFilled: (sessionId: string, classId: string) => Effect.Effect<void>;
    // A session moved to another class: the old class's students come off its roster (see the exceptions above) and
    // the new class's members go on.
    readonly sessionMoved: (sessionId: string, classId: string) => Effect.Effect<void>;
  }
>()("examinus/api/ClassRoster") {
  static readonly layer = Layer.effect(
    ClassRoster,
    Effect.gen(function* () {
      const db = yield* Database;
      return ClassRoster.of({
        joined: Effect.fn("ClassRoster.joined")(function* (classId, studentId) {
          return yield* db.query((d) =>
            d.transaction(async (tx) => {
              const added = await tx
                .insert(classMembers)
                .values({ classId, studentId })
                .onConflictDoNothing()
                .returning({ studentId: classMembers.studentId });
              const [student] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, studentId));
              if (student?.userId) await putOn(tx, await openSessionsOf(tx, [classId]), [student.userId]);
              return added.length > 0;
            }),
          );
        }),
        left: Effect.fn("ClassRoster.left")(function* (classId, studentId) {
          return yield* db.query((d) =>
            d.transaction(async (tx) => {
              const removed = await tx
                .delete(classMembers)
                .where(and(eq(classMembers.classId, classId), eq(classMembers.studentId, studentId)))
                .returning({ studentId: classMembers.studentId });
              if (removed.length === 0) return false;
              const [student] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, studentId));
              if (student?.userId) await takeOff(tx, await openSessionsOf(tx, [classId]), [student.userId]);
              return true;
            }),
          );
        }),
        claimed: Effect.fn("ClassRoster.claimed")(function* (studentId) {
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              const [student] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, studentId));
              if (!student?.userId) return;
              const classIds = (await tx.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.studentId, studentId))).map(
                (m) => m.classId,
              );
              if (classIds.length > 0) await putOn(tx, await openSessionsOf(tx, classIds), [student.userId]);
            }),
          );
        }),
        sessionFilled: Effect.fn("ClassRoster.sessionFilled")(function* (sessionId, classId) {
          yield* db.query(async (d) => putOn(d, [sessionId], await accountsOf(d, classId)));
        }),
        sessionMoved: Effect.fn("ClassRoster.sessionMoved")(function* (sessionId, classId) {
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              await takeOff(tx, [sessionId], null);
              await putOn(tx, [sessionId], await accountsOf(tx, classId));
            }),
          );
        }),
      });
    }),
  );
}
