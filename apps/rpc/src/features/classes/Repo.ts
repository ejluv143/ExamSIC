// The class tables: classes, their members (the roster), the students' roster entries, and the sessions a member is
// put on or taken off. Also the Google account Classroom is read with.
import { and, asc, eq, inArray, isNull, ne, notExists, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database } from "../../platform/Database.ts";
import { organizationIs, sameOrganization } from "../../platform/organization-scope.ts";
import type { Actor } from "../auth/Session.ts";
import {
  accounts,
  attempts,
  classes,
  classMembers,
  quizSessions,
  quizzes,
  sessionStudents,
  students,
  users,
  type ClassItem,
  type StudentItem,
} from "../../database/schemas/index.ts";

export type NewClass = typeof classes.$inferInsert;
export type NewStudent = typeof students.$inferInsert;
export type Sex = NonNullable<StudentItem["sex"]>;
export type LinkedAccount = typeof accounts.$inferSelect;
export type ClassroomLink = NonNullable<ClassItem["classroom"]>;

export class ClassRepo extends Context.Service<
  ClassRepo,
  {
    // The teacher's class in their organization, unless it's archived; null when there is none.
    readonly findOwn: (actor: Actor, classId: string) => Effect.Effect<ClassItem | null>;
    // The teacher's classes that aren't archived, by course code and section.
    readonly ofTeacher: (actor: Actor) => Effect.Effect<ClassItem[]>;
    // The members of the classes, in the order they joined.
    readonly members: (classIds: readonly string[]) => Effect.Effect<{ classId: string; studentId: string }[]>;
    // The ids of the class's members.
    readonly memberIds: (classId: string) => Effect.Effect<string[]>;
    // The class (unless archived) and roster entry (in the class's organization) of a student who is a member of it;
    // null otherwise.
    readonly membership: (userId: string, classId: string) => Effect.Effect<{ cls: ClassItem; studentId: string } | null>;
    readonly insert: (row: NewClass) => Effect.Effect<void>;
    readonly update: (classId: string, set: Partial<NewClass>) => Effect.Effect<void>;
    // Removes the student from the class; false when they weren't in it.
    readonly removeMember: (classId: string, studentId: string) => Effect.Effect<boolean>;
    // Puts the student in the class; false when they already were.
    readonly addMember: (classId: string, studentId: string) => Effect.Effect<boolean>;
    // The account behind a roster entry, if it has one.
    readonly accountOfStudent: (studentId: string) => Effect.Effect<string | null>;
    // A class's sessions that haven't ended are for its members: a student who joins gets on their rosters, and one
    // who leaves (or is removed) comes off the ones they haven't started.
    readonly joinSessions: (classId: string, userId: string) => Effect.Effect<void>;
    readonly leaveSessions: (classId: string, userId: string) => Effect.Effect<void>;
    // Students of the teacher's classes, and students on the roster of one of the teacher's sessions (a session
    // without a class has whoever joined it with the key), among `studentIds`.
    readonly teacherStudents: (actor: Actor, studentIds: readonly string[]) => Effect.Effect<StudentItem[]>;

    // Enrollment.
    // The account's roster entry in the organization (null: their personal space).
    readonly studentOf: (organizationId: string | null, userId: string) => Effect.Effect<StudentItem | null>;
    readonly emailOf: (userId: string) => Effect.Effect<{ email: string; verified: boolean } | null>;
    // Links the organization's unclaimed roster entry with this email (any case) to the account.
    readonly claimByEmail: (organizationId: string | null, userId: string, email: string) => Effect.Effect<StudentItem | null>;
    readonly classIdsOf: (studentId: string) => Effect.Effect<string[]>;
    // The student's classes that aren't archived.
    readonly classesOf: (studentId: string) => Effect.Effect<ClassItem[]>;
    // The class a join code opens, unless archived, and the organization it is in.
    readonly idByJoinCode: (code: string) => Effect.Effect<{ id: string; organizationId: string | null } | null>;
    readonly fillStudent: (studentId: string, studentNumber: string, sex: Sex) => Effect.Effect<StudentItem | null>;
    // Creates the account's roster entry; one made in the meantime (a double submit) is left alone.
    readonly ensureStudent: (row: NewStudent & { userId: string }) => Effect.Effect<void>;

    // Google Classroom.
    // The accounts the user linked with Google.
    readonly googleAccounts: (userId: string) => Effect.Effect<LinkedAccount[]>;
    readonly saveToken: (accountId: string, accessToken: string, expiresAt: Date) => Effect.Effect<void>;
    // The teacher's classes imported from Classroom (not archived).
    readonly imported: (actor: Actor) => Effect.Effect<{ id: string; classroom: ClassroomLink | null }[]>;
    readonly studentByEmail: (organizationId: string | null, lowerEmail: string) => Effect.Effect<{ id: string; userId: string | null } | null>;
    // A roster entry without an account.
    readonly insertStudent: (row: NewStudent) => Effect.Effect<void>;
    readonly countMembers: (classId: string) => Effect.Effect<number>;
  }
