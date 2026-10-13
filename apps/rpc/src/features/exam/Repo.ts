// The tables behind exam mode: retakes the teacher granted, the device reset when a student is let back in, and the
// history that makes up an exam record.
import { and, eq, inArray, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import {
  answerHistory,
  answers,
  attempts,
  gradeChanges,
  incidents,
  users,
  type AttemptItem,
  type IncidentItem,
} from "../../database/schemas/index.ts";
import { Database } from "../../platform/Database.ts";

export type AnswerHistoryItem = typeof answerHistory.$inferSelect;
export type GradeChangeItem = typeof gradeChanges.$inferSelect;

export type GradeChangeRow = { change: GradeChangeItem; questionId: string; by: string | null };

export class ExamRepo extends Context.Service<
  ExamRepo,
  {
    // How many retakes the teacher granted this student in each session: one `retake_granted` incident per grant.
    readonly grantedRetakes: (studentId: string, sessionIds: readonly string[]) => Effect.Effect<Map<string, number>>;
    // The statuses of every attempt a student made in a session.
    readonly statusesOf: (sessionId: string, studentId: string) => Effect.Effect<AttemptItem["status"][]>;
    // The next browser to check in becomes the attempt's browser. `touch`: also restarts the exam's grace period.
    readonly releaseDevice: (attemptId: string, touch: boolean) => Effect.Effect<void>;
    // What the exam record adds to the attempt itself: its incidents, every saved answer version and every score change.
    readonly record: (
      sessionId: string,
      attemptId: string,
    ) => Effect.Effect<{ incidents: IncidentItem[]; history: AnswerHistoryItem[]; changes: GradeChangeRow[] }>;
  }
>()("examinus/api/ExamRepo") {
  static readonly layer = Layer.effect(
    ExamRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return ExamRepo.of({
        grantedRetakes: Effect.fn("ExamRepo.grantedRetakes")(function* (studentId, sessionIds) {
          if (sessionIds.length === 0) return new Map<string, number>();
          const rows = yield* db.query((d) =>
            d
              .select({ sessionId: incidents.sessionId, n: sql<number>`count(*)::int` })
              .from(incidents)
              .innerJoin(attempts, eq(incidents.attemptId, attempts.id))
              .where(and(inArray(incidents.sessionId, sessionIds), eq(incidents.kind, "retake_granted"), eq(attempts.studentId, studentId)))
              .groupBy(incidents.sessionId),
          );
          return new Map(rows.map((r) => [r.sessionId, r.n]));
        }),
        statusesOf: Effect.fn("ExamRepo.statusesOf")(function* (sessionId, studentId) {
          const rows = yield* db.query((d) =>
            d.select({ status: attempts.status }).from(attempts).where(and(eq(attempts.sessionId, sessionId), eq(attempts.studentId, studentId))),
          );
          return rows.map((r) => r.status);
        }),
        releaseDevice: Effect.fn("ExamRepo.releaseDevice")(function* (attemptId, touch) {
          yield* db.query((d) =>
            d
              .update(attempts)
              .set({ deviceId: null, ip: null, ...(touch ? { lastSeenAt: new Date() } : {}) })
              .where(eq(attempts.id, attemptId)),
          );
        }),
        record: Effect.fn("ExamRepo.record")(function* (sessionId, attemptId) {
          return yield* Effect.all({
            incidents: db.query((d) =>
              d
                .select()
                .from(incidents)
                .where(and(eq(incidents.sessionId, sessionId), eq(incidents.attemptId, attemptId)))
                .orderBy(incidents.at),
            ),
            history: db.query((d) => d.select().from(answerHistory).where(eq(answerHistory.attemptId, attemptId)).orderBy(answerHistory.savedAt)),
            changes: db.query((d) =>
              d
                .select({ change: gradeChanges, questionId: answers.questionId, by: users.name })
                .from(gradeChanges)
                .innerJoin(answers, eq(gradeChanges.answerId, answers.id))
                .leftJoin(users, eq(gradeChanges.changedBy, users.id))
                .where(eq(answers.attemptId, attemptId))
                .orderBy(gradeChanges.at),
            ),
          });
        }),
      });
    }),
  );
}
