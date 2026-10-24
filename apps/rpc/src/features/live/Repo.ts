// The tables behind live sessions: who owns what, what a stream rebuilds from, and the incident log.
import type { IncidentKind } from "@examinus/contract/live";
import { type Accommodations } from "@examinus/domain/accommodations";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { type Actor } from "../auth/Session.ts";
import { Context, Effect, Layer } from "effect";
import { Database } from "../../platform/Database.ts";
import { organizationIs, sameOrganization } from "../../platform/organization-scope.ts";
import {
  answers,
  attempts,
  incidents,
  integrityEvents,
  quizSessions,
  quizzes,
  sessionStudents,
  students,
  type AnswerItem,
  type AttemptItem,
  type IncidentItem,
  type IntegrityEventItem,
  type QuizItem,
  type QuizSessionItem,
} from "../../database/schemas/index.ts";

// One attempt with its session, for refreshing its row.
export type LoadedAttempt = { attempt: AttemptItem; session: QuizSessionItem; quiz: QuizItem; rosterId: string;
  joinedAt: Date | null;
  accommodations: Accommodations | null;
};

// Everything a session's table is built from.
export type SessionData = {
  roster: { userId: string; rosterId: string; joinedAt: Date | null; accommodations: Accommodations | null }[];
  attemptRows: AttemptItem[];
  answerRows: AnswerItem[];
  eventRows: IntegrityEventItem[];
  incidentRows: IncidentItem[];
};

export type NewIncident = {
  sessionId: string;
  attemptId: string | null;
  actorId: string;
  kind: IncidentKind;
  message?: string;
  seconds?: number;
};

export class LiveRepo extends Context.Service<
  LiveRepo,
  {
    // Whether this teacher owns the session, in their organization.
    readonly ownsSession: (sessionId: string, actor: Actor) => Effect.Effect<boolean>;
    // Whether this student owns the attempt.
    readonly ownsAttempt: (attemptId: string, userId: string) => Effect.Effect<boolean>;
    // The status of the student's own attempt, or null when it isn't theirs.
    readonly attemptStatus: (attemptId: string, userId: string) => Effect.Effect<AttemptItem["status"] | null>;
    readonly sessionWithQuiz: (sessionId: string) => Effect.Effect<{ session: QuizSessionItem; quiz: QuizItem } | null>;
    // The roster, attempts, answers, events and the latest incidents of a session.
    readonly sessionData: (sessionId: string) => Effect.Effect<SessionData>;
    readonly loadAttempt: (attemptId: string) => Effect.Effect<LoadedAttempt | null>;
    // The answers and events of one attempt.
    readonly attemptData: (
      attemptId: string,
    ) => Effect.Effect<{ answerRows: AnswerItem[]; eventRows: IntegrityEventItem[] }>;
    readonly insertIncident: (input: NewIncident) => Effect.Effect<IncidentItem>;
  }
>()("examinus/api/LiveRepo") {
  static readonly layer = Layer.effect(
    LiveRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return LiveRepo.of({
        ownsSession: Effect.fn("LiveRepo.ownsSession")(function* (sessionId, actor) {
          const rows = yield* db.query((d) =>
            d
              .select({ id: quizSessions.id })
              .from(quizSessions)
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .where(
                and(
                  eq(quizSessions.id, sessionId),
                  eq(quizzes.ownerId, actor.id),
                  organizationIs(quizzes.organizationId, actor.organizationId),
                ),
              ),
          );
          return rows.length > 0;
        }),
        ownsAttempt: Effect.fn("LiveRepo.ownsAttempt")(function* (attemptId, userId) {
          const rows = yield* db.query((d) =>
            d.select({ id: attempts.id }).from(attempts).where(and(eq(attempts.id, attemptId), eq(attempts.studentId, userId))),
          );
          return rows.length > 0;
        }),
        attemptStatus: Effect.fn("LiveRepo.attemptStatus")(function* (attemptId, userId) {
          const [row] = yield* db.query((d) =>
            d
              .select({ status: attempts.status })
              .from(attempts)
              .where(and(eq(attempts.id, attemptId), eq(attempts.studentId, userId))),
          );
          return row?.status ?? null;
        }),
        sessionWithQuiz: Effect.fn("LiveRepo.sessionWithQuiz")(function* (sessionId) {
          const [head] = yield* db.query((d) =>
            d
              .select({ session: quizSessions, quiz: quizzes })
              .from(quizSessions)
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .where(eq(quizSessions.id, sessionId)),
          );
          return head ?? null;
        }),
        sessionData: Effect.fn("LiveRepo.sessionData")(function* (sessionId) {
          return yield* db.query(async (d): Promise<SessionData> => {
            const roster = await d
              .select({
                userId: sessionStudents.studentId,
                rosterId: students.id,
                joinedAt: sessionStudents.joinedAt,
                accommodations: sessionStudents.accommodations,
              })
              .from(sessionStudents)
              .innerJoin(quizSessions, eq(quizSessions.id, sessionStudents.sessionId))
              .innerJoin(quizzes, eq(quizzes.id, quizSessions.quizId))
              .innerJoin(
                students,
                and(eq(students.userId, sessionStudents.studentId), sameOrganization(students.organizationId, quizzes.organizationId)),
              )
              .where(and(eq(sessionStudents.sessionId, sessionId), isNull(sessionStudents.removedAt)));
            const attemptRows = await d.select().from(attempts).where(eq(attempts.sessionId, sessionId));
            const ids = attemptRows.map((a) => a.id);
            const [answerRows, eventRows, incidentRows] = await Promise.all([
              ids.length ? d.select().from(answers).where(inArray(answers.attemptId, ids)) : [],
              ids.length ? d.select().from(integrityEvents).where(inArray(integrityEvents.attemptId, ids)) : [],
              d.select().from(incidents).where(eq(incidents.sessionId, sessionId)).orderBy(desc(incidents.at)).limit(300),
            ]);
            return { roster, attemptRows, answerRows, eventRows, incidentRows };
          });
        }),
        loadAttempt: Effect.fn("LiveRepo.loadAttempt")(function* (attemptId) {
          const [row] = yield* db.query((d) =>
            d
              .select({ attempt: attempts, session: quizSessions, quiz: quizzes, rosterId: students.id, joinedAt: sessionStudents.joinedAt, accommodations: sessionStudents.accommodations })
              .from(attempts)
              .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .innerJoin(
                students,
                and(eq(students.userId, attempts.studentId), sameOrganization(students.organizationId, quizzes.organizationId)),
              )
              .leftJoin(sessionStudents, and(eq(sessionStudents.sessionId, attempts.sessionId), eq(sessionStudents.studentId, attempts.studentId)))
              .where(eq(attempts.id, attemptId)),
          );
          return row ?? null;
        }),
        attemptData: Effect.fn("LiveRepo.attemptData")(function* (attemptId) {
          const [answerRows, eventRows] = yield* db.query((d) =>
            Promise.all([
              d.select().from(answers).where(eq(answers.attemptId, attemptId)),
              d.select().from(integrityEvents).where(eq(integrityEvents.attemptId, attemptId)),
            ]),
          );
          return { answerRows, eventRows };
        }),
        insertIncident: Effect.fn("LiveRepo.insertIncident")(function* (input) {
          const [row] = yield* db.query((d) =>
            d
              .insert(incidents)
              .values({
                sessionId: input.sessionId,
                attemptId: input.attemptId,
                actorId: input.actorId,
                kind: input.kind,
                message: input.message ?? null,
                seconds: input.seconds ?? null,
                at: new Date(),
              })
              .returning(),
          );
          return row!;
        }),
      });
    }),
  );
}
