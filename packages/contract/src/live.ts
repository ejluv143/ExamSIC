// Live sessions: what the teacher watches and what the API pushes to students while a session runs.
// `live.ticket` (normal auth, HTTP) hands out a short-lived ticket; the WebSocket group `LiveRpcs` trusts the
// ticket instead of a login cookie, because the browser can't send its cookie to the API's host.
import { Context, Schema } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/rpc";
import { Conflict, Forbidden, NotFound, Unauthorized } from "./errors.ts";
import { GameView } from "./game.ts";
import { AuthMiddleware } from "./middleware.ts";
import type { Role } from "./roles.ts";
import { AnswerValue, AttemptStatus, IntegrityEvent, Session } from "./quiz.ts";

// --- Teacher actions, kept for the report ---

const IntegrityLevel = Schema.Literals(["low", "medium", "high"]);

export const incidentKinds = [
  "pause",
  "resume",
  "add_time",
  "warn",
  "lock",
  "unlock",
  "force_submit",
  "allow_back_in",
  // Exam sessions: the teacher approved another device (or a late return) for one attempt, and granted a retake.
  "device_switch_allowed",
  "retake_granted",
] as const;
export const IncidentKind = Schema.Literals(incidentKinds);
export type IncidentKind = typeof IncidentKind.Type;

// Something the teacher did during the session. `attemptId` is null for session-wide actions.
export const Incident = Schema.Struct({
  id: Schema.String,
  sessionId: Schema.String,
  attemptId: Schema.NullOr(Schema.String),
  kind: IncidentKind,
  // The warning text.
  message: Schema.NullOr(Schema.String),
  // Seconds added (add_time) or the length of the pause (resume).
  seconds: Schema.NullOr(Schema.Int),
  at: Schema.String,
});
export type Incident = typeof Incident.Type;

// --- The teacher's stream ---

// One row of the live table. A student who hasn't started has no attempt (`attemptId` null, `status` null).
export const LiveStudent = Schema.Struct({
  // Roster id.
  studentId: Schema.String,
  attemptId: Schema.NullOr(Schema.String),
  status: Schema.NullOr(AttemptStatus),
  startedAt: Schema.NullOr(Schema.String),
  submittedAt: Schema.NullOr(Schema.String),
  // Last check-in (heartbeat or save): a gap over ~30 s means the student is offline.
  lastSeenAt: Schema.NullOr(Schema.String),
  // Questions with an answer, out of the paper's size.
  answered: Schema.Int,
  questionCount: Schema.Int,
  // Questions the student has marked for review right now.
  marked: Schema.Int,
  // Mastery: questions answered correctly so far (the other modes leave it out).
  mastered: Schema.optionalKey(Schema.Int),
  // The question the student is on (0-based) and when it was shown: the teacher-paced game plugs in here.
  questionIndex: Schema.Int,
  questionStartedAt: Schema.NullOr(Schema.String),
  currentQuestionId: Schema.NullOr(Schema.String),
  // Points of the answers that can be checked right now (essays and unchecked code wait), out of `max`.
  score: Schema.Number,
  max: Schema.Number,
  // Integrity events (resizing the window doesn't count) and minutes away, as milliseconds.
  alerts: Schema.Int,
  awayMs: Schema.Int,
  level: IntegrityLevel,
  locked: Schema.Boolean,
  // Extra time the teacher gave this student, in seconds.
  extraSeconds: Schema.Int,
});
export type LiveStudent = typeof LiveStudent.Type;

const Tagged = <const Tag extends string, Fields extends Schema.Struct.Fields>(tag: Tag, fields: Fields) =>
  Schema.Struct({ _tag: Schema.Literal(tag), ...fields });

