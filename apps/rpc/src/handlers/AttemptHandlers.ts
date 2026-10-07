import {
  AttemptRpcs,
  Conflict,
  NotFound,
  attemptScore,
  orderForAttempt,
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
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { Effect } from "effect";
import { Database, type Drizzle } from "../Database.ts";
import {
  answers,
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
  attemptDeadline,
  attemptPaper,
  cleanAnswer,
  cleanEvents,
  cleanTyping,
  flatQuestions,
  graceMs,
  loadParts,
  loadQuizDetail,
  Quizzes,
  resultsVisible,
  scoreOf,
  toQuestion,
  toSession,
  toEventRow,
} from "../Quizzes.ts";
import { Runner } from "../Runner.ts";
import { requirePermission } from "../Session.ts";
import { sampleResult } from "../sql-grader.ts";

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

    // The attempt must be in progress and inside its time (plus the grace).
    const requireOpen = Effect.fn("requireOpen")(function* (attempt: AttemptItem, session: QuizSessionItem) {
      if (attempt.status !== "in_progress") return yield* new Conflict({ message: "This attempt was already submitted." });
      const deadline = attemptDeadline(session, attempt.startedAt);
      if (deadline !== null && Date.now() > deadline + graceMs) return yield* new Conflict({ message: "Time is up." });
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
          return rows.map(({ session, quiz }) => {
            const s = toSession(session, now);
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

      "attempt.paper": Effect.fn("attempt.paper")(function* ({ sessionId }) {
        const user = yield* requirePermission({ attempt: ["read"] });
        const { session, quiz } = yield* rosterSession(sessionId, user.id);
        const now = Date.now();
        const s = toSession(session, now);
        const mine = yield* db.query((d) =>
          d.select().from(attempts).where(and(eq(attempts.sessionId, sessionId), eq(attempts.studentId, user.id))),
        );
        const open = mine.find((a) => a.status === "in_progress");
        const base = { session: s, quiz: toMeta(quiz), attemptsUsed: mine.length, codeRunner: runner.configured };

        if (!open) {
          if (s.status !== "running") return yield* new Conflict({ message: "This session isn't open." });
          if (session.attemptsAllowed !== null && mine.length >= session.attemptsAllowed)
            return yield* new Conflict({ message: "You've used all your attempts." });
          return { ...base, parts: [], attempt: null, answers: {}, typing: {}, deadline: null } satisfies Paper;
        }
        yield* requireOpen(open, session);

        const detail = yield* db.query((d) => loadQuizDetail(d, quiz));
        const saved = yield* db.query((d) =>
          d
            .select({ answer: answers, edits: typingEdits.edits })
            .from(answers)
            .leftJoin(typingEdits, eq(typingEdits.answerId, answers.id))
            .where(eq(answers.attemptId, open.id)),
        );
        // Students see what the answer query returns on the sample data, never the query itself.
        const parts = yield* Effect.forEach(attemptPaper(detail, open.seed), (part) =>
          Effect.forEach(part.questions, (q) =>
            q.type === "sql"
              ? Effect.promise(() => sampleResult(q)).pipe(
                  Effect.map((sample) => ({ ...toStudentQuestion(q), ...(sample ? { sampleResult: sample } : {}) })),
                  Effect.catchDefect(() => Effect.succeed(toStudentQuestion(q))),
                )
              : Effect.succeed(toStudentQuestion(q)),
          ).pipe(Effect.map((questions) => ({ ...part, questions }))),
        );
        const typing: Record<string, TypingEdits> = {};
        const values: Record<string, AnswerValue> = {};
        for (const { answer, edits } of saved) {
          values[answer.questionId] = answer.value ?? null;
          if (edits) typing[answer.questionId] = edits;
        }
        const deadline = attemptDeadline(session, open.startedAt);
        return {
          ...base,
          parts,
          attempt: toAttempt(open),
          answers: values,
          typing,
          deadline: deadline === null ? null : new Date(deadline).toISOString(),
        } satisfies Paper;
      }),

      "attempt.start": Effect.fn("attempt.start")(function* ({ sessionId }) {
        const user = yield* requirePermission({ attempt: ["create"] });
        const { session } = yield* rosterSession(sessionId, user.id);
        const mine = yield* db.query((d) =>
          d.select().from(attempts).where(and(eq(attempts.sessionId, sessionId), eq(attempts.studentId, user.id))),
        );
        // Starting again (another browser, a reload) resumes the attempt and keeps its first start time.
        const open = mine.find((a) => a.status === "in_progress");
        if (open) {
          yield* requireOpen(open, session);
          return toAttempt(open);
        }
        if (toSession(session, Date.now()).status !== "running") return yield* new Conflict({ message: "This session isn't open." });
        if (session.attemptsAllowed !== null && mine.length >= session.attemptsAllowed)
          return yield* new Conflict({ message: "You've used all your attempts." });
        const [created] = yield* db.query((d) =>
          d
            .insert(attempts)
            .values({ sessionId, studentId: user.id, attemptNumber: mine.length + 1 })
            .onConflictDoNothing()
            .returning(),
        );
        if (created) return toAttempt(created);
        // A second request started it first.
        const [again] = yield* db.query((d) =>
          d
            .select()
            .from(attempts)
            .where(and(eq(attempts.sessionId, sessionId), eq(attempts.studentId, user.id), eq(attempts.status, "in_progress"))),
        );
        return again ? toAttempt(again) : yield* new Conflict({ message: "Couldn't start the attempt. Try again." });
      }),

      "attempt.saveAnswer": Effect.fn("attempt.saveAnswer")(function* ({ attemptId, questionId, value, typing }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        const { attempt, session, quiz } = yield* ownAttempt(attemptId, user.id);
        yield* requireOpen(attempt, session);
        const [row] = yield* db.query((d) =>
          d
            .select({ question: questions })
            .from(questions)
            .innerJoin(quizParts, eq(questions.partId, quizParts.id))
            .where(and(eq(questions.id, questionId), eq(quizParts.quizId, quiz.id))),
        );
        if (!row) return yield* new NotFound({ message: "That question isn't in this quiz." });
        const question = toQuestion(row.question);
        const cleaned = cleanAnswer(question, value);
        const now = new Date();
        yield* db.query((d) =>
          d.transaction(async (tx) => {
            const [saved] = await tx
              .insert(answers)
              .values({ attemptId, questionId, value: cleaned, answeredAt: now })
              .onConflictDoUpdate({ target: [answers.attemptId, answers.questionId], set: { value: cleaned, answeredAt: now } })
              .returning({ id: answers.id });
            if (typing && (question.type === "code" || question.type === "sql")) {
              const edits = cleanTyping(typing);
              await tx
                .insert(typingEdits)
                .values({ answerId: saved!.id, edits })
                .onConflictDoUpdate({ target: typingEdits.answerId, set: { edits } });
            }
          }),
        );
      }),

      "attempt.runSampleTests": Effect.fn("attempt.runSampleTests")(function* ({ attemptId, questionId, code }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        const { attempt, session, quiz } = yield* ownAttempt(attemptId, user.id);
        yield* requireOpen(attempt, session);
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

      "attempt.submit": Effect.fn("attempt.submit")(function* ({ attemptId, answers: sent, events, typing }) {
        const user = yield* requirePermission({ attempt: ["create"] });
        const { attempt, session } = yield* ownAttempt(attemptId, user.id);
        // An attempt that is already in comes back as it is, whatever the time.
        if (attempt.status === "in_progress") yield* requireOpen(attempt, session);
        const done = yield* quizzesService.submit({ attemptId, answers: sent, typing, events, auto: false });
        if (!done) return yield* noAttempt;
        const [fresh] = yield* db.query((d) => d.select().from(quizSessions).where(eq(quizSessions.id, session.id)));
        const visible = resultsVisible(toSession(fresh!, Date.now()));
        return { status: done.status, result: visible && done.score ? summary(done.score) : null };
      }),

      "attempt.recordEvents": Effect.fn("attempt.recordEvents")(function* ({ attemptId, events }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        const { attempt } = yield* ownAttempt(attemptId, user.id);
        // Events that arrive after the submit (a late flush) are dropped.
        if (attempt.status !== "in_progress") return;
        const cleaned = cleanEvents(events, new Date());
        if (cleaned.length === 0) return;
        yield* db.query((d) => d.insert(integrityEvents).values(cleaned.map((e) => toEventRow(attemptId, e))));
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
        const base = { session: s, quiz: toMeta(quiz), attemptsUsed: mine.length, submittedAt: last?.submittedAt?.toISOString() ?? null, visible };
        if (!last || !visible) return { ...base, summary: null, items: [] };
        const detail: QuizDetail = yield* db.query((d) => loadQuizDetail(d, quiz));
        const rows = yield* db.query((d) => d.select().from(answers).where(eq(answers.attemptId, last.id)));
        const byQuestion = new Map(rows.map((r) => [r.questionId, r]));
        const parts = attemptPaper(detail, last.seed);
        const paper = flatQuestions(parts);
        return {
          ...base,
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
