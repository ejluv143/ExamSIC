import { ClassRecordRpcs, Forbidden, NotFound, type ClassRecord } from "@examora/contract";
import { and, eq, isNull } from "drizzle-orm";
import { Effect } from "effect";
import { Database } from "../Database.ts";
import { classes, classMembers, classRecords, quizSessions, quizzes, students } from "../database/schemas/index.ts";
import { requirePermission } from "../Session.ts";

type StoredRecord = typeof classRecords.$inferSelect;

const terms = ["midterm", "final"] as const;

const toRecord = (row: StoredRecord): ClassRecord => ({
  classId: row.classId,
  terms: row.terms,
  scores: row.scores,
  absences: row.absences,
  dropped: row.dropped,
  unlinked: row.unlinked,
  signatories: row.signatories,
});

// Keeps a record from the editor in bounds: numbers in range, text cut to length, and only this class's
// students and sessions.
export function cleanRecord(
  raw: ClassRecord,
  enrolled: ReadonlySet<string>,
  sessionIds: ReadonlySet<string>,
): Omit<ClassRecord, "classId"> {
  const num = (v: number, max: number) => (Number.isFinite(v) && v >= 0 && v <= max ? v : null);
  const text = (v: string, max: number) => v.slice(0, max);
  const clean = { midterm: [], final: [] } as { [T in (typeof terms)[number]]: ClassRecord["terms"][T][number][] };
  for (const term of terms)
    clean[term] = raw.terms[term].slice(0, 20).map((c) => ({
      id: text(c.id, 40),
      name: text(c.name, 60) || "Category",
      weight: num(c.weight, 100) ?? 0,
      isExam: c.isExam,
      items: c.items.slice(0, 40).map((i) => ({
        id: text(i.id, 40),
        title: text(i.title, 80),
        maxScore: num(i.maxScore, 1000) ?? 0,
        sessionId: i.sessionId !== null && sessionIds.has(i.sessionId) ? i.sessionId : null,
        ...(i.source === "attendance" ? { source: "attendance" as const } : {}),
      })),
    }));
  const scores: Record<string, Record<string, number | null>> = {};
  for (const [itemId, byStudent] of Object.entries(raw.scores))
    scores[itemId] = Object.fromEntries(
      Object.entries(byStudent)
        .filter(([sid]) => enrolled.has(sid))
        .map(([sid, v]) => [sid, v === null ? null : num(v, 1000)]),
    );
  const absences = { midterm: {}, final: {} } as Record<(typeof terms)[number], Record<string, number>>;
  for (const term of terms)
    for (const [sid, v] of Object.entries(raw.absences[term]))
      if (enrolled.has(sid) && num(v, 200) !== null) absences[term][sid] = Math.floor(v);
  return {
    terms: clean,
    scores,
    absences,
    dropped: [...new Set(raw.dropped.filter((sid) => enrolled.has(sid)))],
    unlinked: [...new Set((raw.unlinked ?? []).filter((id) => sessionIds.has(id)))],
    signatories: {
      dean: text(raw.signatories.dean, 80),
      vpaa: text(raw.signatories.vpaa, 80),
      registrar: text(raw.signatories.registrar, 80),
    },
  };
}

// Only one student's part of a record: the categories and items, their own scores and absences, and their DR mark.
function onlyStudent(record: ClassRecord, studentId: string): ClassRecord {
  const own = <V>(byStudent: Record<string, V>) => (studentId in byStudent ? { [studentId]: byStudent[studentId]! } : {});
  return {
    ...record,
    scores: Object.fromEntries(Object.entries(record.scores).map(([itemId, byStudent]) => [itemId, own(byStudent)])),
    absences: { midterm: own(record.absences.midterm), final: own(record.absences.final) },
    dropped: record.dropped.filter((sid) => sid === studentId),
  };
}

export const ClassRecordHandlers = ClassRecordRpcs.toLayer(
  Effect.gen(function* () {
    const db = yield* Database;

    // The signed-in teacher's class, unless it's archived.
    const ownClass = Effect.fn("ownClass")(function* (teacherId: string, classId: string) {
      const [row] = yield* db.query((d) =>
        d
          .select()
          .from(classes)
          .where(and(eq(classes.id, classId), eq(classes.teacherId, teacherId), isNull(classes.archivedAt))),
      );
      if (!row) return yield* new NotFound({ message: "That class doesn't exist or isn't yours." });
      return row;
    });

    const stored = (classId: string) =>
      db.query((d) => d.select().from(classRecords).where(eq(classRecords.classId, classId))).pipe(
        Effect.map(([row]) => (row ? toRecord(row) : null)),
      );

    return ClassRecordRpcs.of({
      "classRecord.get": Effect.fn("classRecord.get")(function* ({ classId }) {
        const me = yield* requirePermission({ classRecord: ["read"] });
        yield* ownClass(me.id, classId);
        return yield* stored(classId);
      }),

      "classRecord.save": Effect.fn("classRecord.save")(function* ({ record }) {
        const me = yield* requirePermission({ classRecord: ["update"] });
        const { classId } = record;
        yield* ownClass(me.id, classId);
        const [roster, sessions] = yield* Effect.all(
          [
            db.query((d) =>
              d.select({ id: classMembers.studentId }).from(classMembers).where(eq(classMembers.classId, classId)),
            ),
            // The teacher's own sessions for this class, the ones an item can be linked to.
            db.query((d) =>
              d
                .select({ id: quizSessions.id })
                .from(quizSessions)
                .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
                .where(and(eq(quizSessions.classId, classId), eq(quizzes.ownerId, me.id))),
            ),
          ],
          { concurrency: "unbounded" },
        );
        const kept = cleanRecord(
          record,
          new Set(roster.map((r) => r.id)),
          new Set(sessions.map((s) => s.id)),
        );
        yield* db.query((d) =>
          d
            .insert(classRecords)
            .values({ classId, ...kept, updatedBy: me.id })
            .onConflictDoUpdate({ target: classRecords.classId, set: { ...kept, updatedBy: me.id } }),
        );
        return { classId, ...kept };
      }),

      "classRecord.mine": Effect.fn("classRecord.mine")(function* ({ classId }) {
        const user = yield* requirePermission({ enrollment: ["read"] });
        if (user.role !== "student") return yield* new Forbidden({ message: "Only students have their own record." });
        const [row] = yield* db.query((d) =>
          d
            .select({ studentId: students.id })
            .from(classes)
            .innerJoin(classMembers, eq(classMembers.classId, classes.id))
            .innerJoin(students, eq(students.id, classMembers.studentId))
            .where(and(eq(classes.id, classId), eq(students.userId, user.id), isNull(classes.archivedAt))),
        );
        if (!row) return yield* new NotFound({ message: "You're not in that class." });
        const record = yield* stored(classId);
        // Classmates' scores stay with the teacher.
        return record && onlyStudent(record, row.studentId);
      }),
    });
  }),
);
