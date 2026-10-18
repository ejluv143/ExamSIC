// The session tables: sessions and their rosters, when they open and end, and the attempts a teacher sees and
// steers (details, clocks, grades).
import { NotFound } from "@examinus/contract/errors";
import { type AttemptDetail } from "@examinus/contract/session";
import { newJoinKey } from "@examinus/domain/join-key";
import { type Answer, type AttemptStatus, type CodeResults, type TypingEdits } from "@examinus/domain/quiz";
import { and, count, desc, eq, inArray, isNotNull, isNull, lte, ne, notExists, sql, type SQL } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database, type Db } from "../../platform/Database.ts";
import {
  answers,
  attempts,
  classes,
  classMembers,
  codeResults,
  gradeChanges,
  incidents,
  integrityEvents,
  questions,
  quizParts,
  quizSessions,
  quizzes,
  sessionStudents,
  students,
  typingEdits,
  type AnswerItem,
  type AttemptItem,
  type IncidentItem,
  type QuestionItem,
  type QuizItem,
  type QuizSessionItem,
} from "../../database/schemas/index.ts";
import { type Actor } from "../auth/Session.ts";
import { attemptPaper, flatQuestions, scoreOf } from "../attempt/rules.ts";
import { loadParts, loadQuizDetail } from "../quiz/Repo.ts";

// A quiz owned by the actor in the actor's organization.
const ownedQuiz = (actor: Actor) => and(eq(quizzes.ownerId, actor.id), eq(quizzes.organizationId, actor.organizationId));

// The accounts of a class's current members, and the roster entries they are.
export const classAccounts = (d: Db, classId: string) =>
  d
    .select({ userId: students.userId, rosterId: students.id })
    .from(classMembers)
    .innerJoin(students, eq(classMembers.studentId, students.id))
    .where(and(eq(classMembers.classId, classId), isNotNull(students.userId)))
    .then((rows) => rows.map((r) => ({ userId: r.userId!, rosterId: r.rosterId })));

// The columns of a session row that can be written (everything but its identity).
export type SessionColumns = Partial<typeof quizSessions.$inferInsert>;

// Which attempts `attemptDetails` reads: one session's, or a single attempt.
export type AttemptWhere = { sessionId: string } | { attemptId: string };

// One row of the teacher's session list.
export type SessionListRow = {
  session: QuizSessionItem;
  quizTitle: string;
  studentCount: number;
  submittedCount: number;
  needsGrading: number;
};

// What a class's score table is computed from.
export type ClassScoreData = {
  rows: { session: QuizSessionItem; quiz: QuizItem }[];
  parts: Awaited<ReturnType<typeof loadParts>>;
  done: { attempt: AttemptItem; rosterId: string }[];
  answerRows: AnswerItem[];
};

const noSession = new NotFound({ message: "That session doesn't exist." });
const noAttempt = new NotFound({ message: "That attempt doesn't exist." });

