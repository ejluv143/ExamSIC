// Attendance: a teacher takes it per class meeting, and a student sees only their own marks.
import { Conflict, NotFound } from "@examinus/contract/errors";
import { manilaDate, type AttendanceStatus, type ClassMeeting } from "@examinus/domain/attendance";
import { Context, Effect, Layer } from "effect";
import { ClassService } from "../classes/Service.ts";
import { AttendanceRepo } from "./Repo.ts";
import { meetingsOf } from "./rules.ts";

export class AttendanceService extends Context.Service<
  AttendanceService,
  {
    readonly meetings: (teacherId: string, classId: string) => Effect.Effect<ClassMeeting[], NotFound>;
    // Today's meeting of each of the teacher's classes that meets today.
    readonly today: (teacherId: string) => Effect.Effect<ClassMeeting[]>;
    readonly save: (
      teacherId: string,
      input: { classId: string; date: string; records: Readonly<Record<string, AttendanceStatus>> },
    ) => Effect.Effect<ClassMeeting, NotFound | Conflict>;
    // The student's own marks in a class they belong to.
    readonly mine: (userId: string, classId: string) => Effect.Effect<ClassMeeting[], NotFound>;
  }
>()("examinus/api/AttendanceService") {
  static readonly layer = Layer.effect(
    AttendanceService,
    Effect.gen(function* () {
      const repo = yield* AttendanceRepo;
      const classes = yield* ClassService;

      return AttendanceService.of({
        meetings: Effect.fn("AttendanceService.meetings")(function* (teacherId, classId) {
          const cls = yield* classes.ownClass(teacherId, classId);
          return meetingsOf(cls, yield* repo.stored([cls.id]), manilaDate());
        }),

        today: Effect.fn("AttendanceService.today")(function* (teacherId) {
          const today = manilaDate();
          const rows = yield* classes.ownClasses(teacherId);
          const stored = yield* repo.stored(rows.map((r) => r.id));
          return rows.flatMap((cls) =>
            meetingsOf(
              cls,
              stored.filter((m) => m.classId === cls.id),
              today,
            ).filter((m) => m.date === today),
          );
        }),

        save: Effect.fn("AttendanceService.save")(function* (teacherId, { classId, date, records }) {
          const cls = yield* classes.ownClass(teacherId, classId);
          const stored = yield* repo.stored([cls.id]);
          // Only a meeting that has happened: a scheduled day up to today, or one already taken.
          if (!meetingsOf(cls, stored, manilaDate()).some((m) => m.date === date)) {
            return yield* new Conflict({ message: "There's no class meeting on that day yet." });
          }
          const roster = new Set(yield* classes.memberIds(classId));
          // Only exceptions are stored, and only for students on the roster.
          const kept: Record<string, AttendanceStatus> = {};
          for (const [studentId, status] of Object.entries(records))
            if (roster.has(studentId) && status !== "present") kept[studentId] = status;
          const takenAt = new Date();
          yield* repo.save({ classId, date, records: kept, takenAt, takenBy: teacherId });
          return { id: date, classId, date, records: kept, takenAt: takenAt.toISOString() };
        }),

        mine: Effect.fn("AttendanceService.mine")(function* (userId, classId) {
          const membership = yield* classes.membership(userId, classId);
          if (!membership) return yield* new NotFound({ message: "You're not in that class." });
          const { cls, studentId } = membership;
          // Classmates' records stay with the teacher.
          return meetingsOf(cls, yield* repo.stored([cls.id]), manilaDate()).map((m) => ({
            ...m,
            records: m.records[studentId] ? { [studentId]: m.records[studentId] } : {},
          }));
        }),
      });
    }),
  );
}
