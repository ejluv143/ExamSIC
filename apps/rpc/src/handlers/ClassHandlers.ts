import {
  ClassRpcs,
  Conflict,
  EnrollmentRpcs,
  Forbidden,
  NotFound,
  type ClassFields,
  type Permissions,
} from "@examora/contract";
import { and, asc, eq, inArray, isNull, ne, notExists, sql } from "drizzle-orm";
import { Effect } from "effect";
import { Database } from "../Database.ts";
import { newId } from "../database/schemas/_helpers.ts";
import { limits, RateLimiter } from "../RateLimiter.ts";
import {
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
} from "../database/schemas/index.ts";
import { requirePermission } from "../Session.ts";

// Join codes skip look-alike characters (0/O, 1/I/L). 31^7 codes make a clash unlikely enough that one is
// left to the unique constraint.
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const newJoinCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(7)), (b) => codeAlphabet[b % codeAlphabet.length]).join("");
// What people type: case, spaces and dashes don't matter.
const normalizeCode = (code: string) => code.toUpperCase().replace(/[\s-]/g, "");

const noSuchClass = () => new NotFound({ message: "That class doesn't exist or isn't yours." });

const classColumns = (fields: ClassFields) => ({
  courseCode: fields.courseCode.trim(),
  title: fields.title.trim(),
  subjectArea: fields.subjectArea,
  section: fields.section.trim(),
  term: fields.term.trim(),
  schedule: fields.schedule.trim(),
  room: fields.room.trim(),
  units: fields.units,
});

const toClassInfo = (row: ClassItem, studentIds: string[]) => ({
  id: row.id,
  courseCode: row.courseCode,
  title: row.title,
  subjectArea: row.subjectArea,
  section: row.section,
  term: row.term,
  schedule: row.schedule,
  room: row.room,
  units: row.units,
  classroom: row.classroom ?? null,
  studentIds,
});

const toRosterStudent = ({ id, studentNumber, firstName, lastName, email, sex }: StudentItem) => ({
  id,
  studentNumber: studentNumber ?? "",
  firstName,
  lastName,
  email,
  sex,
});

// "Surname, First name M.I.", as the sign-up form asks; otherwise the last word is taken as the surname.
export function splitName(name: string) {
  const [last = "", first] = name.split(/,(.*)/s).map((part) => part.trim());
  if (first) return { lastName: last, firstName: first };
  const words = name.trim().split(/\s+/);
  return words.length > 1
    ? { firstName: words.slice(0, -1).join(" "), lastName: words.at(-1)! }
    : { firstName: "", lastName: name.trim() };
}

