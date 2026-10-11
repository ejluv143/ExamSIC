// Live sessions: tickets for the WebSocket, and the buses (Dragonfly pub/sub channels) that carry what happens in
// a session to the teacher watching it and to the students taking it. Everything a stream shows is rebuilt from
// the database when it connects (pause, locks, extra time and every answer are stored), so a restarted API or a
// reconnecting browser sees the same state; only the deltas in between travel over the channels.
import {
  TicketTarget,
  RoleSchema,
  attemptScore,
  autoScore,
  eventsLevel,
  integrityReport,
  quizTotals,
  type AnswerValue,
  type Incident,
  type IncidentKind,
  type IntegrityEvent,
  type LiveStudent,
  type LiveStudentEvent,
  type LiveTeacherEvent,
  type QuizDetail,
  type Role,
  type StudentEndReason,
  hasAnswer,
} from "@examinus/contract";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { Config, Context, Effect, Layer, Option, Redacted, Schema, Stream } from "effect";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Cache } from "./Cache.ts";
import { Database } from "./Database.ts";
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
  type QuizItem,
  type QuizSessionItem,
} from "./database/schemas/index.ts";
import {
  attemptDeadline,
  attemptPaper,
  flatQuestions,
  loadQuizDetail,
  questionProgress,
  shownTimes,
  toSession,
} from "./Quizzes.ts";

export const ticketTtlMs = 60_000;

const TicketClaims = Schema.Struct({
  jti: Schema.String,
  uid: Schema.String,
  role: RoleSchema,
  target: TicketTarget,
  exp: Schema.Number,
});
const decodeClaims = Schema.decodeUnknownOption(TicketClaims);

export type TicketUser = { userId: string; role: Role; target: TicketTarget };

// What changed for one attempt. `answer` and `events` are shown to the teacher as they are; `state` tells the
// student's page to reload its pause, lock and deadline; `ended` closes the student's stream.
export type AttemptChange = {
  answer?: { questionId: string; value: AnswerValue };
  events?: readonly IntegrityEvent[];
  state?: boolean;
  ended?: StudentEndReason;
};

type StudentMessage = { attemptId: string | null; event: LiveStudentEvent | "resync" };
const teacherChannel = (sessionId: string) => `live:${sessionId}:teacher`;
const studentChannel = (sessionId: string) => `live:${sessionId}:student`;

type EventRow = typeof integrityEvents.$inferSelect;
type IncidentRow = typeof incidents.$inferSelect;

const toEvent = (e: Pick<EventRow, "type" | "at" | "durationMs">): IntegrityEvent => ({
  type: e.type,
  at: e.at.toISOString(),
  ...(e.durationMs === null ? {} : { durationMs: e.durationMs }),
});

export const toIncident = (r: IncidentRow): Incident => ({
  id: r.id,
  sessionId: r.sessionId,
  attemptId: r.attemptId,
  kind: r.kind,
  message: r.message,
  seconds: r.seconds,
  at: r.at.toISOString(),
});

