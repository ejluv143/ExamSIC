import {
  Conflict,
  NotFound,
  SessionRpcs,
  attemptScore,
  orderForAttempt,
  quizTotals,
  type Answer,
  type AttemptDetail,
  type AttemptStatus,
  type ClassSessionScores,
  type CodeResults,
  type SessionSettingsFields,
  type TypingEdits,
} from "@examora/contract";
import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Effect } from "effect";
import { Database } from "../Database.ts";
import {
  answers,
  attempts,
  codeResults,
  integrityEvents,
  questions,
  quizParts,
  quizSessions,
  quizzes,
  sessionStudents,
  typingEdits,
  users,
} from "../database/schemas/index.ts";
import {
  accountsOfRoster,
  attemptPaper,
  flatQuestions,
  loadParts,
  loadQuizDetail,
  Quizzes,
  scoreOf,
  sessionStatus,
  toSession,
} from "../Quizzes.ts";
import { invalidAllowlistEntry } from "../network.ts";
import { requirePermission } from "../Session.ts";

const noSession = new NotFound({ message: "That session doesn't exist." });

// The code the teacher shows so students can find the room: six characters without look-alikes.
const joinCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newJoinCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => joinCodeAlphabet[b % joinCodeAlphabet.length]).join("");

// Validates the schedule and limits and returns them as column values.
const settingsColumns = Effect.fn("settingsColumns")(function* (s: SessionSettingsFields) {
  const opensAt = s.opensAt === null ? null : new Date(s.opensAt);
  const closesAt = s.closesAt === null ? null : new Date(s.closesAt);
  if ((opensAt && Number.isNaN(opensAt.getTime())) || (closesAt && Number.isNaN(closesAt.getTime())))
    return yield* new Conflict({ message: "The open and close times aren't valid dates." });
  if (opensAt && closesAt && closesAt <= opensAt) return yield* new Conflict({ message: "The session must close after it opens." });
  if (s.timeLimitMinutes !== null && s.timeLimitMinutes < 1) return yield* new Conflict({ message: "The time limit must be at least a minute." });
  if (s.attemptsAllowed !== null && s.attemptsAllowed < 1) return yield* new Conflict({ message: "Students need at least one attempt." });
  if (s.questionTimeLimitSeconds !== null && !s.oneQuestionAtATime)
    return yield* new Conflict({ message: "A time limit per question needs one question at a time." });
  if (s.questionTimeLimitSeconds !== null && s.questionTimeLimitSeconds < 5)
    return yield* new Conflict({ message: "Give each question at least 5 seconds." });
  if (s.lateJoinMinutes !== null && s.lateJoinMinutes < 1) return yield* new Conflict({ message: "The late-join cutoff must be at least a minute." });
  const password = (s.roomPassword ?? "").trim();
  if (password.length > 64) return yield* new Conflict({ message: "The room password is too long." });
  const badNetwork = invalidAllowlistEntry(s.ipAllowlist.filter((e) => e.trim() !== ""));
  if (badNetwork !== null) return yield* new Conflict({ message: `"${badNetwork}" isn't an IP address or range like 10.0.4.0/24.` });
  return {
    mode: s.mode,
    opensAt,
    closesAt,
    timeLimitMinutes: s.timeLimitMinutes,
    attemptsAllowed: s.attemptsAllowed,
    resultsRelease: s.resultsRelease,
    integrity: s.integrity,
    countInRecord: s.countInRecord,
    oneQuestionAtATime: s.oneQuestionAtATime,
    questionTimeLimitSeconds: s.questionTimeLimitSeconds,
    lateJoinMinutes: s.lateJoinMinutes,
    roomPassword: password === "" ? null : password,
    ipAllowlist: s.ipAllowlist.map((e) => e.trim()).filter(Boolean),
  };
});