>()("examinus/api/ClassRepo") {
  static readonly layer = Layer.effect(
    ClassRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return ClassRepo.of({
        findOwn: Effect.fn("ClassRepo.findOwn")(function* (actor, classId) {
          const [row] = yield* db.query((d) =>
            d
              .select()
              .from(classes)
              .where(
                and(
                  eq(classes.id, classId),
                  eq(classes.teacherId, actor.id),
                  organizationIs(classes.organizationId, actor.organizationId),
                  isNull(classes.archivedAt),
                ),
              ),
          );
          return row ?? null;
        }),
        ofTeacher: Effect.fn("ClassRepo.ofTeacher")(function* (actor) {
          return yield* db.query((d) =>
            d
              .select()
              .from(classes)
              .where(
                and(
                  eq(classes.teacherId, actor.id),
                  organizationIs(classes.organizationId, actor.organizationId),
                  isNull(classes.archivedAt),
                ),
              )
              .orderBy(asc(classes.courseCode), asc(classes.section)),
          );
        }),
        members: Effect.fn("ClassRepo.members")(function* (classIds) {
          return yield* db.query((d) =>
            d
              .select()
              .from(classMembers)
              .where(inArray(classMembers.classId, [...classIds]))
              .orderBy(asc(classMembers.joinedAt)),
          );
        }),
        memberIds: Effect.fn("ClassRepo.memberIds")(function* (classId) {
          const rows = yield* db.query((d) =>
            d.select({ studentId: classMembers.studentId }).from(classMembers).where(eq(classMembers.classId, classId)),
          );
          return rows.map((m) => m.studentId);
        }),
        membership: Effect.fn("ClassRepo.membership")(function* (userId, classId) {
          const [row] = yield* db.query((d) =>
            d
              .select({ cls: classes, studentId: students.id })
              .from(classes)
              .innerJoin(classMembers, eq(classMembers.classId, classes.id))
              .innerJoin(
                students,
                and(eq(students.id, classMembers.studentId), sameOrganization(students.organizationId, classes.organizationId)),
              )
              .where(and(eq(classes.id, classId), eq(students.userId, userId), isNull(classes.archivedAt))),
          );
          return row ?? null;
        }),
        insert: Effect.fn("ClassRepo.insert")(function* (row) {
          yield* db.query((d) => d.insert(classes).values(row));
        }),
        update: Effect.fn("ClassRepo.update")(function* (classId, set) {
          yield* db.query((d) => d.update(classes).set(set).where(eq(classes.id, classId)));
        }),
        removeMember: Effect.fn("ClassRepo.removeMember")(function* (classId, studentId) {
          const removed = yield* db.query((d) =>
            d
              .delete(classMembers)
              .where(and(eq(classMembers.classId, classId), eq(classMembers.studentId, studentId)))
              .returning({ studentId: classMembers.studentId }),
          );
          return removed.length > 0;
        }),
        addMember: Effect.fn("ClassRepo.addMember")(function* (classId, studentId) {
          const added = yield* db.query((d) =>
            d
              .insert(classMembers)
              .values({ classId, studentId })
              .onConflictDoNothing()
              .returning({ studentId: classMembers.studentId }),
          );
          return added.length > 0;
        }),
        accountOfStudent: Effect.fn("ClassRepo.accountOfStudent")(function* (studentId) {
          const [student] = yield* db.query((d) =>
            d.select({ userId: students.userId }).from(students).where(eq(students.id, studentId)),
          );
          return student?.userId ?? null;
        }),
        joinSessions: Effect.fn("ClassRepo.joinSessions")(function* (classId, userId) {
          yield* db.query(async (d) => {
            const open = await d
              .select({ id: quizSessions.id })
              .from(quizSessions)
              .where(and(eq(quizSessions.classId, classId), ne(quizSessions.status, "ended")));
            if (open.length)
              await d
                .insert(sessionStudents)
                .values(open.map((s) => ({ sessionId: s.id, studentId: userId })))
                .onConflictDoNothing();
          });
        }),
        leaveSessions: Effect.fn("ClassRepo.leaveSessions")(function* (classId, userId) {
          yield* db.query((d) =>
            d.delete(sessionStudents).where(
              and(
                eq(sessionStudents.studentId, userId),
                inArray(
                  sessionStudents.sessionId,
                  d
                    .select({ id: quizSessions.id })
                    .from(quizSessions)
                    .where(and(eq(quizSessions.classId, classId), ne(quizSessions.status, "ended"))),
                ),
                notExists(
                  d
                    .select({ id: attempts.id })
                    .from(attempts)
                    .where(and(eq(attempts.sessionId, sessionStudents.sessionId), eq(attempts.studentId, userId))),
                ),
              ),
            ),
          );
        }),
        teacherStudents: Effect.fn("ClassRepo.teacherStudents")(function* (actor, studentIds) {
          const [members, onSessions] = yield* Effect.all([
            db.query((d) =>
              d
                .selectDistinct({ student: students })
                .from(students)
                .innerJoin(classMembers, eq(classMembers.studentId, students.id))
                .innerJoin(classes, eq(classes.id, classMembers.classId))
                .where(
                  and(
                    inArray(students.id, [...studentIds]),
                    eq(classes.teacherId, actor.id),
                    organizationIs(classes.organizationId, actor.organizationId),
                  ),
                ),
            ),
            db.query((d) =>
              d
                .selectDistinct({ student: students })
                .from(students)
                .innerJoin(sessionStudents, eq(sessionStudents.studentId, students.userId))
                .innerJoin(quizSessions, eq(quizSessions.id, sessionStudents.sessionId))
                .innerJoin(quizzes, eq(quizzes.id, quizSessions.quizId))
                .where(
                  and(
                    inArray(students.id, [...studentIds]),
                    eq(quizzes.ownerId, actor.id),
                    organizationIs(quizzes.organizationId, actor.organizationId),
                  ),
                ),
            ),
          ]);
          return [...members, ...onSessions].map(({ student }) => student);
        }),

        studentOf: Effect.fn("ClassRepo.studentOf")(function* (organizationId, userId) {
          const [student] = yield* db.query((d) =>
            d
              .select()
              .from(students)
              .where(and(organizationIs(students.organizationId, organizationId), eq(students.userId, userId))),
          );
          return student ?? null;
        }),
        emailOf: Effect.fn("ClassRepo.emailOf")(function* (userId) {
          const [account] = yield* db.query((d) =>
            d.select({ email: users.email, verified: users.emailVerified }).from(users).where(eq(users.id, userId)),
          );
          return account ?? null;
        }),
        claimByEmail: Effect.fn("ClassRepo.claimByEmail")(function* (organizationId, userId, email) {
          const [claimed] = yield* db.query((d) =>
            d
              .update(students)
              .set({ userId })
              .where(
                and(
                  organizationIs(students.organizationId, organizationId),
                  sql`lower(${students.email}) = lower(${email})`,
                  isNull(students.userId),
                ),
              )
              .returning(),
          );
          return claimed ?? null;
        }),
        classIdsOf: Effect.fn("ClassRepo.classIdsOf")(function* (studentId) {
          const rows = yield* db.query((d) =>
            d.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.studentId, studentId)),
          );
          return rows.map((r) => r.classId);
        }),
        classesOf: Effect.fn("ClassRepo.classesOf")(function* (studentId) {
          const rows = yield* db.query((d) =>
            d
              .select({ cls: classes })
              .from(classMembers)
              .innerJoin(classes, eq(classes.id, classMembers.classId))
              .where(and(eq(classMembers.studentId, studentId), isNull(classes.archivedAt)))
              .orderBy(asc(classes.courseCode), asc(classes.section)),
          );
          return rows.map((r) => r.cls);
        }),
        idByJoinCode: Effect.fn("ClassRepo.idByJoinCode")(function* (code) {
          const [cls] = yield* db.query((d) =>
            d
              .select({ id: classes.id, organizationId: classes.organizationId })
              .from(classes)
              .where(and(eq(classes.joinCode, code), isNull(classes.archivedAt))),
          );
          return cls ?? null;
        }),
        fillStudent: Effect.fn("ClassRepo.fillStudent")(function* (studentId, studentNumber, sex) {
          const [student] = yield* db.query((d) =>
            d.update(students).set({ studentNumber, sex }).where(eq(students.id, studentId)).returning(),
          );
          return student ?? null;
        }),
        ensureStudent: Effect.fn("ClassRepo.ensureStudent")(function* (row) {
          yield* db.query((d) => d.insert(students).values(row).onConflictDoNothing({ target: [students.organizationId, students.userId] }));
        }),

        googleAccounts: Effect.fn("ClassRepo.googleAccounts")(function* (userId) {
          return yield* db.query((d) =>
            d
              .select()
              .from(accounts)
              .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "google"))),
          );
        }),
        saveToken: Effect.fn("ClassRepo.saveToken")(function* (accountId, accessToken, expiresAt) {
          yield* db.query((d) =>
            d.update(accounts).set({ accessToken, accessTokenExpiresAt: expiresAt }).where(eq(accounts.id, accountId)),
          );
        }),
        imported: Effect.fn("ClassRepo.imported")(function* (actor) {
          return yield* db.query((d) =>
            d
              .select({ id: classes.id, classroom: classes.classroom })
              .from(classes)
              .where(
                and(
                  eq(classes.teacherId, actor.id),
                  organizationIs(classes.organizationId, actor.organizationId),
                  isNull(classes.archivedAt),
                ),
              ),
          );
        }),
        studentByEmail: Effect.fn("ClassRepo.studentByEmail")(function* (organizationId, lowerEmail) {
          const [entry] = yield* db.query((d) =>
            d
              .select({ id: students.id, userId: students.userId })
              .from(students)
              .where(and(organizationIs(students.organizationId, organizationId), sql`lower(${students.email}) = ${lowerEmail}`))
              .limit(1),
          );
          return entry ?? null;
        }),
        insertStudent: Effect.fn("ClassRepo.insertStudent")(function* (row) {
          yield* db.query((d) => d.insert(students).values(row));
        }),
        countMembers: Effect.fn("ClassRepo.countMembers")(function* (classId) {
          return yield* db.query((d) => d.$count(classMembers, eq(classMembers.classId, classId)));
        }),
      });
    }),
  );
}