// The table row for one student. `attempt` null: not started.
function liveRow(input: {
  detail: QuizDetail;
  session: QuizSessionItem;
  rosterId: string;
  attempt: AttemptItem | null;
  answerRows: readonly AnswerItem[];
  eventRows: readonly EventRow[];
  now: number;
}): LiveStudent {
  const { detail, session, rosterId, attempt, answerRows, eventRows, now } = input;
  if (!attempt) {
    const totals = quizTotals(detail.parts);
    return {
      studentId: rosterId,
      attemptId: null,
      status: null,
      startedAt: null,
      submittedAt: null,
      lastSeenAt: null,
      answered: 0,
      questionCount: totals.questionCount,
      marked: 0,
      questionIndex: 0,
      questionStartedAt: null,
      currentQuestionId: null,
      score: 0,
      max: totals.totalPoints,
      alerts: 0,
      awayMs: 0,
      level: "low",
      locked: false,
      extraSeconds: 0,
    };
  }
  const paper = flatQuestions(attemptPaper(detail, attempt.seed));
  const byQuestion = new Map(answerRows.map((a) => [a.questionId, a]));
  const open = attempt.status === "in_progress";
  const scored = new Map(
    paper.flatMap((q) => {
      const row = byQuestion.get(q.id);
      if (!row) return [];
      let auto = row.autoScore;
      if (open && session.mode !== "mastery") {
        try {
          auto = hasAnswer(row.value) ? autoScore(q, row.value, null) : null;
        } catch {
          auto = null;
        }
      }
      return [[q.id, { autoScore: auto, manualScore: row.manualScore }] as const];
    }),
  );
  const { score, max } = attemptScore(paper, scored);
  const answered = paper.filter((q) => hasAnswer(byQuestion.get(q.id)?.value ?? null)).length;

  let current = paper[0]?.id ?? null;
  let index = 0;
  if (session.mode === "mastery") {
    // The question at the head of the queue; the questions mastered so far are what the teacher watches.
    const head = attempt.masteryQueue?.[0];
    current = head ?? null;
    index = Math.max(0, paper.findIndex((q) => q.id === head));
  } else if (session.oneQuestionAtATime) {
    index = questionProgress(session, attempt, shownTimes(paper, answerRows), now).index;
    current = paper[index]?.id ?? null;
  } else {
    const latest = [...answerRows]
      .filter((a) => hasAnswer(a.value) && byQuestion.has(a.questionId))
      .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())[0];
    if (latest) current = latest.questionId;
    index = Math.max(0, paper.findIndex((q) => q.id === current));
  }

  const events = eventRows.map(toEvent);
  const report = integrityReport(events);
  return {
    studentId: rosterId,
    attemptId: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    lastSeenAt: attempt.lastSeenAt?.toISOString() ?? null,
    answered,
    questionCount: paper.length,
    marked: paper.filter((q) => byQuestion.get(q.id)?.markedForReview).length,
    ...(session.mode === "mastery" ? { mastered: answerRows.filter((a) => a.correct === true).length } : {}),
    questionIndex: index,
    questionStartedAt: attempt.questionStartedAt?.toISOString() ?? null,
    currentQuestionId: current,
    score,
    max,
    alerts: events.filter((e) => e.type !== "window_resize").length,
    awayMs: Math.round(report.awayMs + report.fullscreenMs),
    level: eventsLevel(events),
    locked: attempt.locked,
    extraSeconds: Math.round(attempt.extraMs / 1000),
  };
}

export const studentState = (
  session: Pick<QuizSessionItem, "pausedAt" | "closesAt" | "timeLimitMinutes">,
  attempt: Pick<AttemptItem, "locked" | "status" | "startedAt" | "extraMs">,
): Extract<LiveStudentEvent, { _tag: "state" }> => {
  const deadline = attemptDeadline(session, attempt);
  return {
    _tag: "state",
    paused: session.pausedAt !== null,
    locked: attempt.locked,
    deadline: deadline === null ? null : new Date(deadline).toISOString(),
    pausedAt: session.pausedAt?.toISOString() ?? null,
    status: attempt.status,
  };
};

export class LiveHub extends Context.Service<
  LiveHub,
  {
    // A single-use ticket good for a minute, for the user and the one stream it names.
    readonly issueTicket: (user: TicketUser) => Effect.Effect<{ ticket: string; expiresAt: string }>;
    // The user behind a ticket that is genuine, unexpired and not used before; none otherwise.
    readonly redeemTicket: (ticket: string) => Effect.Effect<Option.Option<TicketUser>>;
    // Whether this teacher owns the session.
    readonly ownsSession: (sessionId: string, userId: string) => Effect.Effect<boolean>;
    // Whether this student owns the attempt.
    readonly ownsAttempt: (attemptId: string, userId: string) => Effect.Effect<boolean>;
    readonly teacherStream: (sessionId: string) => Stream.Stream<LiveTeacherEvent>;
    readonly studentStream: (attemptId: string) => Stream.Stream<LiveStudentEvent>;
    // Something happened to an attempt: tells the teacher (and the student, with `state` or `ended`).
    readonly attemptChanged: (attemptId: string, change?: AttemptChange) => Effect.Effect<void>;
    // A heartbeat: tells the teacher at most every 10 seconds.
    readonly seen: (attemptId: string) => Effect.Effect<void>;
    // The session's own state changed (status, pause, time for everyone): everything is sent again.
    readonly sessionChanged: (sessionId: string) => Effect.Effect<void>;
    // A teacher action: stored for the report and shown to the teacher.
    readonly record: (input: {
      sessionId: string;
      attemptId: string | null;
      actorId: string;
      kind: IncidentKind;
      message?: string;
      seconds?: number;
    }) => Effect.Effect<void>;
    // A message from the teacher to one student.
    readonly warn: (attemptId: string, message: string) => Effect.Effect<void>;
  }
