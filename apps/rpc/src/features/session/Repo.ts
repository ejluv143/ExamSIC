// The session tables: when sessions open and end, and the roster accounts of a class.
import { and, eq, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database, type Db } from "../../platform/Database.ts";
import {
  attempts,
  classMembers,
  quizSessions,
  students,
  type AttemptItem,
  type QuizSessionItem,
} from "../../database/schemas/index.ts";

// The accounts of a class's current members, and the roster entries they are.
export const classAccounts = (d: Db, classId: string) =>
  d
    .select({ userId: students.userId, rosterId: students.id })
    .from(classMembers)
    .innerJoin(students, eq(classMembers.studentId, students.id))
    .where(and(eq(classMembers.classId, classId), isNotNull(students.userId)))
    .then((rows) => rows.map((r) => ({ userId: r.userId!, rosterId: r.rosterId })));

export class SessionRepo extends Context.Service<
  SessionRepo,
  {
    // Marks the session ended now (at its closing time when that is earlier), unless it already is.
    readonly markEnded: (sessionId: string, now: Date) => Effect.Effect<void>;
    // The attempts of a session still in progress.
    readonly inProgress: (sessionId: string) => Effect.Effect<{ id: string }[]>;
    // Opens the sessions whose opening time has come and ends those past their closing time (at that time);
    // the ids of both. A paused session's clock is stopped, so it neither ends nor expires anyone.
    readonly advance: (now: Date) => Effect.Effect<{ id: string }[]>;
    // Every in-progress attempt of a session that is not paused, with its session.
    readonly openAttempts: Effect.Effect<{ attempt: AttemptItem; session: QuizSessionItem }[]>;
    readonly classAccounts: (classId: string) => Effect.Effect<{ userId: string; rosterId: string }[]>;
  }
>()("examinus/api/SessionRepo") {
  static readonly layer = Layer.effect(
    SessionRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return SessionRepo.of({
        markEnded: Effect.fn("SessionRepo.markEnded")(function* (sessionId, now) {
          yield* db.query((d) =>
            d
              .update(quizSessions)
              .set({ status: "ended", pausedAt: null, endedAt: sql`least(coalesce(${quizSessions.closesAt}, ${now}), ${now})` })
              .where(and(eq(quizSessions.id, sessionId), ne(quizSessions.status, "ended"))),
          );
        }),
        inProgress: Effect.fn("SessionRepo.inProgress")(function* (sessionId) {
          return yield* db.query((d) =>
            d
              .select({ id: attempts.id })
              .from(attempts)
              .where(and(eq(attempts.sessionId, sessionId), eq(attempts.status, "in_progress"))),
          );
        }),
        advance: Effect.fn("SessionRepo.advance")(function* (now) {
          return yield* db.query(async (d) => {
            const opened = await d
              .update(quizSessions)
              .set({ status: "running", startedAt: sql`${quizSessions.opensAt}` })
              .where(and(eq(quizSessions.status, "scheduled"), isNotNull(quizSessions.opensAt), lte(quizSessions.opensAt, now)))
              .returning({ id: quizSessions.id });
            const closed = await d
              .update(quizSessions)
              .set({ status: "ended", endedAt: sql`${quizSessions.closesAt}` })
              .where(
                and(
                  ne(quizSessions.status, "ended"),
                  isNull(quizSessions.pausedAt),
                  isNotNull(quizSessions.closesAt),
                  lte(quizSessions.closesAt, now),
                ),
              )
              .returning({ id: quizSessions.id });
            return [...opened, ...closed];
          });
        }),
        openAttempts: db.query((d) =>
          d
            .select({ attempt: attempts, session: quizSessions })
            .from(attempts)
            .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
            .where(and(eq(attempts.status, "in_progress"), isNull(quizSessions.pausedAt))),
        ),
        classAccounts: Effect.fn("SessionRepo.classAccounts")(function* (classId) {
          return yield* db.query((d) => classAccounts(d, classId));
        }),
      });
    }),
  );
}
