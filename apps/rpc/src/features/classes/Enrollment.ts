// Students joining and leaving classes with a join code.
import { Conflict, Forbidden, NotFound, TooManyRequests, type SessionUser } from "@examinus/contract";
import { Context, Effect, Layer } from "effect";
import { newId } from "../../platform/ids.ts";
import type { ClassItem, StudentItem } from "../../database/schemas/index.ts";
import { limits, RateLimiter } from "../../platform/RateLimiter.ts";
import { ClassService, type ClassWithRoster } from "./Service.ts";
import { ClassRepo, type Sex } from "./Repo.ts";
import { normalizeCode, splitName } from "./rules.ts";

export class EnrollmentService extends Context.Service<
  EnrollmentService,
  {
    // The student's roster entry and their classes (with rosters); the entry is null before their first class.
    readonly mine: (user: SessionUser) => Effect.Effect<
      { student: StudentItem | null; classes: ClassWithRoster[] },
      Forbidden
    >;
    readonly join: (
      user: SessionUser,
      input: { code: string; sex: Sex | null; studentNumber: string | null },
    ) => Effect.Effect<{ classId: string }, Forbidden | NotFound | Conflict | TooManyRequests>;
    readonly leave: (user: SessionUser, classId: string) => Effect.Effect<void, Forbidden | NotFound>;
  }
>()("examinus/api/EnrollmentService") {
  static readonly layer = Layer.effect(
    EnrollmentService,
    Effect.gen(function* () {
      const repo = yield* ClassRepo;
      const classes = yield* ClassService;
      const limiter = yield* RateLimiter;

      // A roster entry imported from Google Classroom has the student's email but no account. The first time a
      // student whose email Google has verified signs in, it becomes theirs, with its classes and their open sessions.
      // Unverified emails (email and password sign-up) never claim one, so nobody takes over a classmate's grades.
      const claimImported = Effect.fn("EnrollmentService.claimImported")(function* (userId: string) {
        const account = yield* repo.emailOf(userId);
        if (!account?.verified) return null;
        const claimed = yield* repo.claimByEmail(userId, account.email);
        if (!claimed) return null;
        for (const classId of yield* repo.classIdsOf(claimed.id)) yield* repo.joinSessions(classId, userId);
        return claimed;
      });

      // The signed-in student's roster entry, if they've joined a class before (or one was imported for them).
      const rosterEntry = Effect.fn("EnrollmentService.rosterEntry")(function* (user: SessionUser) {
        if (user.role !== "student") return yield* new Forbidden({ message: "Only students join classes." });
        return (yield* repo.studentOf(user.id)) ?? (yield* claimImported(user.id));
      });

      return EnrollmentService.of({
        mine: Effect.fn("EnrollmentService.mine")(function* (user) {
          const student = yield* rosterEntry(user);
          if (!student) return { student: null, classes: [] };
          const rows: ClassItem[] = yield* repo.classesOf(student.id);
          return { student, classes: yield* classes.withRosters(rows) };
        }),

        join: Effect.fn("EnrollmentService.join")(function* (user, { code, sex, studentNumber }) {
          const existing = yield* rosterEntry(user);
          // Only wrong codes count, to slow guessing.
          yield* limiter.check(limits.joinCode, user.id);
          const classId = yield* repo.idByJoinCode(normalizeCode(code));
          if (!classId) {
            yield* limiter.count(limits.joinCode, user.id);
            return yield* new NotFound({ message: "No class uses that code. Check it with your teacher." });
          }

          let student = existing;
          // An entry imported from Classroom lacks these until the student gives them, here.
          if (student && (!student.studentNumber || !student.sex)) {
            const number = student.studentNumber || studentNumber?.trim();
            const studentSex = student.sex ?? sex;
            if (!number) return yield* new Conflict({ message: "Enter your student number for your teacher's grade sheet." });
            if (!studentSex) return yield* new Conflict({ message: "Choose male or female for your teacher's grade sheet." });
            student = yield* repo.fillStudent(student.id, number, studentSex);
          }
          if (!student) {
            const number = studentNumber?.trim();
            if (!number) return yield* new Conflict({ message: "Enter your student number for your teacher's grade sheet." });
            if (!sex) return yield* new Conflict({ message: "Choose male or female for your teacher's grade sheet." });
            // The first class they join gives them a roster entry; a double submit finds the one just made.
            yield* repo.ensureStudent({
              id: newId("s"),
              userId: user.id,
              studentNumber: number,
              email: user.email,
              sex,
              ...splitName(user.name),
            });
            student = yield* repo.studentOf(user.id);
          }
          if (!student) return yield* Effect.die(`No roster entry for student ${user.id} after creating it.`);
          yield* repo.addMember(classId, student.id);
          yield* repo.joinSessions(classId, user.id);
          return { classId };
        }),

        leave: Effect.fn("EnrollmentService.leave")(function* (user, classId) {
          const student = yield* rosterEntry(user);
          const left = student ? yield* repo.removeMember(classId, student.id) : false;
          if (!left) return yield* new NotFound({ message: "You're not in that class." });
          yield* repo.leaveSessions(classId, user.id);
        }),
      });
    }),
  );
}
