import {
  AttendanceRpcs,
  Conflict,
  Forbidden,
  manilaDate,
  meetingDates,
  NotFound,
  type AttendanceStatus,
  type ClassMeeting,
} from "@examora/contract";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Effect } from "effect";
import { Database } from "../Database.ts";
import { classes, classMeetings, classMembers, students, type ClassItem } from "../database/schemas/index.ts";
import { requirePermission } from "../Session.ts";

type StoredMeeting = typeof classMeetings.$inferSelect;

const noSuchClass = () => new NotFound({ message: "That class doesn't exist or isn't yours." });

// The class's meetings so far: every scheduled day from the start of the semester to today, plus any day attendance
// was taken that's no longer on the schedule (it was changed). Newest first.
function meetingsOf(cls: Pick<ClassItem, "id" | "schedule">, stored: readonly StoredMeeting[], today: string) {
  const byDate = new Map(stored.map((m) => [m.date, m]));
  const dates = new Set([...meetingDates(cls.schedule, today), ...byDate.keys()]);
  return [...dates]
    .sort((a, b) => b.localeCompare(a))
    .map((date): ClassMeeting => {
      const m = byDate.get(date);
      return { id: date, classId: cls.id, date, records: m?.records ?? {}, takenAt: m?.takenAt.toISOString() ?? null };
    });
}

export const AttendanceHandlers = AttendanceRpcs.toLayer(
  Effect.gen(function* () {
    const db = yield* Database;

    const storedFor = (classIds: readonly string[]) =>
      classIds.length === 0
        ? Effect.succeed([] as StoredMeeting[])
        : db.query((d) =>
            d
              .select()
              .from(classMeetings)
              .where(inArray(classMeetings.classId, [...classIds])),
          );

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

    return AttendanceRpcs.of({
      "attendance.meetings": Effect.fn("attendance.meetings")(function* ({ classId }) {
        const me = yield* requirePermission({ attendance: ["read"] });
        const cls = yield* ownClass(me.id, classId);
        return meetingsOf(cls, yield* storedFor([cls.id]), manilaDate());
      }),

      "attendance.today": Effect.fn("attendance.today")(function* () {
        const me = yield* requirePermission({ attendance: ["read"] });
        const today = manilaDate();
        const rows = yield* db.query((d) =>
          d
            .select()
            .from(classes)
            .where(and(eq(classes.teacherId, me.id), isNull(classes.archivedAt))),
        );
        const stored = yield* storedFor(rows.map((r) => r.id));
        return rows.flatMap((cls) =>
          meetingsOf(
            cls,
            stored.filter((m) => m.classId === cls.id),
            today,
          ).filter((m) => m.date === today),
        );
      }),

      "attendance.save": Effect.fn("attendance.save")(function* ({ classId, date, records }) {
        const me = yield* requirePermission({ attendance: ["update"] });
        const cls = yield* ownClass(me.id, classId);
        const stored = yield* storedFor([cls.id]);
        // Only a meeting that has happened: a scheduled day up to today, or one already taken.
        if (!meetingsOf(cls, stored, manilaDate()).some((m) => m.date === date)) {
          return yield* new Conflict({ message: "There's no class meeting on that day yet." });
        }
        const roster = new Set(
          (yield* db.query((d) =>
            d.select({ studentId: classMembers.studentId }).from(classMembers).where(eq(classMembers.classId, classId)),
          )).map((m) => m.studentId),
        );
        // Only exceptions are stored, and only for students on the roster.
        const kept: Record<string, AttendanceStatus> = {};
        for (const [studentId, status] of Object.entries(records))
          if (roster.has(studentId) && status !== "present") kept[studentId] = status;
        const takenAt = new Date();
        yield* db.query((d) =>
          d
            .insert(classMeetings)
            .values({ classId, date, records: kept, takenAt, takenBy: me.id })
            .onConflictDoUpdate({
              target: [classMeetings.classId, classMeetings.date],
              set: { records: kept, takenAt, takenBy: me.id },
            }),
        );
        return { id: date, classId, date, records: kept, takenAt: takenAt.toISOString() };
      }),

      "attendance.mine": Effect.fn("attendance.mine")(function* ({ classId }) {
        const user = yield* requirePermission({ enrollment: ["read"] });
        if (user.role !== "student")
          return yield* new Forbidden({ message: "Only students have their own attendance." });
        const [row] = yield* db.query((d) =>
          d
            .select({ cls: classes, studentId: students.id })
            .from(classes)
            .innerJoin(classMembers, eq(classMembers.classId, classes.id))
            .innerJoin(students, eq(students.id, classMembers.studentId))
            .where(and(eq(classes.id, classId), eq(students.userId, user.id), isNull(classes.archivedAt))),
        );
        if (!row) return yield* new NotFound({ message: "You're not in that class." });
        const { cls, studentId } = row;
        // Classmates' records stay with the teacher.
        return meetingsOf(cls, yield* storedFor([cls.id]), manilaDate()).map((m) => ({
          ...m,
          records: m.records[studentId] ? { [studentId]: m.records[studentId] } : {},
        }));
      }),
    });
  }),
);
