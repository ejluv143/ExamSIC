import {
  Conflict,
  NotFound,
  SessionRpcs,
  newJoinKey,
  attemptScore,
  orderForAttempt,
  questionScore,
  quizTotals,
  type Answer,
  type AttemptDetail,
  type AttemptStatus,
  type ClassSessionScores,
  type CodeResults,
  type SessionSettingsFields,
  type TypingEdits,
} from "@examora/contract";
import { and, count, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
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
  incidents,
  answerHistory,
  gradeChanges,
  type QuizItem,
  type QuizSessionItem,
} from "../database/schemas/index.ts";
import {
  accountsOfRoster,
  attemptPaper,
  flatQuestions,
  loadParts,
  loadQuizDetail,
  Quizzes,
  resultsVisible,
  scoreOf,
  sessionStatus,
  toSession,
  toQuestion,
  type Db,
} from "../Quizzes.ts";
import { gameColumns, gameSettingsProblem, Game } from "../modes/game.ts";
import { examColumn, examSettingsProblem } from "../modes/exam.ts";
import { invalidAllowlistEntry } from "../network.ts";
import { requirePermission } from "../Session.ts";
import { LiveHub, toIncident } from "../Live.ts";

const noSession = new NotFound({ message: "That session doesn't exist." });


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
  if (s.navigation !== "free" && !s.oneQuestionAtATime)
    return yield* new Conflict({ message: "Limits on going back need one question at a time; a paper on one page is always free to move around." });
  if (s.maxMarked !== null && (!Number.isInteger(s.maxMarked) || s.maxMarked < 0 || s.maxMarked > 500))
    return yield* new Conflict({ message: "The number of questions a student may mark for review must be 0 to 500." });
  if (s.mode === "mastery" && s.mastery === null) return yield* new Conflict({ message: "Choose the mastery settings." });
  const gameProblem = gameSettingsProblem(s.mode, s.pacing, s.game);
  if (gameProblem !== null) return yield* new Conflict({ message: gameProblem });
  const examProblem = examSettingsProblem(s.mode, s.integrity);
  if (examProblem !== null) return yield* new Conflict({ message: examProblem });
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
    mastery: s.mode === "mastery" ? s.mastery : null,
    exam: examColumn(s.mode, s.exam),
    countInRecord: s.countInRecord,
    oneQuestionAtATime: s.oneQuestionAtATime,
    questionTimeLimitSeconds: s.questionTimeLimitSeconds,
    navigation: s.navigation,
    maxMarked: s.maxMarked,
    lateJoinMinutes: s.lateJoinMinutes,
    roomPassword: password === "" ? null : password,
    ipAllowlist: s.ipAllowlist.map((e) => e.trim()).filter(Boolean),
    ...gameColumns(s.mode, s.pacing, s.game),
  };
});

const noAttempt = new NotFound({ message: "That attempt doesn't exist." });

// Every attempt matching `where` (of one quiz's session) as the teacher sees it.
const attemptDetails = async (d: Db, quiz: QuizItem, where: SQL | undefined): Promise<AttemptDetail[]> => {
  const detail = await loadQuizDetail(d, quiz);
  const rows = await d
    .select({ attempt: attempts, rosterId: users.studentId })
    .from(attempts)
    .innerJoin(users, eq(attempts.studentId, users.id))
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
    };
  });
};