export const LiveTeacherEvent = Schema.Union([
  // The first event of every stream: everything the table needs.
  Tagged("snapshot", {
    session: Session,
    students: Schema.Array(LiveStudent),
    incidents: Schema.Array(Incident),
  }),
  // A student's row changed (replace it).
  Tagged("student", { student: LiveStudent }),
  // The current answer to one question, as just saved.
  Tagged("answer", { attemptId: Schema.String, questionId: Schema.String, value: AnswerValue, at: Schema.String }),
  Tagged("integrity", { attemptId: Schema.String, events: Schema.Array(IntegrityEvent) }),
  Tagged("incident", { incident: Incident }),
  Tagged("session", { session: Session }),
]);
export type LiveTeacherEvent = typeof LiveTeacherEvent.Type;

// --- The student's stream ---

export const StudentEndReason = Schema.Literals(["teacher", "session_ended", "time_up"]);
export type StudentEndReason = typeof StudentEndReason.Type;

export const LiveStudentEvent = Schema.Union([
  // The first event of every stream, and again whenever pause, lock or the deadline change.
  Tagged("state", {
    paused: Schema.Boolean,
    locked: Schema.Boolean,
    // When the attempt stops taking answers (null: no limit). While `paused` the clock is stopped.
    deadline: Schema.NullOr(Schema.String),
    // When the pause began, so the page can show the time that was left.
    pausedAt: Schema.NullOr(Schema.String),
    status: AttemptStatus,
  }),
  Tagged("warning", { message: Schema.String, at: Schema.String }),
  // The attempt was submitted by the server.
  Tagged("ended", { reason: StudentEndReason }),
]);
export type LiveStudentEvent = typeof LiveStudentEvent.Type;

// --- Tickets ---

// Who a ticket is for: the teacher watching a session, or the student taking an attempt.
export const TicketTarget = Schema.Union([
  Tagged("teacher", { sessionId: Schema.String }),
  Tagged("student", { attemptId: Schema.String }),
  // A game: the teacher presenting it, or a student playing it.
  Tagged("game", { sessionId: Schema.String }),
]);
export type TicketTarget = typeof TicketTarget.Type;

// The header the browser puts the ticket in on every live request.
export const liveTicketHeader = "x-live-ticket";

// The signed-in user behind a ticket, provided to the live handlers by `LiveAuthMiddleware`.
export class LiveClaims extends Context.Service<
  LiveClaims,
  { userId: string; role: Role; target: TicketTarget }
>()("examora/contract/LiveClaims") {}

export class LiveAuthMiddleware extends RpcMiddleware.Service<LiveAuthMiddleware, { provides: LiveClaims }>()(
  "examora/contract/LiveAuthMiddleware",
  { error: Unauthorized },
) {}

// Served by the API at this path, over WebSocket.
export const liveRpcPath = "/rpc/live";

const liveErrors = Schema.Union([Forbidden, NotFound]);

export class LiveRpcs extends RpcGroup.make(
  // The teacher's stream for one session: a snapshot, then changes.
  Rpc.make("teacher", {
    payload: { sessionId: Schema.String },
    success: LiveTeacherEvent,
    error: liveErrors,
    stream: true,
  }),
  // The student's stream for their own attempt.
  Rpc.make("student", {
    payload: { attemptId: Schema.String },
    success: LiveStudentEvent,
    error: liveErrors,
    stream: true,
  }),
  // A game: the presenter screen (the teacher) or a player. Each event is that screen's whole `GameView`.
  Rpc.make("game", {
    payload: { sessionId: Schema.String },
    success: GameView,
    error: liveErrors,
    stream: true,
  }),
)
  .prefix("live.")
  .middleware(LiveAuthMiddleware) {}

// HTTP (normal sign-in): trades the user's session for a 60-second, single-use ticket for the WebSocket.
export class LiveTicketRpcs extends RpcGroup.make(
  Rpc.make("ticket", {
    payload: { target: TicketTarget },
    success: Schema.Struct({ ticket: Schema.String, expiresAt: Schema.String }),
    error: Schema.Union([Forbidden, NotFound, Conflict]),
  }),
)
  .prefix("live.")
  .middleware(AuthMiddleware) {}
