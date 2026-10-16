// Live sessions: tickets for the WebSocket, and the buses (LiveBus channels) that carry what happens in
// a session to the teacher watching it and to the students taking it. Everything a stream shows is rebuilt from
// the database when it connects (pause, locks, extra time and every answer are stored), so a restarted API or a
// reconnecting browser sees the same state; only the deltas in between travel over the channels.
import {
  TicketTarget,
  type IncidentKind,
  type LiveStudentEvent,
  type LiveTeacherEvent,
  type StudentEndReason,
} from "@examinus/contract/live";
import { type QuizDetail } from "@examinus/contract/quiz";
import { type AnswerValue, type IntegrityEvent } from "@examinus/domain/quiz";
import { type Role } from "@examinus/domain/roles";
import { RoleSchema } from "@examinus/domain/user";
import { Context, Effect, Layer, Option, Redacted, Schema, Stream } from "effect";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { AppConfig } from "../../platform/AppConfig.ts";
import { Cache } from "../../platform/Cache.ts";
import { LiveBus } from "../../platform/LiveBus.ts";
import type { QuizItem } from "../../database/schemas/index.ts";
import { type Actor } from "../auth/Session.ts";
import { toSession } from "../session/mappers.ts";
import { QuizRepo } from "../quiz/Repo.ts";
import { LiveRepo } from "./Repo.ts";
import { liveRow, studentState, ticketTtlMs, toIncident } from "./rules.ts";

const TicketClaims = Schema.Struct({
  jti: Schema.String,
  uid: Schema.String,
  role: RoleSchema,
  org: Schema.NullOr(Schema.String),
  target: TicketTarget,
  exp: Schema.Number,
});
const decodeClaims = Schema.decodeUnknownOption(TicketClaims);

// `organizationId` is the active organization the ticket was issued in; null for guests and platform admins.
export type TicketUser = { userId: string; organizationId: string | null; role: Role; target: TicketTarget };

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

export class LiveHub extends Context.Service<
  LiveHub,
  {
    // A single-use ticket good for a minute, for the user and the one stream it names.
    readonly issueTicket: (user: TicketUser) => Effect.Effect<{ ticket: string; expiresAt: string }>;
    // The user behind a ticket that is genuine, unexpired and not used before; none otherwise.
    readonly redeemTicket: (ticket: string) => Effect.Effect<Option.Option<TicketUser>>;
    // Whether this teacher owns the session, in their organization.
    readonly ownsSession: (sessionId: string, actor: Actor) => Effect.Effect<boolean>;
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
      const repo = yield* LiveRepo;
      const quizRepo = yield* QuizRepo;
      const cache = yield* Cache;
      const bus = yield* LiveBus;
      const secret = Redacted.value((yield* AppConfig).auth.secret);

      const sign = (body: string) => createHmac("sha256", secret).update(body).digest("base64url");
      const toTeacher = (sessionId: string, event: LiveTeacherEvent) => bus.publish(teacherChannel(sessionId), event);
      const toStudents = (sessionId: string, message: StudentMessage) => bus.publish(studentChannel(sessionId), message);

      const issueTicket = (user: TicketUser) =>
        Effect.sync(() => {
          const exp = Date.now() + ticketTtlMs;
          const body = Buffer.from(
            JSON.stringify({ jti: randomUUID(), uid: user.userId, role: user.role, org: user.organizationId, target: user.target, exp }),
          ).toString("base64url");
          return { ticket: `${body}.${sign(body)}`, expiresAt: new Date(exp).toISOString() };
        });

      // Redeemed tickets are remembered (in Dragonfly) until they would have expired anyway.
      const redeemTicket = Effect.fn("LiveHub.redeemTicket")(function* (ticket: string) {
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
        const { jti, uid, role, org, target, exp } = claims.value;
        const left = exp - Date.now();
        if (left <= 0 || !(yield* cache.claim(`ticket:${jti}`, left))) return Option.none<TicketUser>();
        return Option.some<TicketUser>({ userId: uid, organizationId: org, role, target });
      });

      // Quiz details are cached for 30 seconds: a busy session asks for the same one on every change.
      const detailOf = Effect.fn("LiveHub.detailOf")(function* (quiz: QuizItem) {
        const key = `quiz-detail:${quiz.id}:${quiz.updatedAt.getTime()}`;
        const cached = yield* cache.getJson<QuizDetail>(key);
        if (cached) return cached;
        const detail = yield* quizRepo.detail(quiz);
        yield* cache.setJson(key, detail, 30_000);
        return detail;
      });

      // The whole picture of a session: one row per rostered student.
      const snapshot = Effect.fn("LiveHub.snapshot")(function* (sessionId: string) {
        const head = yield* repo.sessionWithQuiz(sessionId);
        if (!head) return null;
        const detail = yield* detailOf(head.quiz);
        const data = yield* repo.sessionData(sessionId);
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

      const refresh = Effect.fn("LiveHub.refresh")(function* (attemptId: string, change: AttemptChange) {
        const row = yield* repo.loadAttempt(attemptId);
        if (!row) return;
        const sessionId = row.session.id;
        const detail = yield* detailOf(row.quiz);
        const { answerRows, eventRows } = yield* repo.attemptData(attemptId);
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

      const publishSession = Effect.fn("LiveHub.sessionChanged")(function* (sessionId: string) {
        const event = yield* snapshot(sessionId);
        if (event) yield* toTeacher(sessionId, event);
        yield* toStudents(sessionId, { attemptId: null, event: "resync" });
      });

      const sessionChanged = (sessionId: string) =>
        publishSession(sessionId).pipe(
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
        const row = yield* repo.insertIncident(input);
        yield* toTeacher(input.sessionId, { _tag: "incident", incident: toIncident(row) });
      });

      const warn = Effect.fn("LiveHub.warn")(function* (attemptId: string, message: string) {
        const row = yield* repo.loadAttempt(attemptId);
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
            const messages = yield* bus.subscribe<LiveTeacherEvent>(teacherChannel(sessionId));
            const first = yield* snapshot(sessionId);
            return Stream.concat(first ? Stream.make(first) : Stream.empty, messages);
          }),
        );

      const studentStream = (attemptId: string) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const row = yield* repo.loadAttempt(attemptId);
            if (!row) return Stream.empty;
            const messages = yield* bus.subscribe<StudentMessage>(studentChannel(row.session.id));
            const current = Effect.gen(function* () {
              const fresh = yield* repo.loadAttempt(attemptId);
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
        ownsSession: repo.ownsSession,
        ownsAttempt: repo.ownsAttempt,
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