// Every attempt matching `where` (of one quiz's session) as the teacher sees it.
const attemptDetails = async (d: Db, quiz: QuizItem, where: SQL | undefined): Promise<AttemptDetail[]> => {
  const detail = await loadQuizDetail(d, quiz);
  const rows = await d
    .select({ attempt: attempts, rosterId: students.id })
    .from(attempts)
    .innerJoin(students, and(eq(students.userId, attempts.studentId), eq(students.organizationId, quiz.organizationId)))
    .where(where)
    .orderBy(attempts.startedAt);
  const ids = rows.map((r) => r.attempt.id);
  if (ids.length === 0) return [];
  const answerRows = await d.select().from(answers).where(inArray(answers.attemptId, ids));
  const answerIds = answerRows.map((a) => a.id);
  const [events, results, typing] = await Promise.all([
    d.select().from(integrityEvents).where(inArray(integrityEvents.attemptId, ids)).orderBy(integrityEvents.at),
    answerIds.length ? d.select().from(codeResults).where(inArray(codeResults.answerId, answerIds)) : [],
    answerIds.length ? d.select().from(typingEdits).where(inArray(typingEdits.answerId, answerIds)) : [],
  ]);
  return rows.map(({ attempt, rosterId }) => {
    const mine = answerRows.filter((a) => a.attemptId === attempt.id);
    const byAnswer = new Map(mine.map((a) => [a.id, a.questionId]));
    const codeByQuestion: Record<string, CodeResults> = {};
    for (const r of results) {
      const q = byAnswer.get(r.answerId);
      if (q) codeByQuestion[q] = r.results;
    }
    const typingByQuestion: Record<string, TypingEdits> = {};
    for (const t of typing) {
      const q = byAnswer.get(t.answerId);
      if (q) typingByQuestion[q] = t.edits;
    }
    return {
      attempt: {
        id: attempt.id,
        sessionId: attempt.sessionId,
        studentId: attempt.studentId,
        seed: attempt.seed,
        status: attempt.status,
        startedAt: attempt.startedAt.toISOString(),
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        pledgeAcceptedAt: attempt.pledgeAcceptedAt?.toISOString() ?? null,
      },
      studentId: rosterId,
      questionOrder: flatQuestions(attemptPaper(detail, attempt.seed)).map((q) => q.id),
      answers: mine.map(
        (a): Answer => ({
          attemptId: a.attemptId,
          questionId: a.questionId,
          value: a.value ?? null,
          correct: a.correct,
          autoScore: a.autoScore,
          manualScore: a.manualScore,
          feedback: a.feedback,
          markedForReview: a.markedForReview,
          ...(a.timeSpentMs === null ? {} : { timeSpentMs: a.timeSpentMs }),
          ...(a.tries > 0 ? { tries: a.tries, triesLog: a.triesLog ?? [] } : {}),
          answeredAt: a.answeredAt.toISOString(),
        }),
      ),
      integrityEvents: events
        .filter((e) => e.attemptId === attempt.id)
        .map((e) => ({
          type: e.type,
          at: e.at.toISOString(),
          ...(e.durationMs === null ? {} : { durationMs: e.durationMs }),
        })),
      ip: attempt.ip,
      deviceId: attempt.deviceId,
      codeResults: codeByQuestion,
      typing: typingByQuestion,
      aiSuggestions: Object.fromEntries(
        mine.flatMap((a) => {
          // Only while the answer is the one the AI graded.
          if (!a.aiSuggestion || a.aiSuggestion.answer !== a.value) return [];
          const { answer: _answer, ...suggestion } = a.aiSuggestion;
          return [[a.questionId, suggestion]];
        }),
      ),
    };
  });
};

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
    // A session of one of this teacher's quizzes, or NotFound.
    readonly ownSession: (
      sessionId: string,
      actor: Actor,
    ) => Effect.Effect<{ session: QuizSessionItem; quiz: QuizItem }, NotFound>;
    // An attempt of one of this teacher's sessions, or NotFound.
    readonly ownAttemptOf: (
      attemptId: string,
      actor: Actor,
    ) => Effect.Effect<{ attempt: AttemptItem; session: QuizSessionItem; quiz: QuizItem }, NotFound>;
    // A class of this teacher that isn't archived, or NotFound.
    readonly ownClass: (classId: string, actor: Actor) => Effect.Effect<void, NotFound>;
    // A quiz of this teacher, or NotFound.
    readonly ownQuiz: (quizId: string, actor: Actor) => Effect.Effect<void, NotFound>;
    // The session row (it must exist).
    readonly find: (sessionId: string) => Effect.Effect<QuizSessionItem>;
    // Creates a session with a fresh join key. The key must be unique among sessions that have not ended; a clash
    // (the partial unique index) draws a new one.
    readonly insert: (
      values: Omit<typeof quizSessions.$inferInsert, "joinCode">,
    ) => Effect.Effect<QuizSessionItem>;
    readonly update: (sessionId: string, set: SessionColumns) => Effect.Effect<void>;
    readonly remove: (sessionId: string) => Effect.Effect<void>;
    // Puts the class's current members on the session's roster. Members already on it (or removed from it) are
    // left as they are. `replace`, for a session that moved to another class, first drops the old class's students,
    // except those who already have an attempt (they keep their paper and result) and those the teacher removed
    // (they stay out), as leaveSessions does.
    readonly syncRoster: (sessionId: string, classId: string, replace: boolean) => Effect.Effect<void>;
    // The teacher's sessions (of one quiz and/or class) with their roster and submission counts, newest first.
    readonly list: (
      actor: Actor,
      filter: { quizId?: string | undefined; classId?: string | undefined },
    ) => Effect.Effect<SessionListRow[]>;
    // The roster entries of the students on the session's roster (not removed).
    readonly rosterIds: (sessionId: string) => Effect.Effect<string[]>;
    // The attempts matching `where` as the teacher sees them.
    readonly attemptDetails: (quiz: QuizItem, where: AttemptWhere) => Effect.Effect<AttemptDetail[]>;
    // The teacher-written incidents of one attempt, oldest first.
    readonly incidentsOf: (sessionId: string, attemptId: string) => Effect.Effect<IncidentItem[]>;
    // Writes columns of an attempt.
    readonly updateAttempt: (attemptId: string, set: Partial<AttemptItem>) => Effect.Effect<void>;
    // Moves every deadline of the session by `ms` (a pause that ended, or time added for everyone): the session's
    // close, and the attempts in progress whose own time limit is what ends them. `shiftQuestions` also moves the
    // start of the question each student is on. `set` is changed on the session in the same step.
    readonly shiftClocks: (
      session: QuizSessionItem,
      ms: number,
      shiftQuestions: boolean,
      set: { pausedAt?: null },
    ) => Effect.Effect<void>;
    // A question of the quiz, or NotFound.
    readonly questionOf: (quizId: string, questionId: string) => Effect.Effect<QuestionItem, NotFound>;
    // The student's answer to a question, if any.
    readonly answerOf: (attemptId: string, questionId: string) => Effect.Effect<AnswerItem | undefined>;
    // Stores a manual score and feedback (logging the change when `change` is given), then, for a submitted
    // attempt, settles its status from what is still ungraded.
    readonly saveGrade: (input: {
      attempt: AttemptItem;
      quiz: QuizItem;
      questionId: string;
      manualScore: number | null;
      feedback: string | null;
      change: { changedBy: string; oldScore: number | null; newScore: number | null; reason: string } | null;
    }) => Effect.Effect<{ status: AttemptStatus }>;
    // The sessions of a class (of this teacher's quizzes) with what their scores are computed from.
    readonly classScoreData: (actor: Actor, classId: string) => Effect.Effect<ClassScoreData>;
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
              .set({ status: "lobby" })
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
        ownSession: Effect.fn("SessionRepo.ownSession")(function* (sessionId, actor) {
          const [row] = yield* db.query((d) =>
            d
              .select({ session: quizSessions, quiz: quizzes })
              .from(quizSessions)
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .where(and(eq(quizSessions.id, sessionId), ownedQuiz(actor))),
          );
          return row ?? (yield* noSession);
        }),
        ownAttemptOf: Effect.fn("SessionRepo.ownAttemptOf")(function* (attemptId, actor) {
          const [row] = yield* db.query((d) =>
            d
              .select({ attempt: attempts, session: quizSessions, quiz: quizzes })
              .from(attempts)
              .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .where(and(eq(attempts.id, attemptId), ownedQuiz(actor))),
          );
          return row ?? (yield* noAttempt);
        }),
        ownClass: Effect.fn("SessionRepo.ownClass")(function* (classId, actor) {
          const [row] = yield* db.query((d) =>
            d
              .select({ id: classes.id })
              .from(classes)
              .where(
                and(
                  eq(classes.id, classId),
                  eq(classes.teacherId, actor.id),
                  eq(classes.organizationId, actor.organizationId),
                  isNull(classes.archivedAt),
                ),
              ),
          );
          if (!row) return yield* new NotFound({ message: "That class doesn't exist." });
        }),
        ownQuiz: Effect.fn("SessionRepo.ownQuiz")(function* (quizId, actor) {
          const [row] = yield* db.query((d) =>
            d
              .select({ id: quizzes.id })
              .from(quizzes)
              .where(and(eq(quizzes.id, quizId), ownedQuiz(actor))),
          );
          if (!row) return yield* new NotFound({ message: "That quiz doesn't exist." });
        }),
        find: Effect.fn("SessionRepo.find")(function* (sessionId) {
          const [row] = yield* db.query((d) => d.select().from(quizSessions).where(eq(quizSessions.id, sessionId)));
          return row!;
        }),
        insert: Effect.fn("SessionRepo.insert")(function* (values) {
          return yield* db.query(async (d) => {
            for (let attempt = 0; attempt < 20; attempt++) {
              const [created] = await d
                .insert(quizSessions)
                .values({ ...values, joinCode: newJoinKey() })
                .onConflictDoNothing()
                .returning();
              if (created) return created;
            }
            throw new Error("Could not find a free join key.");
          });
        }),
        update: Effect.fn("SessionRepo.update")(function* (sessionId, set) {
          yield* db.query((d) => d.update(quizSessions).set(set).where(eq(quizSessions.id, sessionId)));
        }),
        remove: Effect.fn("SessionRepo.remove")(function* (sessionId) {
          yield* db.query((d) => d.delete(quizSessions).where(eq(quizSessions.id, sessionId)));
        }),
        syncRoster: Effect.fn("SessionRepo.syncRoster")(function* (sessionId, classId, replace) {
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              if (replace)
                await tx.delete(sessionStudents).where(
                  and(
                    eq(sessionStudents.sessionId, sessionId),
                    isNull(sessionStudents.removedAt),
                    notExists(
                      tx
                        .select({ id: attempts.id })
                        .from(attempts)
                        .where(and(eq(attempts.sessionId, sessionId), eq(attempts.studentId, sessionStudents.studentId))),
                    ),
                  ),
                );
              const accounts = await classAccounts(tx, classId);
              if (accounts.length)
                await tx
                  .insert(sessionStudents)
                  .values(accounts.map((a) => ({ sessionId, studentId: a.userId })))
                  .onConflictDoNothing();
            }),
          );
        }),
        list: Effect.fn("SessionRepo.list")(function* (actor, { quizId, classId }) {
          return yield* db.query(async (d): Promise<SessionListRow[]> => {
            const rows = await d
              .select({ session: quizSessions, quizTitle: quizzes.title })
              .from(quizSessions)
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .where(
                and(
                  ownedQuiz(actor),
                  quizId === undefined ? undefined : eq(quizSessions.quizId, quizId),
                  classId === undefined ? undefined : eq(quizSessions.classId, classId),
                ),
              )
              .orderBy(desc(quizSessions.createdAt));
            const ids = rows.map((r) => r.session.id);
            if (ids.length === 0) return [];
            const roster = await d
              .select({ sessionId: sessionStudents.sessionId, n: count() })
              .from(sessionStudents)
              .where(and(inArray(sessionStudents.sessionId, ids), isNull(sessionStudents.removedAt)))
              .groupBy(sessionStudents.sessionId);
            const submitted = await d
              .select({
                sessionId: attempts.sessionId,
                students: sql<number>`count(distinct ${attempts.studentId})::int`,
                waiting: sql<number>`count(*) filter (where ${attempts.status} = 'needs_grading')::int`,
              })
              .from(attempts)
              .where(and(inArray(attempts.sessionId, ids), ne(attempts.status, "in_progress")))
              .groupBy(attempts.sessionId);
            return rows.map((r) => ({
              session: r.session,
              quizTitle: r.quizTitle,
              studentCount: roster.find((x) => x.sessionId === r.session.id)?.n ?? 0,
              submittedCount: submitted.find((x) => x.sessionId === r.session.id)?.students ?? 0,
              needsGrading: submitted.find((x) => x.sessionId === r.session.id)?.waiting ?? 0,
            }));
          });
        }),
        rosterIds: Effect.fn("SessionRepo.rosterIds")(function* (sessionId) {
          const rows = yield* db.query((d) =>
            d
              .select({ rosterId: students.id })
              .from(sessionStudents)
              .innerJoin(quizSessions, eq(quizSessions.id, sessionStudents.sessionId))
              .innerJoin(quizzes, eq(quizzes.id, quizSessions.quizId))
              .innerJoin(
                students,
                and(eq(students.userId, sessionStudents.studentId), eq(students.organizationId, quizzes.organizationId)),
              )
              .where(and(eq(sessionStudents.sessionId, sessionId), isNull(sessionStudents.removedAt))),
          );
          return rows.map((r) => r.rosterId);
        }),
        attemptDetails: Effect.fn("SessionRepo.attemptDetails")(function* (quiz, where) {
          return yield* db.query((d) =>
            attemptDetails(d, quiz, "sessionId" in where ? eq(attempts.sessionId, where.sessionId) : eq(attempts.id, where.attemptId)),
          );
        }),
        incidentsOf: Effect.fn("SessionRepo.incidentsOf")(function* (sessionId, attemptId) {
          return yield* db.query((d) =>
            d
              .select()
              .from(incidents)
              .where(and(eq(incidents.sessionId, sessionId), eq(incidents.attemptId, attemptId)))
              .orderBy(incidents.at),
          );
        }),
        updateAttempt: Effect.fn("SessionRepo.updateAttempt")(function* (attemptId, set) {
          yield* db.query((d) => d.update(attempts).set(set).where(eq(attempts.id, attemptId)));
        }),
        shiftClocks: Effect.fn("SessionRepo.shiftClocks")(function* (session, ms, shiftQuestions, set) {
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              const close = session.closesAt?.getTime() ?? null;
              const open = await tx
                .select()
                .from(attempts)
                .where(and(eq(attempts.sessionId, session.id), eq(attempts.status, "in_progress")));
              for (const a of open) {
                const limitEnd = session.timeLimitMinutes === null ? null : a.startedAt.getTime() + session.timeLimitMinutes * 60_000;
                const limitBound = limitEnd !== null && (close === null || limitEnd <= close);
                const moveQuestion = shiftQuestions && a.questionStartedAt !== null;
                if (!limitBound && !moveQuestion) continue;
                await tx
                  .update(attempts)
                  .set({
                    ...(limitBound ? { extraMs: a.extraMs + ms } : {}),
                    ...(moveQuestion ? { questionStartedAt: new Date(a.questionStartedAt!.getTime() + ms) } : {}),
                  })
                  .where(eq(attempts.id, a.id));
              }
              const next = { ...set, ...(close === null ? {} : { closesAt: new Date(close + ms) }) };
              if (Object.keys(next).length > 0) await tx.update(quizSessions).set(next).where(eq(quizSessions.id, session.id));
            }),
          );
        }),
        questionOf: Effect.fn("SessionRepo.questionOf")(function* (quizId, questionId) {
          const [row] = yield* db.query((d) =>
            d
              .select({ question: questions })
              .from(questions)
              .innerJoin(quizParts, eq(questions.partId, quizParts.id))
              .where(and(eq(questions.id, questionId), eq(quizParts.quizId, quizId))),
          );
          return row ? row.question : yield* new NotFound({ message: "That question isn't in this quiz." });
        }),
        answerOf: Effect.fn("SessionRepo.answerOf")(function* (attemptId, questionId) {
          const [row] = yield* db.query((d) =>
            d.select().from(answers).where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId))),
          );
          return row;
        }),
        saveGrade: Effect.fn("SessionRepo.saveGrade")(function* ({ attempt, quiz, questionId, manualScore, feedback, change }) {
          return yield* db.query((d) =>
            d.transaction(async (tx) => {
              const set = { manualScore, feedback };
              const [saved] = await tx
                .insert(answers)
                .values({ attemptId: attempt.id, questionId, value: null, ...set })
                .onConflictDoUpdate({ target: [answers.attemptId, answers.questionId], set })
                .returning({ id: answers.id });
              if (change) await tx.insert(gradeChanges).values({ answerId: saved!.id, ...change, at: new Date() });
              if (attempt.status === "in_progress") return { status: attempt.status as AttemptStatus };
              const detail = await loadQuizDetail(tx, quiz);
              const rows = await tx.select().from(answers).where(eq(answers.attemptId, attempt.id));
              const paper = flatQuestions(attemptPaper(detail, attempt.seed));
              const status: AttemptStatus = scoreOf(paper, rows).ungraded > 0 ? "needs_grading" : "graded";
              await tx.update(attempts).set({ status }).where(eq(attempts.id, attempt.id));
              return { status };
            }),
          );
        }),
        classScoreData: Effect.fn("SessionRepo.classScoreData")(function* (actor, classId) {
          return yield* db.query(async (d): Promise<ClassScoreData> => {
            const rows = await d
              .select({ session: quizSessions, quiz: quizzes })
              .from(quizSessions)
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .where(and(eq(quizSessions.classId, classId), ownedQuiz(actor)))
              .orderBy(quizSessions.createdAt);
            if (rows.length === 0) return { rows, parts: new Map(), done: [], answerRows: [] };
            const parts = await loadParts(d, [...new Set(rows.map((r) => r.quiz.id))]);
            const done = await d
              .select({ attempt: attempts, rosterId: students.id })
              .from(attempts)
              .innerJoin(students, and(eq(students.userId, attempts.studentId), eq(students.organizationId, actor.organizationId)))
              .where(and(inArray(attempts.sessionId, rows.map((r) => r.session.id)), ne(attempts.status, "in_progress")));
            const answerRows = done.length
              ? await d.select().from(answers).where(inArray(answers.attemptId, done.map((x) => x.attempt.id)))
              : [];
            return { rows, parts, done, answerRows };
          });
        }),
      });
    }),
  );
}
