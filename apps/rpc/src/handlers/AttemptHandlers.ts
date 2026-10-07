import {
  AttemptRpcs,
  assetIdsIn,
  Conflict,
  Forbidden,
  NotFound,
  deviceApprovalMessage,
  otherDeviceMessage,
  tooFastMs,
  type IntegrityEventType,
  attemptScore,
  orderForAttempt,
  paperRandom,
  paperVersion,
  questionScore,
  quizTotals,
  toStudentQuestion,
  type AnswerValue,
  type Attempt,
  type AttemptScore,
  type AttemptResult,
  type CodeTestResult,
  type MyScore,
  type Paper,
  type QuizDetail,
  type QuizMeta,
  type TypingEdits,
} from "@examora/contract";
import { and, asc, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { Effect } from "effect";
import { Database, type Drizzle } from "../Database.ts";
import {
  answers,
  answerHistory,
  attempts,
  integrityEvents,
  questions,
  quizParts,
  quizSessions,
  quizzes,
  sessionStudents,
  typingEdits,
  type AttemptItem,
  type QuizItem,
  type QuizSessionItem,
} from "../database/schemas/index.ts";
import {
  keepOwnPictures,
  attemptDeadline,
  hasAnswer,
  attemptPaper,
  cleanAnswer,
  cleanEvents,
  cleanTyping,
  flatQuestions,
  loadQuizDetail,
  Quizzes,
  resultsVisible,
  scoreOf,
  toQuestion,
  toSession,
  toEventRow,
  disconnectGap,
  graceMs,
  keepsTyping,
  questionGraceMs,
  questionProgress,
  loadParts,
} from "../Quizzes.ts";
import { LiveHub } from "../Live.ts";
import { Assets } from "../Assets.ts";
import { Runner } from "../Runner.ts";
import { clientIp, ipAllowed } from "../network.ts";
import { requirePermission } from "../Session.ts";
import { sampleResult } from "../sql-grader.ts";
import { makeMastery } from "../modes/mastery.ts";
import { grantedRetakes, phoneRefusal, withAllowance, withinGrace } from "../modes/exam.ts";

const noSession = new NotFound({ message: "That session doesn't exist." });

const noAttempt = new NotFound({ message: "That attempt doesn't exist." });

const maxCodeLength = 20000;

// A few runs a minute, so the Run button can't be used to probe hidden tests or flood the runner.
const runsPerMinute = 6;
const recentRuns = new Map<string, number[]>();

const toAttempt = (a: AttemptItem): Attempt => ({
  id: a.id,
  sessionId: a.sessionId,
  studentId: a.studentId,
  seed: a.seed,
  status: a.status,
  startedAt: a.startedAt.toISOString(),
  submittedAt: a.submittedAt?.toISOString() ?? null,
  pledgeAcceptedAt: a.pledgeAcceptedAt?.toISOString() ?? null,
});

const toMeta = (q: QuizItem): QuizMeta => ({
  id: q.id,
  title: q.title,
  description: q.description,
  subject: q.subject,
  subjectArea: q.subjectArea,
  header: q.header,
});

export const AttemptHandlers = AttemptRpcs.toLayer(
  Effect.gen(function* () {
    const db = yield* Database;
    const runner = yield* Runner;
    const quizzesService = yield* Quizzes;
    const assets = yield* Assets;
    const hub = yield* LiveHub;
    const mastery = makeMastery({ db, runner, hub, assets, quizzes: quizzesService });

    // A session the signed-in student is on the roster of, or NotFound.
    const rosterSession = Effect.fn("rosterSession")(function* (sessionId: string, userId: string) {
      const [row] = yield* db.query((d) =>
        d
          .select({ session: quizSessions, quiz: quizzes })
          .from(sessionStudents)
          .innerJoin(quizSessions, eq(sessionStudents.sessionId, quizSessions.id))
          .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
          .where(and(eq(sessionStudents.studentId, userId), eq(quizSessions.id, sessionId))),
      );
      return row ?? (yield* noSession);
    });

    // The student's own attempt with its session and quiz, or NotFound.
    const ownAttempt = Effect.fn("ownAttempt")(function* (attemptId: string, userId: string) {
      const [row] = yield* db.query((d) =>
        d
          .select({ attempt: attempts, session: quizSessions, quiz: quizzes })
          .from(attempts)
          .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
          .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
          .where(and(eq(attempts.id, attemptId), eq(attempts.studentId, userId))),
      );
      return row ?? (yield* noAttempt);
    });

    // The attempt must be in progress and inside its time (plus the grace). While the session is paused the
    // clock is stopped at the moment of the pause.
    const requireOpen = Effect.fn("requireOpen")(function* (attempt: AttemptItem, session: QuizSessionItem) {
      if (attempt.status !== "in_progress") return yield* new Conflict({ message: "This attempt was already submitted." });
      const deadline = attemptDeadline(session, attempt);
      const clock = session.pausedAt ? Math.min(Date.now(), session.pausedAt.getTime()) : Date.now();
      if (deadline !== null && clock > deadline + graceMs) return yield* new Conflict({ message: "Time is up." });
    });

    // Everything that changes the attempt: not while the teacher has paused the session or locked this attempt.
    const requireWritable = Effect.fn("requireWritable")(function* (attempt: AttemptItem, session: QuizSessionItem) {
      yield* requireOpen(attempt, session);
      if (session.pausedAt) return yield* new Conflict({ message: "Your teacher paused the session. Wait for it to resume." });
      if (attempt.locked) return yield* new Conflict({ message: "Your teacher locked your attempt. Wait for them to unlock it." });
    });

    const notice = (attemptId: string, type: IntegrityEventType, at: Date, durationMs?: number) =>
      db
        .query((d) => d.insert(integrityEvents).values({ attemptId, type, at, durationMs: durationMs ?? null }))
        .pipe(
          Effect.andThen(
            hub.attemptChanged(attemptId, {
              events: [{ type, at: at.toISOString(), ...(durationMs === undefined ? {} : { durationMs }) }],
            }),
          ),
        );

    // Every call that touches an attempt in progress passes through here: it must come from the browser the attempt
    // started on (anything else is refused and logged), and from an allowed network. What it notices is logged:
    // a changed network address, and a gap since the last check-in. `required`: a missing token counts as another
    // browser (reading the paper); `network: false` skips the allowlist.
    const guard = Effect.fn("guard")(function* (
      attempt: AttemptItem,
      session: QuizSessionItem,
      deviceId: string | undefined,
      ip: string | null,
      options: { required?: boolean; network?: boolean } = {},
    ) {
      const now = new Date();
      // Exam sessions: another device, or the same one after being away longer than the grace period, waits for the
      // teacher's approval (`session.allowBackIn`). Other modes only refuse another device.
      const exam = session.mode === "exam";
      const otherDevice = attempt.deviceId !== null && deviceId !== attempt.deviceId && (deviceId !== undefined || options.required);
      const awayTooLong = exam && attempt.deviceId !== null && !withinGrace(session.exam, attempt.lastSeenAt, now);
      if (otherDevice || awayTooLong) {
        // One event a minute, however often the other browser retries.
        const [recent] = yield* db.query((d) =>
          d
            .select({ id: integrityEvents.id })
            .from(integrityEvents)
            .where(
              and(
                eq(integrityEvents.attemptId, attempt.id),
                eq(integrityEvents.type, "device_changed"),
                gt(integrityEvents.at, new Date(now.getTime() - 60_000)),
              ),
            ),
        );
        if (!recent) yield* notice(attempt.id, "device_changed", now);
        return yield* new Conflict({ message: exam ? deviceApprovalMessage : otherDeviceMessage });
      }
      if (options.network !== false && !ipAllowed(ip, session.ipAllowlist))
        return yield* new Forbidden({ message: "This isn't on the network allowed for this session." });
      const gap = disconnectGap(attempt.lastSeenAt, now);
      if (gap) yield* notice(attempt.id, "disconnected", new Date(gap.at), gap.durationMs);
      const moved = attempt.ip !== null && ip !== null && ip !== attempt.ip;
      if (moved) yield* notice(attempt.id, "network_changed", now);
      yield* db.query((d) =>
        d
          .update(attempts)
          .set({
            lastSeenAt: now,
            ...(moved ? { ip } : {}),
            // An attempt from before devices were tracked adopts the first browser that checks in.
            ...(attempt.deviceId === null && deviceId !== undefined ? { deviceId } : {}),
          })
          .where(eq(attempts.id, attempt.id)),
      );
      yield* hub.seen(attempt.id);
    });

    // Flags a student who starts from the browser (or network address) another student of the session used.
    const flagSharing = Effect.fn("flagSharing")(function* (attempt: AttemptItem, now: Date) {
      const others = yield* db.query((d) =>
        d
          .select()
          .from(attempts)
          .where(and(eq(attempts.sessionId, attempt.sessionId), ne(attempts.studentId, attempt.studentId))),
      );
      const sameDevice = others.filter((o) => attempt.deviceId !== null && o.deviceId === attempt.deviceId);
      if (sameDevice.length > 0) {
        yield* notice(attempt.id, "shared_device", now);
        for (const o of sameDevice) yield* notice(o.id, "shared_device", now);
      }
      if (attempt.ip !== null && others.some((o) => o.ip === attempt.ip)) yield* notice(attempt.id, "shared_network", now);
    });

    // One question at a time: where the student is now. The first read after a question's time ran out moves the
    // stored position on, so the questions they skipped stay skipped.
    const syncProgress = Effect.fn("syncProgress")(function* (
      attempt: AttemptItem,
      session: QuizSessionItem,
      total: number,
      now: number,
    ) {
      const at = questionProgress(session, attempt, total, now);
      if (at.index !== attempt.questionIndex)
        yield* db.query((d) =>
          d
            .update(attempts)
            .set({ questionIndex: at.index, questionStartedAt: new Date(at.startedAt) })
            .where(eq(attempts.id, attempt.id)),
        );
      return at;
    });

    // Latest submitted attempt of each session with its score, for the student's lists.
    const latestScores = async (d: Drizzle, rows: { session: QuizSessionItem; quiz: QuizItem }[], attemptRows: AttemptItem[]) => {
        const parts = await loadParts(d, [...new Set(rows.map((r) => r.quiz.id))]);
        const latest = new Map<string, AttemptItem>();
        for (const a of attemptRows) {
          if (a.status === "in_progress") continue;
          const prev = latest.get(a.sessionId);
          if (!prev || prev.submittedAt! < a.submittedAt!) latest.set(a.sessionId, a);
        }
        const ids = [...latest.values()].map((a) => a.id);
        const answerRows = ids.length ? await d.select().from(answers).where(inArray(answers.attemptId, ids)) : [];
        const byAttempt = new Map<string, typeof answerRows>();
        for (const r of answerRows) byAttempt.set(r.attemptId, [...(byAttempt.get(r.attemptId) ?? []), r]);
        return { parts, latest, scoreOf: (a: AttemptItem, quiz: QuizItem) => attemptScore(flatQuestions(orderForAttempt(quiz.settings, parts.get(quiz.id) ?? [], a.seed)), new Map((byAttempt.get(a.id) ?? []).map((r) => [r.questionId, r]))) };
    };

    const roster = (d: Drizzle, userId: string) =>
      d
        .select({ session: quizSessions, quiz: quizzes })
        .from(sessionStudents)
        .innerJoin(quizSessions, eq(sessionStudents.sessionId, quizSessions.id))
        .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
        .where(eq(sessionStudents.studentId, userId))
        .orderBy(asc(quizSessions.closesAt), desc(quizSessions.createdAt));

    const summary = (score: AttemptScore): AttemptResult => ({
      score: score.score,
      max: score.max,
      pendingEssays: score.ungraded,
    });

    return AttemptRpcs.of({
      "attempt.mine": Effect.fn("attempt.mine")(function* () {
        const user = yield* requirePermission({ attempt: ["read"] });
        const now = Date.now();
        return yield* db.query(async (d) => {
          const rows = await roster(d, user.id);
          if (rows.length === 0) return [];
          const mine = await d
            .select()
            .from(attempts)
            .where(and(eq(attempts.studentId, user.id), inArray(attempts.sessionId, rows.map((r) => r.session.id))));
          const scores = await latestScores(d, rows, mine);
          const grants = await grantedRetakes(d, user.id, rows.map((r) => r.session.id));
          return rows.map(({ session, quiz }) => {
            const s = withAllowance(toSession(session, now), grants.get(session.id) ?? 0);
            const tried = mine.filter((a) => a.sessionId === session.id);
            const last = scores.latest.get(session.id);
            return {
              session: s,
              quizTitle: quiz.title,
              ...quizTotals(scores.parts.get(quiz.id) ?? []),
              attemptsUsed: tried.length,
              inProgress: tried.some((a) => a.status === "in_progress"),
              lastSubmittedAt: last?.submittedAt?.toISOString() ?? null,
              result: last && resultsVisible(s) ? summary(scores.scoreOf(last, quiz)) : null,
            };
          });
        });
      }),

      "attempt.paper": Effect.fn("attempt.paper")(function* ({ sessionId, deviceId }, { headers }) {
        const ip = clientIp(headers);
        const user = yield* requirePermission({ attempt: ["read"] });
        const { session, quiz } = yield* rosterSession(sessionId, user.id);
        const refused = phoneRefusal(session.mode, session.exam, headers);
        if (refused !== null) return yield* new Forbidden({ message: refused });
        const granted = (yield* db.query((d) => grantedRetakes(d, user.id, [sessionId]))).get(sessionId) ?? 0;
        const now = Date.now();
        const s = withAllowance(toSession(session, now), granted);
        const mine = yield* db.query((d) =>
          d.select().from(attempts).where(and(eq(attempts.sessionId, sessionId), eq(attempts.studentId, user.id))),
        );
        const open = mine.find((a) => a.status === "in_progress");
        const detail = yield* db.query((d) => loadQuizDetail(d, quiz));
        // The intro screen shows how big the paper is before the attempt starts.
        const base = {
          session: s,
          quiz: toMeta(quiz),
          attemptsUsed: mine.length,
          codeRunner: runner.configured,
          ...quizTotals(detail.parts),
        };

        if (!open) {
          if (s.status !== "running") return yield* new Conflict({ message: "This session isn't open." });
          if (s.attemptsAllowed !== null && mine.length >= s.attemptsAllowed)
            return yield* new Conflict({ message: "You've used all your attempts." });
          return { ...base, parts: [], attempt: null, answers: {}, typing: {}, deadline: null, progress: null, paused: false, locked: false, assetUrls: {} } satisfies Paper;
        }
        yield* requireOpen(open, session);
        yield* guard(open, session, deviceId, ip, { required: true });

        // Mastery mode serves its questions one by one through `attempt.masteryState`.
        const saved =
          session.mode === "mastery"
            ? []
            : yield* db.query((d) =>
                d
                  .select({ answer: answers, edits: typingEdits.edits })
                  .from(answers)
                  .leftJoin(typingEdits, eq(typingEdits.answerId, answers.id))
                  .where(eq(answers.attemptId, open.id)),
              );
        // One question at a time: only the question the student is on leaves the server.
        const ordered = session.mode === "mastery" ? [] : attemptPaper(detail, open.seed);
        const at = session.oneQuestionAtATime
          ? yield* syncProgress(open, session, flatQuestions(ordered).length, now)
          : null;
        const servedId = at ? flatQuestions(ordered)[at.index]?.id : undefined;
        const served = at
          ? ordered
              .map((part) => ({ ...part, questions: part.questions.filter((q) => q.id === servedId) }))
              .filter((part) => part.questions.length > 0)
          : ordered;
        // Students see what the answer query returns on the sample data, never the query itself.
        const parts = yield* Effect.forEach(served, (part) =>
          Effect.forEach(part.questions, (q) => {
            const student = toStudentQuestion(q, paperRandom(detail.quiz.settings, open.seed, q.id));
            return q.type === "sql"
              ? Effect.promise(() => sampleResult(q)).pipe(
                  Effect.map((sample) => ({ ...student, ...(sample ? { sampleResult: sample } : {}) })),
                  Effect.catchDefect(() => Effect.succeed(student)),
                )
              : Effect.succeed(student);
          }).pipe(Effect.map((questions) => ({ ...part, questions }))),
        );
        const typing: Record<string, TypingEdits> = {};
        const values: Record<string, AnswerValue> = {};
        for (const { answer, edits } of saved) {
          if (servedId !== undefined && answer.questionId !== servedId) continue;
          values[answer.questionId] = answer.value ?? null;
          if (edits) typing[answer.questionId] = edits;
        }
        const deadline = attemptDeadline(session, open);
        const assetUrls = yield* assets.paperUrls(user.id, assetIdsIn(JSON.stringify([quiz.description, parts, values])));
        return {
          ...base,
          parts,
          attempt: toAttempt(open),
          answers: values,
          typing,
          deadline: deadline === null ? null : new Date(deadline).toISOString(),
          progress: at ? { index: at.index, deadline: at.deadline === null ? null : new Date(at.deadline).toISOString() } : null,
          paused: session.pausedAt !== null,
          locked: open.locked,
          assetUrls,
        } satisfies Paper;
      }),

      "attempt.start": Effect.fn("attempt.start")(function* ({ sessionId, deviceId, roomPassword, pledgeAccepted }, { headers }) {
        const user = yield* requirePermission({ attempt: ["create"] });
        const { session } = yield* rosterSession(sessionId, user.id);
        const refused = phoneRefusal(session.mode, session.exam, headers);
        if (refused !== null) return yield* new Forbidden({ message: refused });
        const ip = clientIp(headers);
        const mine = yield* db.query((d) =>
          d.select().from(attempts).where(and(eq(attempts.sessionId, sessionId), eq(attempts.studentId, user.id))),
        );
        // Starting again (another browser, a reload) resumes the attempt and keeps its first start time.
        const open = mine.find((a) => a.status === "in_progress");
        if (open) {
          yield* requireOpen(open, session);
          yield* guard(open, session, deviceId, ip);
          return toAttempt(open);
        }
        const granted = (yield* db.query((d) => grantedRetakes(d, user.id, [sessionId]))).get(sessionId) ?? 0;
        const s = withAllowance(toSession(session, Date.now()), granted);
        if (s.status !== "running") return yield* new Conflict({ message: "This session isn't open." });
        if (s.attemptsAllowed !== null && mine.length >= s.attemptsAllowed)
          return yield* new Conflict({ message: "You've used all your attempts." });
        if (session.mode === "exam" && pledgeAccepted !== true)
          return yield* new Conflict({ message: "Accept the honor pledge before you start the exam." });
        if (session.lateJoinMinutes !== null && s.startedAt !== null && Date.now() > Date.parse(s.startedAt) + session.lateJoinMinutes * 60_000)
          return yield* new Conflict({ message: `It's too late to join: students could start in the first ${session.lateJoinMinutes} minutes.` });
        if (session.roomPassword !== null && (roomPassword ?? "").trim() !== session.roomPassword)
          return yield* new Forbidden({ message: "That room password isn't right." });
        if (!ipAllowed(ip, session.ipAllowlist))
          return yield* new Forbidden({ message: "This isn't on the network allowed for this session." });
        const now = new Date();
        const [created] = yield* db.query((d) =>
          d
            .insert(attempts)
            .values({
              sessionId,
              studentId: user.id,
              attemptNumber: mine.length + 1,
              deviceId,
              ip,
              lastSeenAt: now,
              questionStartedAt: now,
              pledgeAcceptedAt: session.mode === "exam" ? now : null,
            })
            .onConflictDoNothing()
            .returning(),
        );
        if (created) {
          yield* flagSharing(created, now);
          yield* hub.attemptChanged(created.id);
          return toAttempt(created);
        }
        // A second request started it first.
        const [again] = yield* db.query((d) =>
          d
            .select()
            .from(attempts)
            .where(and(eq(attempts.sessionId, sessionId), eq(attempts.studentId, user.id), eq(attempts.status, "in_progress"))),
        );
        return again ? toAttempt(again) : yield* new Conflict({ message: "Couldn't start the attempt. Try again." });
      }),

      "attempt.saveAnswer": Effect.fn("attempt.saveAnswer")(function* ({ attemptId, deviceId, questionId, value, typing, timeSpentMs }, { headers }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        const { attempt, session, quiz } = yield* ownAttempt(attemptId, user.id);
        yield* requireWritable(attempt, session);
        yield* guard(attempt, session, deviceId, clientIp(headers));
        if (session.mode === "mastery") return yield* new Conflict({ message: "Mastery answers are graded one at a time." });
        const [row] = yield* db.query((d) =>
          d
            .select({ question: questions })
            .from(questions)
            .innerJoin(quizParts, eq(questions.partId, quizParts.id))
            .where(and(eq(questions.id, questionId), eq(quizParts.quizId, quiz.id))),
        );
        if (!row) return yield* new NotFound({ message: "That question isn't in this quiz." });
        const question = toQuestion(row.question);
        if (session.oneQuestionAtATime) {
          const detail = yield* db.query((d) => loadQuizDetail(d, quiz));
          const paper = flatQuestions(attemptPaper(detail, attempt.seed));
          const now = Date.now();
          const at = yield* syncProgress(attempt, session, paper.length, now);
          if (paper[at.index]?.id !== questionId) return yield* new Conflict({ message: "That question isn't open any more." });
          if (at.deadline !== null && now > at.deadline + questionGraceMs)
            return yield* new Conflict({ message: "Time for this question is up." });
        }
        const cleaned =
          question.type === "drawing"
            ? yield* db.query((d) => keepOwnPictures(d, user.id, cleanAnswer(question, value)))
            : cleanAnswer(question, value);
        const now = new Date();
        const spent = timeSpentMs === undefined ? null : Math.min(Math.max(0, timeSpentMs), 24 * 3600_000);
        const [before] = yield* db.query((d) =>
          d.select({ id: answers.id }).from(answers).where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId))),
        );
        yield* db.query((d) =>
          d.transaction(async (tx) => {
            const [saved] = await tx
              .insert(answers)
              .values({ attemptId, questionId, value: cleaned, answeredAt: now, timeSpentMs: spent })
              .onConflictDoUpdate({
                target: [answers.attemptId, answers.questionId],
                set: { value: cleaned, answeredAt: now, ...(spent === null ? {} : { timeSpentMs: spent }) },
              })
              .returning({ id: answers.id });
            // Exam sessions keep every save, so the integrity report can show how an answer changed.
            if (session.mode === "exam") await tx.insert(answerHistory).values({ attemptId, questionId, value: cleaned, savedAt: now });
            if (typing && keepsTyping(question.type)) {
              const edits = cleanTyping(typing);
              await tx
                .insert(typingEdits)
                .values({ answerId: saved!.id, edits })
                .onConflictDoUpdate({ target: typingEdits.answerId, set: { edits } });
            }
            // The first answer to a question that came faster than anyone can read it.
            if (!before && spent !== null && spent < tooFastMs && hasAnswer(cleaned))
              await tx.insert(integrityEvents).values({ attemptId, type: "too_fast", at: now, durationMs: spent });
          }),
        );
        yield* hub.attemptChanged(attemptId, { answer: { questionId, value: cleaned } });
      }),

      "attempt.runSampleTests": Effect.fn("attempt.runSampleTests")(function* ({ attemptId, questionId, code }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        const { attempt, session, quiz } = yield* ownAttempt(attemptId, user.id);
        yield* requireWritable(attempt, session);
        const [row] = yield* db.query((d) =>
          d
            .select({ question: questions })
            .from(questions)
            .innerJoin(quizParts, eq(questions.partId, quizParts.id))
            .where(and(eq(questions.id, questionId), eq(quizParts.quizId, quiz.id))),
        );
        const question = row && toQuestion(row.question);
        if (question?.type !== "code") return yield* new Conflict({ message: "That isn't a code question." });
        if (code.length > maxCodeLength) return yield* new Conflict({ message: "Your code is too long." });
        const samples = question.tests.filter((t) => !t.hidden);
        if (samples.length === 0) return yield* new Conflict({ message: "This question has no sample tests to run." });

        const now = Date.now();
        const recent = (recentRuns.get(user.id) ?? []).filter((t) => now - t < 60_000);
        if (recent.length >= runsPerMinute)
          return yield* new Conflict({ message: "You've run your code a lot this minute. Wait a moment, then try again." });
        recentRuns.set(user.id, [...recent, now]);
        return (yield* runner.runTests(question, code, samples)) as CodeTestResult[] | null;
      }),

      "attempt.submit": Effect.fn("attempt.submit")(function* ({ attemptId, deviceId, answers: sent, events, typing }, { headers }) {
        const user = yield* requirePermission({ attempt: ["create"] });
        const { attempt, session } = yield* ownAttempt(attemptId, user.id);
        // An attempt that is already in comes back as it is, whatever the time.
        if (attempt.status === "in_progress") {
          yield* requireWritable(attempt, session);
          // The network allowlist isn't checked here: handing in what the student has is always safe.
          yield* guard(attempt, session, deviceId, clientIp(headers), { network: false });
        }
        const done = yield* quizzesService.submit({ attemptId, answers: sent, typing, events, auto: false });
        if (!done) return yield* noAttempt;
        const [fresh] = yield* db.query((d) => d.select().from(quizSessions).where(eq(quizSessions.id, session.id)));
        const visible = resultsVisible(toSession(fresh!, Date.now()));
        return { status: done.status, result: visible && done.score ? summary(done.score) : null };
      }),

      "attempt.recordEvents": Effect.fn("attempt.recordEvents")(function* ({ attemptId, deviceId, events }, { headers }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        const { attempt, session } = yield* ownAttempt(attemptId, user.id);
        // Events that arrive after the submit (a late flush) are dropped.
        if (attempt.status !== "in_progress") return;
        yield* guard(attempt, session, deviceId, clientIp(headers));
        const cleaned = cleanEvents(events, new Date());
        if (cleaned.length === 0) return;
        yield* db.query((d) => d.insert(integrityEvents).values(cleaned.map((e) => toEventRow(attemptId, e))));
        yield* hub.attemptChanged(attemptId, { events: cleaned });
      }),

      "attempt.heartbeat": Effect.fn("attempt.heartbeat")(function* ({ attemptId, deviceId }, { headers }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        const { attempt, session } = yield* ownAttempt(attemptId, user.id);
        if (attempt.status !== "in_progress") return;
        yield* guard(attempt, session, deviceId, clientIp(headers));
      }),

      "attempt.advance": Effect.fn("attempt.advance")(function* ({ attemptId, deviceId }, { headers }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        const { attempt, session, quiz } = yield* ownAttempt(attemptId, user.id);
        yield* requireWritable(attempt, session);
        yield* guard(attempt, session, deviceId, clientIp(headers));
        if (!session.oneQuestionAtATime) return yield* new Conflict({ message: "This session shows every question at once." });
        const detail = yield* db.query((d) => loadQuizDetail(d, quiz));
        const paper = flatQuestions(attemptPaper(detail, attempt.seed));
        const now = Date.now();
        const at = yield* syncProgress(attempt, session, paper.length, now);
        const current = paper[at.index];
        const [saved] = yield* db.query((d) =>
          d
            .select({ value: answers.value })
            .from(answers)
            .where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, current?.id ?? ""))),
        );
        const timeUp = at.deadline !== null && now > at.deadline;
        if (at.index >= paper.length - 1) return yield* new Conflict({ message: "This is the last question." });
        if (!timeUp && !(saved && hasAnswer(saved.value)))
          return yield* new Conflict({ message: "Answer this question before moving on." });
        yield* db.query((d) =>
          d
            .update(attempts)
            .set({ questionIndex: at.index + 1, questionStartedAt: new Date(now) })
            .where(eq(attempts.id, attemptId)),
        );
      }),

      "attempt.masteryState": Effect.fn("attempt.masteryState")(function* ({ attemptId, deviceId }, { headers }) {
        const user = yield* requirePermission({ attempt: ["read"] });
        const { attempt, session, quiz } = yield* ownAttempt(attemptId, user.id);
        if (session.mode !== "mastery") return yield* new Conflict({ message: "This isn't a mastery session." });
        if (attempt.status === "in_progress") {
          yield* requireOpen(attempt, session);
          yield* guard(attempt, session, deviceId, clientIp(headers), { required: true });
        }
        return yield* mastery.state(user.id, attempt, session, quiz);
      }),

      "attempt.masteryAnswer": Effect.fn("attempt.masteryAnswer")(function* ({ attemptId, deviceId, questionId, value, timeSpentMs }, { headers }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        const { attempt, session, quiz } = yield* ownAttempt(attemptId, user.id);
        if (session.mode !== "mastery") return yield* new Conflict({ message: "This isn't a mastery session." });
        yield* requireWritable(attempt, session);
        yield* guard(attempt, session, deviceId, clientIp(headers));
        return yield* mastery.answer(user.id, attempt, session, quiz, questionId, value, timeSpentMs);
      }),

      "attempt.result": Effect.fn("attempt.result")(function* ({ sessionId }) {
        const user = yield* requirePermission({ attempt: ["read"] });
        const { session, quiz } = yield* rosterSession(sessionId, user.id);
        const s = toSession(session, Date.now());
        const mine = yield* db.query((d) =>
          d
            .select()
            .from(attempts)
            .where(and(eq(attempts.sessionId, sessionId), eq(attempts.studentId, user.id)))
            .orderBy(desc(attempts.submittedAt)),
        );
        const last = mine.find((a) => a.status !== "in_progress");
        const visible = !!last && resultsVisible(s);
        const base = {
          session: s,
          quiz: toMeta(quiz),
          attemptsUsed: mine.length,
          submittedAt: last?.submittedAt?.toISOString() ?? null,
          paperVersion: last ? paperVersion(last.seed) : null,
          visible,
        };
        if (!last || !visible) return { ...base, summary: null, items: [], assetUrls: {} };
        const detail: QuizDetail = yield* db.query((d) => loadQuizDetail(d, quiz));
        const rows = yield* db.query((d) => d.select().from(answers).where(eq(answers.attemptId, last.id)));
        const byQuestion = new Map(rows.map((r) => [r.questionId, r]));
        const parts = attemptPaper(detail, last.seed);
        const paper = flatQuestions(parts);
        const assetUrls = yield* assets.paperUrls(user.id, assetIdsIn(JSON.stringify([parts, rows.map((r) => r.value)])));
        return {
          ...base,
          assetUrls,
          summary: summary(scoreOf(paper, rows)),
          items: parts.flatMap((part) =>
            part.questions.map((question) => {
              const row = byQuestion.get(question.id);
              return {
                partTitle: part.title,
                question,
                answer: row?.value ?? null,
                // A question the student never touched scores 0; a graded-later one is null.
                points: row ? questionScore(question, row) : 0,
                feedback: row?.feedback ?? "",
                ...(session.mode === "mastery"
                  ? { mastery: { tries: row?.tries ?? 0, mastered: row ? row.correct : false } }
                  : {}),
              };
            }),
          ),
        };
      }),

      "attempt.myScores": Effect.fn("attempt.myScores")(function* () {
        const user = yield* requirePermission({ attempt: ["read"] });
        const now = Date.now();
        return yield* db.query(async (d): Promise<MyScore[]> => {
          const rows = await roster(d, user.id);
          if (rows.length === 0) return [];
          const mine = await d
            .select()
            .from(attempts)
            .where(and(eq(attempts.studentId, user.id), inArray(attempts.sessionId, rows.map((r) => r.session.id)), ne(attempts.status, "in_progress")));
          const scores = await latestScores(d, rows, mine);
          return rows.map(({ session, quiz }) => {
            const s = toSession(session, now);
            const last = scores.latest.get(session.id);
            const score = last ? scores.scoreOf(last, quiz) : null;
            const released = !!score && resultsVisible(s) && score.ungraded === 0;
            return {
              sessionId: session.id,
              quizId: quiz.id,
              classId: session.classId,
              title: quiz.title,
              mode: session.mode,
              period: quiz.header.period,
              opensAt: s.opensAt,
              closesAt: s.closesAt,
              countInRecord: session.countInRecord,
              maxScore: quizTotals(scores.parts.get(quiz.id) ?? []).totalPoints,
              closed: s.status === "ended",
              attempted: !!last,
              score: released ? score.score : null,
              pending: !!last && !released,
            };
          });
        });
      }),
    });
  }),
);
