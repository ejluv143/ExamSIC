// The class record table (grade sheet) and the sessions an item of it can be linked to.
import type { ClassRecord } from "@examinus/contract";
import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database } from "../../platform/Database.ts";
import { classRecords, quizSessions, quizzes } from "../../database/schemas/index.ts";

type StoredRecord = typeof classRecords.$inferSelect;

const toRecord = (row: StoredRecord): ClassRecord => ({
  classId: row.classId,
  terms: row.terms,
  scores: row.scores,
  absences: row.absences,
  dropped: row.dropped,
  unlinked: row.unlinked,
  signatories: row.signatories,
});

export class RecordsRepo extends Context.Service<
  RecordsRepo,
  {
    // The class's record, or null before the teacher saves one.
    readonly find: (classId: string) => Effect.Effect<ClassRecord | null>;
    // The teacher's own sessions for the class, the ones an item can be linked to.
    readonly sessionIds: (classId: string, teacherId: string) => Effect.Effect<string[]>;
    readonly save: (
      classId: string,
      record: Omit<ClassRecord, "classId">,
      updatedBy: string,
    ) => Effect.Effect<void>;
  }
>()("examinus/api/RecordsRepo") {
  static readonly layer = Layer.effect(
    RecordsRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return RecordsRepo.of({
        find: Effect.fn("RecordsRepo.find")(function* (classId) {
          const [row] = yield* db.query((d) => d.select().from(classRecords).where(eq(classRecords.classId, classId)));
          return row ? toRecord(row) : null;
        }),
        sessionIds: Effect.fn("RecordsRepo.sessionIds")(function* (classId, teacherId) {
          const rows = yield* db.query((d) =>
            d
              .select({ id: quizSessions.id })
              .from(quizSessions)
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .where(and(eq(quizSessions.classId, classId), eq(quizzes.ownerId, teacherId))),
          );
          return rows.map((s) => s.id);
        }),
        save: Effect.fn("RecordsRepo.save")(function* (classId, record, updatedBy) {
          yield* db.query((d) =>
            d
              .insert(classRecords)
              .values({ classId, ...record, updatedBy })
              .onConflictDoUpdate({ target: classRecords.classId, set: { ...record, updatedBy } }),
          );
        }),
      });
    }),
  );
}