export const ClassQueries = Effect.gen(function* () {
  const db = yield* Database;

  // A class's sessions that haven't ended are for its members: a student who joins gets on their rosters, and one
  // who leaves (or is removed) comes off the ones they haven't started.
  const joinSessions = (classId: string, userId: string) =>
    db.query(async (d) => {
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
  const leaveSessions = (classId: string, userId: string) =>
    db.query((d) =>
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

  // Each class with its roster, in the order students joined.
  const withRosters = Effect.fn("withRosters")(function* (rows: ClassItem[]) {
    if (rows.length === 0) return [];
    const members = yield* db.query((d) =>
      d
        .select()
        .from(classMembers)
        .where(
          inArray(
            classMembers.classId,
            rows.map((r) => r.id),
          ),
        )
        .orderBy(asc(classMembers.joinedAt)),
    );
    return rows.map((row) => ({
      row,
      studentIds: members.filter((m) => m.classId === row.id).map((m) => m.studentId),
    }));
  });

  return { db, withRosters, joinSessions, leaveSessions };
});

export const ClassHandlers = ClassRpcs.toLayer(
  Effect.gen(function* () {
    const { db, withRosters, leaveSessions } = yield* ClassQueries;

    const teacher = (permissions: Permissions) => requirePermission(permissions);

    // The signed-in teacher's class, unless it's archived.
    const ownClass = Effect.fn("ownClass")(function* (teacherId: string, classId: string) {
      const [row] = yield* db.query((d) =>
        d
          .select()
          .from(classes)
          .where(and(eq(classes.id, classId), eq(classes.teacherId, teacherId), isNull(classes.archivedAt))),
      );
      if (!row) return yield* noSuchClass();
      return row;
    });

    const toTeacherClass = ({ row, studentIds }: { row: ClassItem; studentIds: string[] }) => ({
      ...toClassInfo(row, studentIds),
      joinCode: row.joinCode,
    });

    return ClassRpcs.of({
      "class.list": Effect.fn("class.list")(function* () {
        const me = yield* teacher({ class: ["read"] });
        const rows = yield* db.query((d) =>
          d
            .select()
            .from(classes)
            .where(and(eq(classes.teacherId, me.id), isNull(classes.archivedAt)))
            .orderBy(asc(classes.courseCode), asc(classes.section)),
        );
        return (yield* withRosters(rows)).map(toTeacherClass);
      }),

      "class.get": Effect.fn("class.get")(function* ({ classId }) {
        const me = yield* teacher({ class: ["read"] });
        const row = yield* ownClass(me.id, classId).pipe(Effect.option);
        if (row._tag === "None") return null;
        const [withRoster] = yield* withRosters([row.value]);
        return toTeacherClass(withRoster!);
      }),

      "class.create": Effect.fn("class.create")(function* (fields) {
        const me = yield* teacher({ class: ["create"] });
        const id = newId("c");
        yield* db.query((d) =>
          d.insert(classes).values({ id, teacherId: me.id, joinCode: newJoinCode(), ...classColumns(fields) }),
        );
        return { id };
      }),

      "class.update": Effect.fn("class.update")(function* ({ classId, fields }) {
        const me = yield* teacher({ class: ["update"] });
        yield* ownClass(me.id, classId);
        yield* db.query((d) => d.update(classes).set(classColumns(fields)).where(eq(classes.id, classId)));
      }),

      "class.archive": Effect.fn("class.archive")(function* ({ classId }) {
        const me = yield* teacher({ class: ["delete"] });
        yield* ownClass(me.id, classId);
        yield* db.query((d) => d.update(classes).set({ archivedAt: new Date() }).where(eq(classes.id, classId)));
      }),

      "class.newJoinCode": Effect.fn("class.newJoinCode")(function* ({ classId }) {
        const me = yield* teacher({ class: ["update"] });
        yield* ownClass(me.id, classId);
        const joinCode = newJoinCode();
        yield* db.query((d) => d.update(classes).set({ joinCode }).where(eq(classes.id, classId)));
        return { joinCode };
      }),

      "class.removeStudent": Effect.fn("class.removeStudent")(function* ({ classId, studentId }) {
        const me = yield* teacher({ roster: ["update"] });
        yield* ownClass(me.id, classId);
        const removed = yield* db.query((d) =>
          d
            .delete(classMembers)
            .where(and(eq(classMembers.classId, classId), eq(classMembers.studentId, studentId)))
            .returning({ studentId: classMembers.studentId }),
        );
        if (removed.length === 0) return yield* new NotFound({ message: "That student isn't in this class." });
        const [student] = yield* db.query((d) => d.select({ userId: students.userId }).from(students).where(eq(students.id, studentId)));
        if (student?.userId) yield* leaveSessions(classId, student.userId);
      }),

      "class.students": Effect.fn("class.students")(function* ({ studentIds }) {
        const me = yield* teacher({ roster: ["read"] });
        if (studentIds.length === 0) return [];
        // Members of the teacher's classes, and students on the roster of one of their sessions (a session without a
        // class has whoever joined it with the key).
        const [members, onSessions] = yield* Effect.all([
          db.query((d) =>
            d
              .selectDistinct({ student: students })
              .from(students)
              .innerJoin(classMembers, eq(classMembers.studentId, students.id))
              .innerJoin(classes, eq(classes.id, classMembers.classId))
              .where(and(inArray(students.id, [...studentIds]), eq(classes.teacherId, me.id))),
          ),
          db.query((d) =>
            d
              .selectDistinct({ student: students })
              .from(students)
              .innerJoin(sessionStudents, eq(sessionStudents.studentId, students.userId))
              .innerJoin(quizSessions, eq(quizSessions.id, sessionStudents.sessionId))
              .innerJoin(quizzes, eq(quizzes.id, quizSessions.quizId))
              .where(and(inArray(students.id, [...studentIds]), eq(quizzes.ownerId, me.id))),
          ),
        ]);
        return [...new Map([...members, ...onSessions].map(({ student }) => [student.id, toRosterStudent(student)])).values()];
      }),
    });
  }),
);

export const EnrollmentHandlers = EnrollmentRpcs.toLayer(
  Effect.gen(function* () {
    const { db, withRosters, joinSessions, leaveSessions } = yield* ClassQueries;
    const limiter = yield* RateLimiter;

    // A roster entry imported from Google Classroom has the student's email but no account. The first time a
    // student whose email Google has verified signs in, it becomes theirs, with its classes and their open sessions.
    // Unverified emails (email and password sign-up) never claim one, so nobody takes over a classmate's grades.
    const claimImported = Effect.fn("enrollment.claimImported")(function* (userId: string) {
      const [account] = yield* db.query((d) =>
        d.select({ email: users.email, verified: users.emailVerified }).from(users).where(eq(users.id, userId)),
      );
      if (!account?.verified) return null;
      const [claimed] = yield* db.query((d) =>
        d
          .update(students)
          .set({ userId })
          .where(and(sql`lower(${students.email}) = lower(${account.email})`, isNull(students.userId)))
          .returning(),
      );
      if (!claimed) return null;
      const memberships = yield* db.query((d) =>
        d.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.studentId, claimed.id)),
      );
      for (const { classId } of memberships) yield* joinSessions(classId, userId);
      return claimed;
    });

    // The signed-in student and their roster entry, if they've joined a class before (or one was imported for them).
    const me = Effect.fn("enrollment.me")(function* (permissions: Permissions) {
      const user = yield* requirePermission(permissions);
      if (user.role !== "student") return yield* new Forbidden({ message: "Only students join classes." });
      const [student] = yield* db.query((d) => d.select().from(students).where(eq(students.userId, user.id)));
      return { user, student: student ?? (yield* claimImported(user.id)) };
    });

    return EnrollmentRpcs.of({
      "enrollment.mine": Effect.fn("enrollment.mine")(function* () {
        const { student } = yield* me({ enrollment: ["read"] });
        if (!student) return { student: null, classes: [] };
        const rows = yield* db.query((d) =>
          d
            .select({ cls: classes })
            .from(classMembers)
            .innerJoin(classes, eq(classes.id, classMembers.classId))
            .where(and(eq(classMembers.studentId, student.id), isNull(classes.archivedAt)))
            .orderBy(asc(classes.courseCode), asc(classes.section)),
        );
        const withRoster = yield* withRosters(rows.map((r) => r.cls));
        return {
          student: toRosterStudent(student),
          classes: withRoster.map(({ row, studentIds }) => toClassInfo(row, studentIds)),
        };
      }),

      "enrollment.join": Effect.fn("enrollment.join")(function* ({ code, sex, studentNumber }) {
        const { user, student: existing } = yield* me({ enrollment: ["create"] });
        // Only wrong codes count, to slow guessing.
        yield* limiter.check(limits.joinCode, user.id);
        const [cls] = yield* db.query((d) =>
          d
            .select({ id: classes.id })
            .from(classes)
            .where(and(eq(classes.joinCode, normalizeCode(code)), isNull(classes.archivedAt))),
        );
        if (!cls) {
          yield* limiter.count(limits.joinCode, user.id);
          return yield* new NotFound({ message: "No class uses that code. Check it with your teacher." });
        }

        let student = existing;
        // An entry imported from Classroom lacks these until the student gives them, here.
        if (student && (!student.studentNumber || !student.sex)) {
          const number = student.studentNumber || studentNumber?.trim() || user.studentId;
          const studentSex = student.sex ?? sex;
          if (!number) return yield* new Conflict({ message: "Enter your student number for your teacher's grade sheet." });
          if (!studentSex) return yield* new Conflict({ message: "Choose male or female for your teacher's grade sheet." });
          const studentId = student.id;
          [student = null] = yield* db.query((d) =>
            d.update(students).set({ studentNumber: number, sex: studentSex }).where(eq(students.id, studentId)).returning(),
          );
        }
        if (!student) {
          const number = studentNumber?.trim() || user.studentId;
          if (!number) return yield* new Conflict({ message: "Enter your student number for your teacher's grade sheet." });
          if (!sex) return yield* new Conflict({ message: "Choose male or female for your teacher's grade sheet." });
          // The first class they join gives them a roster entry; a double submit finds the one just made.
          yield* db.query((d) =>
            d
              .insert(students)
              .values({
                id: newId("s"),
                userId: user.id,
                studentNumber: number,
                email: user.email,
                sex,
                ...splitName(user.name),
              })
              .onConflictDoNothing({ target: students.userId }),
          );
          [student = null] = yield* db.query((d) => d.select().from(students).where(eq(students.userId, user.id)));
        }
        if (!student) return yield* Effect.die(`No roster entry for student ${user.id} after creating it.`);
        const studentId = student.id;
        yield* db.query((d) => d.insert(classMembers).values({ classId: cls.id, studentId }).onConflictDoNothing());
        yield* joinSessions(cls.id, user.id);
        return { classId: cls.id };
      }),

      "enrollment.leave": Effect.fn("enrollment.leave")(function* ({ classId }) {
        const { user, student } = yield* me({ enrollment: ["delete"] });
        const left = student
          ? yield* db.query((d) =>
              d
                .delete(classMembers)
                .where(and(eq(classMembers.classId, classId), eq(classMembers.studentId, student.id)))
                .returning({ classId: classMembers.classId }),
            )
          : [];
        if (left.length === 0) return yield* new NotFound({ message: "You're not in that class." });
        yield* leaveSessions(classId, user.id);
      }),
    });
  }),
);