export const SessionHandlers = SessionRpcs.toLayer(
  Effect.gen(function* () {
    const db = yield* Database;
    const quizzesService = yield* Quizzes;

    // A session of one of the signed-in teacher's quizzes, or NotFound.
    const ownSession = Effect.fn("ownSession")(function* (sessionId: string, userId: string) {
      const [row] = yield* db.query((d) =>
        d
          .select({ session: quizSessions, quiz: quizzes })
          .from(quizSessions)
          .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
          .where(and(eq(quizSessions.id, sessionId), eq(quizzes.ownerId, userId))),
      );
      return row ?? (yield* noSession);
    });

    const reload = (sessionId: string) =>
      db
        .query((d) => d.select().from(quizSessions).where(eq(quizSessions.id, sessionId)))
        .pipe(Effect.map(([row]) => toSession(row!, Date.now())));

    const setRoster = (sessionId: string, studentIds: readonly string[]) =>
      db.query((d) =>
        d.transaction(async (tx) => {
          const accounts = await accountsOfRoster(tx, studentIds);
          await tx.delete(sessionStudents).where(eq(sessionStudents.sessionId, sessionId));
          if (accounts.length)
            await tx.insert(sessionStudents).values(accounts.map((a) => ({ sessionId, studentId: a.userId })));
        }),
      );

    return SessionRpcs.of({
      "session.create": Effect.fn("session.create")(function* ({ quizId, classId, studentIds, ...settings }) {
        const user = yield* requirePermission({ session: ["create"] });
        const [quiz] = yield* db.query((d) =>
          d
            .select({ id: quizzes.id })
            .from(quizzes)
            .where(and(eq(quizzes.id, quizId), eq(quizzes.ownerId, user.id))),
        );
        if (!quiz) return yield* new NotFound({ message: "That quiz doesn't exist." });
        const columns = yield* settingsColumns(settings);
        const [row] = yield* db.query((d) =>
          d
            .insert(quizSessions)
            .values({ quizId, classId, status: "scheduled", pacing: "student", joinCode: newJoinCode(), ...columns })
            .returning(),
        );
        yield* setRoster(row!.id, studentIds);
        return toSession(row!, Date.now());
      }),

      "session.update": Effect.fn("session.update")(function* ({ sessionId, classId, studentIds, ...settings }) {
        const user = yield* requirePermission({ session: ["create"] });
        const { session } = yield* ownSession(sessionId, user.id);
        if (sessionStatus(session, Date.now()) === "ended") return yield* new Conflict({ message: "This session has ended." });
        const columns = yield* settingsColumns(settings);
        yield* db.query((d) => d.update(quizSessions).set({ classId, ...columns }).where(eq(quizSessions.id, sessionId)));
        yield* setRoster(sessionId, studentIds);
        return yield* reload(sessionId);
      }),

      "session.list": Effect.fn("session.list")(function* ({ quizId, classId }) {
        const user = yield* requirePermission({ session: ["read"] });
        const now = Date.now();
        return yield* db.query(async (d) => {
          const rows = await d
            .select({ session: quizSessions, quizTitle: quizzes.title })
            .from(quizSessions)
            .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
            .where(
              and(
                eq(quizzes.ownerId, user.id),
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
            .where(inArray(sessionStudents.sessionId, ids))
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
            session: toSession(r.session, now),
            quizTitle: r.quizTitle,
            studentCount: roster.find((x) => x.sessionId === r.session.id)?.n ?? 0,
            submittedCount: submitted.find((x) => x.sessionId === r.session.id)?.students ?? 0,
            needsGrading: submitted.find((x) => x.sessionId === r.session.id)?.waiting ?? 0,
          }));
        });
      }),

      "session.get": Effect.fn("session.get")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["read"] });
        const { session, quiz } = yield* ownSession(sessionId, user.id);
        const [detail, roster] = yield* Effect.all([
          db.query((d) => loadQuizDetail(d, quiz)),
          db.query((d) =>
            d
              .select({ rosterId: users.studentId })
              .from(sessionStudents)
              .innerJoin(users, eq(sessionStudents.studentId, users.id))
              .where(eq(sessionStudents.sessionId, sessionId)),
          ),
        ]);
        return {
          session: toSession(session, Date.now()),
          quiz: detail,
          studentIds: roster.flatMap((r) => (r.rosterId ? [r.rosterId] : [])),
          roomPassword: session.roomPassword,
          ipAllowlist: session.ipAllowlist,
        };
      }),

      "session.start": Effect.fn("session.start")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["host"] });
        const { session } = yield* ownSession(sessionId, user.id);
        const now = new Date();
        if (sessionStatus(session, now.getTime()) === "ended") return yield* new Conflict({ message: "This session has ended." });
        // Starting early (or a session with no opening time) opens it now.
        yield* db.query((d) =>
          d
            .update(quizSessions)
            .set({
              status: "running",
              startedAt: session.startedAt ?? now,
              opensAt: session.opensAt && session.opensAt <= now ? session.opensAt : now,
            })
            .where(eq(quizSessions.id, sessionId)),
        );
        return yield* reload(sessionId);
      }),

      "session.end": Effect.fn("session.end")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["host"] });
        yield* ownSession(sessionId, user.id);
        yield* quizzesService.endSession(sessionId);
        return yield* reload(sessionId);
      }),

      "session.remove": Effect.fn("session.remove")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["create"] });
        yield* ownSession(sessionId, user.id);
        yield* db.query((d) => d.delete(quizSessions).where(eq(quizSessions.id, sessionId)));
      }),

      "session.releaseResults": Effect.fn("session.releaseResults")(function* ({ sessionId, released }) {
        const user = yield* requirePermission({ result: ["release"] });
        yield* ownSession(sessionId, user.id);
        yield* db.query((d) => d.update(quizSessions).set({ resultsReleased: released }).where(eq(quizSessions.id, sessionId)));
        return yield* reload(sessionId);
      }),

      "session.attempts": Effect.fn("session.attempts")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["read"] });
        const { quiz } = yield* ownSession(sessionId, user.id);
        return yield* db.query(async (d): Promise<AttemptDetail[]> => {
          const detail = await loadQuizDetail(d, quiz);
          const rows = await d
            .select({ attempt: attempts, rosterId: users.studentId })
            .from(attempts)
            .innerJoin(users, eq(attempts.studentId, users.id))
            .where(eq(attempts.sessionId, sessionId))
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
              },
              studentId: rosterId ?? "",
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
                  ...(a.timeSpentMs === null ? {} : { timeSpentMs: a.timeSpentMs }),
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
            };
          });
        });
      }),

      "session.grade": Effect.fn("session.grade")(function* ({ attemptId, questionId, manualScore, feedback }) {
        const user = yield* requirePermission({ submission: ["grade"] });
        const [row] = yield* db.query((d) =>
          d
            .select({ attempt: attempts, quiz: quizzes })
            .from(attempts)
            .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
            .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
            .where(and(eq(attempts.id, attemptId), eq(quizzes.ownerId, user.id))),
        );
        if (!row) return yield* new NotFound({ message: "That attempt doesn't exist." });
        const [question] = yield* db.query((d) =>
          d
            .select({ points: questions.points })
            .from(questions)
            .innerJoin(quizParts, eq(questions.partId, quizParts.id))
            .where(and(eq(questions.id, questionId), eq(quizParts.quizId, row.quiz.id))),
        );
        if (!question) return yield* new NotFound({ message: "That question isn't in this quiz." });
        return yield* db.query((d) =>
          d.transaction(async (tx) => {
            // Points can't go below 0 or above what the question is worth.
            const score = manualScore === null ? null : Math.min(Math.max(manualScore, 0), question.points);
            const set = { manualScore: score, feedback: feedback === null || feedback.trim() === "" ? null : feedback };
            await tx
              .insert(answers)
              .values({ attemptId, questionId, value: null, ...set })
              .onConflictDoUpdate({ target: [answers.attemptId, answers.questionId], set });
            if (row.attempt.status === "in_progress") return { status: row.attempt.status as AttemptStatus };
            const detail = await loadQuizDetail(tx, row.quiz);
            const rows = await tx.select().from(answers).where(eq(answers.attemptId, attemptId));
            const paper = flatQuestions(attemptPaper(detail, row.attempt.seed));
            const status: AttemptStatus = scoreOf(paper, rows).ungraded > 0 ? "needs_grading" : "graded";
            await tx.update(attempts).set({ status }).where(eq(attempts.id, attemptId));
            return { status };
          }),
        );
      }),

      "session.classScores": Effect.fn("session.classScores")(function* ({ classId }) {
        const user = yield* requirePermission({ session: ["read"] });
        const now = Date.now();
        return yield* db.query(async (d): Promise<ClassSessionScores[]> => {
          const rows = await d
            .select({ session: quizSessions, quiz: quizzes })
            .from(quizSessions)
            .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
            .where(and(eq(quizSessions.classId, classId), eq(quizzes.ownerId, user.id)))
            .orderBy(quizSessions.createdAt);
          if (rows.length === 0) return [];
          const parts = await loadParts(d, [...new Set(rows.map((r) => r.quiz.id))]);
          const done = await d
            .select({ attempt: attempts, rosterId: users.studentId })
            .from(attempts)
            .innerJoin(users, eq(attempts.studentId, users.id))
            .where(and(inArray(attempts.sessionId, rows.map((r) => r.session.id)), ne(attempts.status, "in_progress")));
          const answerRows = done.length
            ? await d.select().from(answers).where(inArray(answers.attemptId, done.map((x) => x.attempt.id)))
            : [];
          return rows.map(({ session, quiz }) => {
            const paperParts = parts.get(quiz.id) ?? [];
            const s = toSession(session, now);
            // Each student's latest submitted attempt.
            const latest = new Map<string, (typeof done)[number]>();
            for (const x of done) {
              if (x.attempt.sessionId !== session.id || !x.rosterId) continue;
              const prev = latest.get(x.rosterId);
              if (!prev || prev.attempt.submittedAt! < x.attempt.submittedAt!) latest.set(x.rosterId, x);
            }
            return {
              sessionId: session.id,
              quizId: quiz.id,
              title: quiz.title,
              mode: session.mode,
              period: quiz.header.period,
              status: s.status,
              maxScore: quizTotals(paperParts).totalPoints,
              opensAt: s.opensAt,
              closesAt: s.closesAt,
              endedAt: s.endedAt,
              countInRecord: session.countInRecord,
              scores: [...latest].map(([studentId, { attempt }]) => {
                const paper = flatQuestions(orderForAttempt(quiz.settings, paperParts, attempt.seed));
                const score = attemptScore(paper, new Map(answerRows.filter((a) => a.attemptId === attempt.id).map((a) => [a.questionId, a])));
                return {
                  studentId,
                  score: score.ungraded > 0 ? null : score.score,
                  submittedAt: attempt.submittedAt!.toISOString(),
                };
              }),
            };
          });
        });
      }),
    });
  }),
);