>()("examinus/api/LiveHub") {
  static readonly layer = Layer.effect(
    LiveHub,
    Effect.gen(function* () {
      const db = yield* Database;
      const cache = yield* Cache;
      const secret = Redacted.value(yield* Config.Redacted("BETTER_AUTH_SECRET"));

      const sign = (body: string) => createHmac("sha256", secret).update(body).digest("base64url");
      const toTeacher = (sessionId: string, event: LiveTeacherEvent) => cache.publish(teacherChannel(sessionId), event);
      const toStudents = (sessionId: string, message: StudentMessage) => cache.publish(studentChannel(sessionId), message);

      const issueTicket = (user: TicketUser) =>
        Effect.sync(() => {
          const exp = Date.now() + ticketTtlMs;
          const body = Buffer.from(
            JSON.stringify({ jti: randomUUID(), uid: user.userId, role: user.role, target: user.target, exp }),
          ).toString("base64url");
          return { ticket: `${body}.${sign(body)}`, expiresAt: new Date(exp).toISOString() };
        });

      // Redeemed tickets are remembered (in Dragonfly) until they would have expired anyway.
      const redeemTicket = (ticket: string) =>
        Effect.gen(function* () {
          const [body = "", mac = "", ...rest] = ticket.split(".");
          if (rest.length > 0 || body === "" || mac === "") return Option.none<TicketUser>();
          const expected = Buffer.from(sign(body));
          const given = Buffer.from(mac);
          if (expected.length !== given.length || !timingSafeEqual(expected, given)) return Option.none<TicketUser>();
          let json: unknown;
          try {
            json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
          } catch {
            return Option.none<TicketUser>();
          }
          const claims = decodeClaims(json);
          if (Option.isNone(claims)) return Option.none<TicketUser>();
          const { jti, uid, role, target, exp } = claims.value;
          const left = exp - Date.now();
          if (left <= 0 || !(yield* cache.claim(`ticket:${jti}`, left))) return Option.none<TicketUser>();
          return Option.some<TicketUser>({ userId: uid, role, target });
        });

      // Quiz details are cached for 30 seconds: a busy session asks for the same one on every change.
      const detailOf = Effect.fn("LiveHub.detailOf")(function* (quiz: QuizItem) {
        const key = `quiz-detail:${quiz.id}:${quiz.updatedAt.getTime()}`;
        const cached = yield* cache.getJson<QuizDetail>(key);
        if (cached) return cached;
        const detail = yield* db.query((d) => loadQuizDetail(d, quiz));
        yield* cache.setJson(key, detail, 30_000);
        return detail;
      });

      const ownsSession = (sessionId: string, userId: string) =>
        db
          .query((d) =>
            d
              .select({ id: quizSessions.id })
              .from(quizSessions)
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .where(and(eq(quizSessions.id, sessionId), eq(quizzes.ownerId, userId))),
          )
          .pipe(Effect.map((rows) => rows.length > 0));

      const ownsAttempt = (attemptId: string, userId: string) =>
        db
          .query((d) =>
            d.select({ id: attempts.id }).from(attempts).where(and(eq(attempts.id, attemptId), eq(attempts.studentId, userId))),
          )
          .pipe(Effect.map((rows) => rows.length > 0));

      // The whole picture of a session: one row per rostered student.
      const snapshot = Effect.fn("LiveHub.snapshot")(function* (sessionId: string) {
        const [head] = yield* db.query((d) =>
          d
            .select({ session: quizSessions, quiz: quizzes })
            .from(quizSessions)
            .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
            .where(eq(quizSessions.id, sessionId)),
        );
        if (!head) return null;
        const detail = yield* detailOf(head.quiz);
        const data = yield* db.query(async (d) => {
          const roster = await d
            .select({ userId: sessionStudents.studentId, rosterId: students.id })
            .from(sessionStudents)
            .innerJoin(students, eq(students.userId, sessionStudents.studentId))
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
        const now = Date.now();
        const rows = data.roster.map((r) => {
          // The attempt in progress, else the latest one.
          const mine = data.attemptRows.filter((a) => a.studentId === r.userId);
          const attempt =
            mine.find((a) => a.status === "in_progress") ?? [...mine].sort((a, b) => b.attemptNumber - a.attemptNumber)[0] ?? null;
          return liveRow({
            detail,
            session: head.session,
            rosterId: r.rosterId,
            attempt,
            answerRows: attempt ? data.answerRows.filter((a) => a.attemptId === attempt.id) : [],
            eventRows: attempt ? data.eventRows.filter((e) => e.attemptId === attempt.id) : [],
            now,
          });
        });
        return {
          _tag: "snapshot",
          session: toSession(head.session, now),
          students: rows,
          incidents: data.incidentRows.map(toIncident).reverse(),
        } satisfies LiveTeacherEvent;
      });

      // One attempt with its session, for refreshing its row.
      const loadAttempt = (attemptId: string) =>
        db
          .query((d) =>
            d
              .select({ attempt: attempts, session: quizSessions, quiz: quizzes, rosterId: students.id })
              .from(attempts)
              .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .innerJoin(students, eq(students.userId, attempts.studentId))
              .where(eq(attempts.id, attemptId)),
          )
          .pipe(Effect.map(([row]) => row ?? null));

      const refresh = Effect.fn("LiveHub.refresh")(function* (attemptId: string, change: AttemptChange) {
        const row = yield* loadAttempt(attemptId);
        if (!row) return;
        const sessionId = row.session.id;
        const detail = yield* detailOf(row.quiz);
        const [answerRows, eventRows] = yield* db.query((d) =>
          Promise.all([
            d.select().from(answers).where(eq(answers.attemptId, attemptId)),
            d.select().from(integrityEvents).where(eq(integrityEvents.attemptId, attemptId)),
          ]),
        );
        const now = Date.now();
        yield* toTeacher(sessionId, {
          _tag: "student",
          student: liveRow({ detail, session: row.session, rosterId: row.rosterId, attempt: row.attempt, answerRows, eventRows, now }),
        });
        if (change.answer)
          yield* toTeacher(sessionId, {
            _tag: "answer",
            attemptId,
            questionId: change.answer.questionId,
            value: change.answer.value,
            at: new Date(now).toISOString(),
          });
        if (change.events?.length) yield* toTeacher(sessionId, { _tag: "integrity", attemptId, events: change.events });
        if (change.ended) yield* toStudents(sessionId, { attemptId, event: { _tag: "ended", reason: change.ended } });
        else if (change.state) yield* toStudents(sessionId, { attemptId, event: "resync" });
      });

      // Never makes the request that caused it wait, and never fails it.
      const attemptChanged = (attemptId: string, change: AttemptChange = {}) =>
        refresh(attemptId, change).pipe(
          Effect.catchCause((cause) => Effect.logError("Live update failed", cause)),
          Effect.forkDetach,
          Effect.asVoid,
        );

      // At most one update every 10 seconds per attempt, across API instances.
      const seen = (attemptId: string) =>
        cache.claim(`seen:${attemptId}`, 10_000).pipe(Effect.flatMap((first) => (first ? attemptChanged(attemptId) : Effect.void)));

      const sessionChanged = (sessionId: string) =>
        Effect.gen(function* () {
          const event = yield* snapshot(sessionId);
          if (event) yield* toTeacher(sessionId, event);
          yield* toStudents(sessionId, { attemptId: null, event: "resync" });
        }).pipe(
          Effect.catchCause((cause) => Effect.logError("Live update failed", cause)),
          Effect.forkDetach,
          Effect.asVoid,
        );

      const record = Effect.fn("LiveHub.record")(function* (input: {
        sessionId: string;
        attemptId: string | null;
        actorId: string;
        kind: IncidentKind;
        message?: string;
        seconds?: number;
      }) {
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
        yield* toTeacher(input.sessionId, { _tag: "incident", incident: toIncident(row!) });
      });

      const warn = Effect.fn("LiveHub.warn")(function* (attemptId: string, message: string) {
        const row = yield* loadAttempt(attemptId);
        if (!row) return;
        yield* toStudents(row.session.id, {
          attemptId,
          event: { _tag: "warning", message, at: new Date().toISOString() },
        });
      });

      const teacherStream = (sessionId: string) =>
        Stream.unwrap(
          Effect.gen(function* () {
            // Subscribe before reading the database, so nothing that happens in between is lost.
            const messages = yield* cache.subscribe<LiveTeacherEvent>(teacherChannel(sessionId));
            const first = yield* snapshot(sessionId);
            return Stream.concat(first ? Stream.make(first) : Stream.empty, messages);
          }),
        );

      const studentStream = (attemptId: string) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const row = yield* loadAttempt(attemptId);
            if (!row) return Stream.empty;
            const messages = yield* cache.subscribe<StudentMessage>(studentChannel(row.session.id));
            const current = Effect.gen(function* () {
              const fresh = yield* loadAttempt(attemptId);
              return fresh ? studentState(fresh.session, fresh.attempt) : studentState(row.session, row.attempt);
            });
            const first = yield* current;
            if (first.status !== "in_progress") return Stream.make(first);
            return Stream.concat(
              Stream.make(first),
              messages.pipe(
                Stream.filter((m) => m.attemptId === null || m.attemptId === attemptId),
                Stream.mapEffect((m) => (m.event === "resync" ? current : Effect.succeed(m.event))),
                Stream.takeUntil((e) => e._tag === "ended"),
              ),
            );
          }),
        );

      return LiveHub.of({
        issueTicket,
        redeemTicket,
        ownsSession,
        ownsAttempt,
        teacherStream,
        studentStream,
        attemptChanged,
        seen,
        sessionChanged,
        record,
        warn,
      });
    }),
  );
}