export const SessionHandlers = SessionRpcs.toLayer(
  Effect.gen(function* () {
    const db = yield* Database;
    const quizzesService = yield* Quizzes;
    const hub = yield* LiveHub;
    const game = yield* Game;

    // An attempt of one of the signed-in teacher's sessions, or NotFound.
    const ownAttemptOf = Effect.fn("ownAttemptOf")(function* (attemptId: string, userId: string) {
      const [row] = yield* db.query((d) =>
        d
          .select({ attempt: attempts, session: quizSessions, quiz: quizzes })
          .from(attempts)
          .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
          .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
          .where(and(eq(attempts.id, attemptId), eq(quizzes.ownerId, userId))),
      );
      return row ?? (yield* noAttempt);
    });

    const requireRunning = Effect.fn("requireRunning")(function* (session: QuizSessionItem) {
      if (sessionStatus(session, Date.now()) !== "running") return yield* new Conflict({ message: "The session isn't running." });
    });

    // Moves every deadline of the session by `ms` (a pause that ended, or time added for everyone): the session's
    // close, and the attempts in progress whose own time limit is what ends them. `shiftQuestions` also moves the
    // start of the question each student is on. `set` is changed on the session in the same step.
    const shiftClocks = (
      session: QuizSessionItem,
      ms: number,
      shiftQuestions: boolean,
      set: { pausedAt?: null },
    ) =>
      db.query((d) =>
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
      "session.create": Effect.fn("session.create")(function* ({ quizId, classId, studentIds, startNow, ...settings }) {
        const user = yield* requirePermission({ session: ["create"] });
        const [quiz] = yield* db.query((d) =>
          d
            .select({ id: quizzes.id })
            .from(quizzes)
            .where(and(eq(quizzes.id, quizId), eq(quizzes.ownerId, user.id))),
        );
        if (!quiz) return yield* new NotFound({ message: "That quiz doesn't exist." });
        const columns = yield* settingsColumns(settings);
        if (startNow && columns.closesAt !== null && columns.closesAt.getTime() <= Date.now())
          return yield* new Conflict({ message: "The close time is already past." });
        if (settings.mode === "game") yield* game.validate(quizId, settings.pacing);
        // Opening now: a game opens its lobby below; the other modes are running from this moment.
        const now = new Date();
        const opening =
          startNow && settings.mode !== "game"
            ? { status: "running" as const, startedAt: now, opensAt: now }
            : { status: "scheduled" as const };
        // The key must be unique among sessions that have not ended; a clash (the partial unique index) draws a new one.
        const row = yield* db.query(async (d) => {
          for (let attempt = 0; attempt < 20; attempt++) {
            const [created] = await d
              .insert(quizSessions)
              .values({ quizId, classId, joinCode: newJoinKey(), ...columns, ...opening })
              .onConflictDoNothing()
              .returning();
            if (created) return created;
          }
          throw new Error("Could not find a free join key.");
        });
        yield* setRoster(row.id, studentIds);
        if (startNow && settings.mode === "game") yield* game.openLobby(row.id);
        return yield* reload(row.id);
      }),

      "session.update": Effect.fn("session.update")(function* ({ sessionId, classId, studentIds, ...settings }) {
        const user = yield* requirePermission({ session: ["create"] });
        const { session } = yield* ownSession(sessionId, user.id);
        if (sessionStatus(session, Date.now()) === "ended") return yield* new Conflict({ message: "This session has ended." });
        const columns = yield* settingsColumns(settings);
        if (session.mode === "game" && session.status !== "scheduled")
          return yield* new Conflict({ message: "A game's settings can't change once its lobby is open." });
        if (settings.mode === "game") yield* game.validate(session.quizId, settings.pacing);
        yield* db.query((d) => d.update(quizSessions).set({ classId, ...columns }).where(eq(quizSessions.id, sessionId)));
        // Without a class the roster is whoever joined with the key; editing leaves it alone.
        if (classId !== null) yield* setRoster(sessionId, studentIds);
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
              .where(and(eq(sessionStudents.sessionId, sessionId), isNull(sessionStudents.removedAt))),
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
        if (session.mode === "game") return yield* new Conflict({ message: "Run a game from its presenter screen." });
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
        yield* hub.sessionChanged(sessionId);
        return yield* reload(sessionId);
      }),

      "session.end": Effect.fn("session.end")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["host"] });
        const { session } = yield* ownSession(sessionId, user.id);
        // A game ends through its room, so the screens show the final standings.
        if (session.mode === "game") yield* game.end(sessionId);
        else yield* quizzesService.endSession(sessionId);
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
        return yield* db.query((d) => attemptDetails(d, quiz, eq(attempts.sessionId, sessionId)));
      }),

      "session.liveAttempt": Effect.fn("session.liveAttempt")(function* ({ attemptId }) {
        const user = yield* requirePermission({ session: ["read"] });
        const { session, quiz } = yield* ownAttemptOf(attemptId, user.id);
        const [detail] = yield* db.query((d) => attemptDetails(d, quiz, eq(attempts.id, attemptId)));
        const rows = yield* db.query((d) =>
          d
            .select()
            .from(incidents)
            .where(and(eq(incidents.sessionId, session.id), eq(incidents.attemptId, attemptId)))
            .orderBy(incidents.at),
        );
        return { detail: detail!, incidents: rows.map(toIncident) };
      }),

      "session.pause": Effect.fn("session.pause")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["host"] });
        const { session } = yield* ownSession(sessionId, user.id);
        yield* requireRunning(session);
        if (session.pausedAt) return yield* new Conflict({ message: "The session is already paused." });
        yield* db.query((d) => d.update(quizSessions).set({ pausedAt: new Date() }).where(eq(quizSessions.id, sessionId)));
        yield* hub.record({ sessionId, attemptId: null, actorId: user.id, kind: "pause" });
        yield* hub.sessionChanged(sessionId);
        return yield* reload(sessionId);
      }),

      "session.resume": Effect.fn("session.resume")(function* ({ sessionId }) {
        const user = yield* requirePermission({ session: ["host"] });
        const { session } = yield* ownSession(sessionId, user.id);
        if (!session.pausedAt) return yield* new Conflict({ message: "The session isn't paused." });
        const paused = Date.now() - session.pausedAt.getTime();
        yield* shiftClocks(session, paused, true, { pausedAt: null });
        yield* hub.record({ sessionId, attemptId: null, actorId: user.id, kind: "resume", seconds: Math.round(paused / 1000) });
        yield* hub.sessionChanged(sessionId);
        return yield* reload(sessionId);
      }),

      "session.addTime": Effect.fn("session.addTime")(function* ({ sessionId, attemptId, seconds }) {
        const user = yield* requirePermission({ session: ["host"] });
        const { session } = yield* ownSession(sessionId, user.id);
        yield* requireRunning(session);
        if (attemptId === undefined) {
          yield* shiftClocks(session, seconds * 1000, false, {});
          yield* hub.record({ sessionId, attemptId: null, actorId: user.id, kind: "add_time", seconds });
          yield* hub.sessionChanged(sessionId);
          return;
        }
        const { attempt } = yield* ownAttemptOf(attemptId, user.id);
        if (attempt.sessionId !== sessionId) return yield* noAttempt;
        if (attempt.status !== "in_progress") return yield* new Conflict({ message: "That student already submitted." });
        yield* db.query((d) =>
          d.update(attempts).set({ extraMs: attempt.extraMs + seconds * 1000 }).where(eq(attempts.id, attemptId)),
        );
        yield* hub.record({ sessionId, attemptId, actorId: user.id, kind: "add_time", seconds });
        yield* hub.attemptChanged(attemptId, { state: true });
      }),

      "session.warn": Effect.fn("session.warn")(function* ({ attemptId, message }) {
        const user = yield* requirePermission({ session: ["host"] });
        const { attempt } = yield* ownAttemptOf(attemptId, user.id);
        if (attempt.status !== "in_progress") return yield* new Conflict({ message: "That student already submitted." });
        yield* hub.warn(attemptId, message);
        yield* hub.record({ sessionId: attempt.sessionId, attemptId, actorId: user.id, kind: "warn", message });
      }),

      "session.setLocked": Effect.fn("session.setLocked")(function* ({ attemptId, locked }) {
        const user = yield* requirePermission({ session: ["host"] });
        const { attempt } = yield* ownAttemptOf(attemptId, user.id);
        if (attempt.status !== "in_progress") return yield* new Conflict({ message: "That student already submitted." });
        yield* db.query((d) => d.update(attempts).set({ locked }).where(eq(attempts.id, attemptId)));
        yield* hub.record({ sessionId: attempt.sessionId, attemptId, actorId: user.id, kind: locked ? "lock" : "unlock" });
        yield* hub.attemptChanged(attemptId, { state: true });
      }),

      "session.forceSubmit": Effect.fn("session.forceSubmit")(function* ({ attemptId }) {
        const user = yield* requirePermission({ session: ["host"] });
        const { attempt } = yield* ownAttemptOf(attemptId, user.id);
        if (attempt.status !== "in_progress") return yield* new Conflict({ message: "That student already submitted." });
        yield* hub.record({ sessionId: attempt.sessionId, attemptId, actorId: user.id, kind: "force_submit" });
        yield* quizzesService.submit({ attemptId, auto: true, reason: "teacher" });
      }),

      "session.allowBackIn": Effect.fn("session.allowBackIn")(function* ({ attemptId }) {
        const user = yield* requirePermission({ session: ["host"] });
        const { attempt, session } = yield* ownAttemptOf(attemptId, user.id);
        if (attempt.status !== "in_progress") return yield* new Conflict({ message: "That student already submitted." });
        const exam = session.mode === "exam";
        // The next browser to check in becomes the attempt's browser. In an exam the approval also restarts the
        // grace period, so the student isn't refused again for the time they waited.
        yield* db.query((d) =>
          d
            .update(attempts)
            .set({ deviceId: null, ip: null, ...(exam ? { lastSeenAt: new Date() } : {}) })
            .where(eq(attempts.id, attemptId)),
        );
        yield* hub.record({
          sessionId: attempt.sessionId,
          attemptId,
          actorId: user.id,
          kind: exam ? "device_switch_allowed" : "allow_back_in",
        });
        yield* hub.attemptChanged(attemptId);
      }),

      "session.grantRetake": Effect.fn("session.grantRetake")(function* ({ attemptId, reason }) {
        const user = yield* requirePermission({ session: ["host"] });
        const { attempt, session } = yield* ownAttemptOf(attemptId, user.id);
        if (session.mode !== "exam") return yield* new Conflict({ message: "Retakes are granted in exam sessions." });
        if (session.attemptsAllowed === null) return yield* new Conflict({ message: "This exam already allows unlimited attempts." });
        if (sessionStatus(session, Date.now()) === "ended") return yield* new Conflict({ message: "This session has ended." });
        if (reason.trim() === "") return yield* new Conflict({ message: "Give the reason for the retake." });
        const mine = yield* db.query((d) =>
          d.select({ status: attempts.status }).from(attempts).where(and(eq(attempts.sessionId, attempt.sessionId), eq(attempts.studentId, attempt.studentId))),
        );
        if (mine.some((a) => a.status === "in_progress")) return yield* new Conflict({ message: "That student is still taking the exam." });
        yield* hub.record({ sessionId: attempt.sessionId, attemptId, actorId: user.id, kind: "retake_granted", message: reason.trim() });
        yield* hub.attemptChanged(attemptId);
      }),

      "session.examRecord": Effect.fn("session.examRecord")(function* ({ attemptId }) {
        const user = yield* requirePermission({ session: ["read"] });
        const { session, quiz } = yield* ownAttemptOf(attemptId, user.id);
        const [detail] = yield* db.query((d) => attemptDetails(d, quiz, eq(attempts.id, attemptId)));
        const [rows, history, changes] = yield* Effect.all([
          db
            .query((d) =>
              d
                .select()
                .from(incidents)
                .where(and(eq(incidents.sessionId, session.id), eq(incidents.attemptId, attemptId)))
                .orderBy(incidents.at),
            )
            .pipe(Effect.map((r) => r.map(toIncident))),
          db.query((d) => d.select().from(answerHistory).where(eq(answerHistory.attemptId, attemptId)).orderBy(answerHistory.savedAt)),
          db.query((d) =>
            d
              .select({ change: gradeChanges, questionId: answers.questionId, by: users.name })
              .from(gradeChanges)
              .innerJoin(answers, eq(gradeChanges.answerId, answers.id))
              .leftJoin(users, eq(gradeChanges.changedBy, users.id))
              .where(eq(answers.attemptId, attemptId))
              .orderBy(gradeChanges.at),
          ),
        ]);
        return {
          detail: detail!,
          incidents: rows,
          history: history.map((h) => ({ questionId: h.questionId, value: h.value ?? null, savedAt: h.savedAt.toISOString() })),
          gradeChanges: changes.map(({ change, questionId, by }) => ({
            id: change.id,
            questionId,
            changedBy: by,
            oldScore: change.oldScore,
            newScore: change.newScore,
            reason: change.reason,
            at: change.at.toISOString(),
          })),
        };
      }),

      "session.grade": Effect.fn("session.grade")(function* ({ attemptId, questionId, manualScore, feedback, reason }) {
        const user = yield* requirePermission({ submission: ["grade"] });
        const [row] = yield* db.query((d) =>
          d
            .select({ attempt: attempts, session: quizSessions, quiz: quizzes })
            .from(attempts)
            .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
            .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
            .where(and(eq(attempts.id, attemptId), eq(quizzes.ownerId, user.id))),
        );
        if (!row) return yield* new NotFound({ message: "That attempt doesn't exist." });
        const [questionRow] = yield* db.query((d) =>
          d
            .select({ question: questions })
            .from(questions)
            .innerJoin(quizParts, eq(questions.partId, quizParts.id))
            .where(and(eq(questions.id, questionId), eq(quizParts.quizId, row.quiz.id))),
        );
        if (!questionRow) return yield* new NotFound({ message: "That question isn't in this quiz." });
        const question = toQuestion(questionRow.question);
        const [before] = yield* db.query((d) =>
          d.select().from(answers).where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId))),
        );
        // Points can't go below 0 or above what the question is worth.
        const score = manualScore === null ? null : Math.min(Math.max(manualScore, 0), question.points);
        // Exam sessions: once the results are out, every score change is logged and needs a reason.
        const released =
          row.session.mode === "exam" &&
          row.attempt.status !== "in_progress" &&
          resultsVisible(toSession(row.session, Date.now()));
        const oldScore = before ? questionScore(question, before) : 0;
        const newScore = questionScore(question, { autoScore: before?.autoScore ?? null, manualScore: score });
        const changed = oldScore !== newScore;
        if (released && changed && (reason ?? "").trim() === "")
          return yield* new Conflict({ message: "The results are released. Give the reason for changing this score." });
        return yield* db.query((d) =>
          d.transaction(async (tx) => {
            const set = { manualScore: score, feedback: feedback === null || feedback.trim() === "" ? null : feedback };
            const [saved] = await tx
              .insert(answers)
              .values({ attemptId, questionId, value: null, ...set })
              .onConflictDoUpdate({ target: [answers.attemptId, answers.questionId], set })
              .returning({ id: answers.id });
            if (released && changed)
              await tx.insert(gradeChanges).values({
                answerId: saved!.id,
                changedBy: user.id,
                oldScore,
                newScore,
                reason: reason!.trim(),
                at: new Date(),
              });
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
