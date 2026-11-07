// The class tables: classes, their members (the roster), the students' roster entries, and the sessions a member is
// put on or taken off. Also the Google account Classroom is read with.
import { and, asc, desc, eq, inArray, isNull, ne, notExists, sql } from "drizzle-orm";
// The class tables: classes, their members (the roster) and the students' roster entries. Who joins or leaves a class,
// and what that does to its sessions, is `ClassRoster`. Also the Google account Classroom is read with.
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database } from "../../platform/Database.ts";
import { ownedClasses, ownedQuizzes, rosterBeside, rosterOf } from "../../platform/organization-scope.ts";
import type { Actor } from "../auth/Session.ts";
import {
  accounts,
  attempts,
  classAnnouncements,
  classes,
  classMembers,
  quizSessions,
  quizzes,
  sessionStudents,
  students,
  users,
  type AnnouncementItem,
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
    // A class's announcements, newest first.
    readonly announcements: (classId: string) => Effect.Effect<AnnouncementItem[]>;
    readonly insertAnnouncement: (row: typeof classAnnouncements.$inferInsert) => Effect.Effect<AnnouncementItem>;
    // Deletes the class's announcement; false when it isn't there.
    readonly deleteAnnouncement: (classId: string, id: string) => Effect.Effect<boolean>;
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
    // Students of the teacher's classes, and students on the roster of one of the teacher's sessions (a session
    // without a class has whoever joined it with the key), among `studentIds`.
    readonly teacherStudents: (actor: Actor, studentIds: readonly string[]) => Effect.Effect<StudentItem[]>;

    // Enrollment.
    // The account's roster entry in the organization (null: their personal space).
    readonly studentOf: (organizationId: string | null, userId: string) => Effect.Effect<StudentItem | null>;
    readonly emailOf: (userId: string) => Effect.Effect<{ email: string; verified: boolean } | null>;
    // Links the organization's unclaimed roster entry with this email (any case) to the account.
    readonly claimByEmail: (organizationId: string | null, userId: string, email: string) => Effect.Effect<StudentItem | null>;
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
                and(eq(classes.id, classId), ownedClasses(actor), isNull(classes.archivedAt)),
              ),
          );
          return row ?? null;
        }),
        announcements: Effect.fn("ClassRepo.announcements")(function* (classId) {
          return yield* db.query((d) =>
            d
              .select()
              .from(classAnnouncements)
              .where(eq(classAnnouncements.classId, classId))
              .orderBy(desc(classAnnouncements.createdAt)),
          );
        }),
        insertAnnouncement: Effect.fn("ClassRepo.insertAnnouncement")(function* (row) {
          const [created] = yield* db.query((d) => d.insert(classAnnouncements).values(row).returning());
          return created!;
        }),
        deleteAnnouncement: Effect.fn("ClassRepo.deleteAnnouncement")(function* (classId, id) {
          const removed = yield* db.query((d) =>
            d
              .delete(classAnnouncements)
              .where(and(eq(classAnnouncements.classId, classId), eq(classAnnouncements.id, id)))
              .returning({ id: classAnnouncements.id }),
          );
          return removed.length > 0;
        }),
        ofTeacher: Effect.fn("ClassRepo.ofTeacher")(function* (actor) {
          return yield* db.query((d) =>
            d
              .select()
              .from(classes)
              .where(
                and(ownedClasses(actor), isNull(classes.archivedAt)),
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
                and(eq(students.id, classMembers.studentId), rosterBeside(classes.organizationId)),
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
        teacherStudents: Effect.fn("ClassRepo.teacherStudents")(function* (actor, studentIds) {
          const [members, onSessions] = yield* Effect.all([
            db.query((d) =>
              d
                .selectDistinct({ student: students })
                .from(students)
                .innerJoin(classMembers, eq(classMembers.studentId, students.id))
                .innerJoin(classes, eq(classes.id, classMembers.classId))
                .where(
                  and(inArray(students.id, [...studentIds]), ownedClasses(actor)),
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
                  and(inArray(students.id, [...studentIds]), ownedQuizzes(actor)),
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
              .where(and(rosterOf(organizationId), eq(students.userId, userId))),
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
                  rosterOf(organizationId),
                  sql`lower(${students.email}) = lower(${email})`,
                  isNull(students.userId),
                ),
              )
              .returning(),
          );
          return claimed ?? null;
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
                and(ownedClasses(actor), isNull(classes.archivedAt)),
              ),
          );
        }),
        studentByEmail: Effect.fn("ClassRepo.studentByEmail")(function* (organizationId, lowerEmail) {
          const [entry] = yield* db.query((d) =>
            d
              .select({ id: students.id, userId: students.userId })
              .from(students)
              .where(and(rosterOf(organizationId), sql`lower(${students.email}) = ${lowerEmail}`))
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
