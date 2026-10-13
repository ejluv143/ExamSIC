// Running a quiz for a class and reading the results (`session.*`). Times are ISO 8601 strings. Students are named by
// roster id (`students.id` of the classes tables; the API maps it to an account through students.user_id); `classId` is
// one of the teacher's classes (`class.*`).
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Answer, AnswerValue, Attempt, AttemptStatus, CodeResults, ExamPeriod, ExamSettings, GameSettings, IntegrityEvent, IntegritySettings, MasterySettings, ResultsRelease, Session, SessionMode, SessionPacing, SessionStatus, SessionNavigation, TypingEdits } from "@examinus/domain/quiz";
import { AiGradeSuggestion } from "./ai.ts";
import { Conflict, Forbidden, NotFound } from "./errors.ts";
import { Incident } from "./live.ts";
import { AuthMiddleware } from "./middleware.ts";
import { QuizDetail } from "./quiz.ts";
import { AttemptId, QuizId, SessionId } from "./shared.ts";

const ByQuestion = <S extends Schema.Top>(schema: S) => Schema.Record(Schema.String, schema);

// --- Sessions (the teacher's side) ---

// What the teacher chooses for a session. Pacing is always "student" for now.
const sessionSettings = {
  mode: SessionMode,
  // null: opens when the teacher presses Start.
  opensAt: Schema.NullOr(Schema.String),
  // null: stays open until the teacher ends it.
  closesAt: Schema.NullOr(Schema.String),
  timeLimitMinutes: Schema.NullOr(Schema.Int),
  attemptsAllowed: Schema.NullOr(Schema.Int),
  resultsRelease: ResultsRelease,
  integrity: IntegritySettings,
  // Mastery mode: required for it, null for the other modes.
  mastery: Schema.NullOr(MasterySettings),
  // Exam mode: required for it, null for the other modes.
  exam: Schema.NullOr(ExamSettings),
  // Game mode: required for it, null for the other modes.
  game: Schema.NullOr(GameSettings),
  // Who moves through the questions. Only a game uses "teacher"; the other modes are always "student".
  pacing: SessionPacing,
  countInRecord: Schema.Boolean,
  // Prevention. questionTimeLimitSeconds needs oneQuestionAtATime, and so do the navigation rules other than "free".
  oneQuestionAtATime: Schema.Boolean,
  questionTimeLimitSeconds: Schema.NullOr(Schema.Int),
  navigation: SessionNavigation,
  // 0: marking for review is off; null: no limit.
  maxMarked: Schema.NullOr(Schema.Int),
  lateJoinMinutes: Schema.NullOr(Schema.Int),
  // null: no password. The password is only ever sent to the teacher, never in `Session`.
  roomPassword: Schema.NullOr(Schema.String),
  // Allowed networks as CIDR ranges or plain addresses (e.g. "10.0.4.0/24"); empty: anywhere.
  ipAllowlist: Schema.Array(Schema.String),
  // Games without a class: anyone with the key may join as a guest, giving only a name.
  allowGuests: Schema.Boolean,
  // Team Relay: the password teams must find (null: each team gets a generated word), and the clues one correct
  // answer each reveals (piece kind "clue"). Only ever sent to the teacher, never in `Session`.
  relayPassword: Schema.NullOr(Schema.String),
  relayClues: Schema.Array(Schema.String),
};

export const SessionSettingsFields = Schema.Struct(sessionSettings);
export type SessionSettingsFields = typeof SessionSettingsFields.Type;

export const SessionListItem = Schema.Struct({
  session: Session,
  quizTitle: Schema.String,
  studentCount: Schema.Int,
  // Students with at least one submitted attempt.
  submittedCount: Schema.Int,
  // Submitted attempts waiting for the teacher.
  needsGrading: Schema.Int,
});
export type SessionListItem = typeof SessionListItem.Type;

// One student's attempt as the teacher sees it. `questionOrder` lists the question ids this student's paper
// had, in the order they saw them (a pool draws only some of the quiz's questions).
export const AttemptDetail = Schema.Struct({
  attempt: Attempt,
  // Roster id.
  studentId: Schema.String,
  questionOrder: Schema.Array(Schema.String),
  answers: Schema.Array(Answer),
  integrityEvents: Schema.Array(IntegrityEvent),
  // Where and on which browser the attempt was started (for shared-device and network checks).
  ip: Schema.NullOr(Schema.String),
  deviceId: Schema.NullOr(Schema.String),
  codeResults: ByQuestion(CodeResults),
  typing: ByQuestion(TypingEdits),
  // AI score suggestions for essay answers, kept until the answer changes. Teachers only.
  aiSuggestions: ByQuestion(AiGradeSuggestion),
});
export type AttemptDetail = typeof AttemptDetail.Type;

// The scores of one session for the class record: each student's latest submitted attempt.
export const ClassSessionScores = Schema.Struct({
  sessionId: Schema.String,
  quizId: Schema.String,
  title: Schema.String,
  mode: SessionMode,
  // The quiz's grading period (header.period), which tells the class record the term.
  period: Schema.NullOr(ExamPeriod),
  // Derived, like Session.status. Every session of the class is listed, with no scores until students submit.
  status: SessionStatus,
  maxScore: Schema.Number,
  opensAt: Schema.NullOr(Schema.String),
  closesAt: Schema.NullOr(Schema.String),
  endedAt: Schema.NullOr(Schema.String),
  countInRecord: Schema.Boolean,
  scores: Schema.Array(
    Schema.Struct({
      // Roster id.
      studentId: Schema.String,
      // null: still needs grading.
      score: Schema.NullOr(Schema.Number),
      submittedAt: Schema.String,
    }),
  ),
});
export type ClassSessionScores = typeof ClassSessionScores.Type;

const teacherErrors = Schema.Union([Forbidden, NotFound]);
const stateErrors = Schema.Union([Forbidden, NotFound, Conflict]);

// One saved version of an answer in an exam session (every save is kept).
export const AnswerHistoryEntry = Schema.Struct({
  questionId: Schema.String,
  value: AnswerValue,
  savedAt: Schema.String,
});
export type AnswerHistoryEntry = typeof AnswerHistoryEntry.Type;

// A score changed after the results were released (exam sessions), with the reason the grader gave. Points.
export const GradeChange = Schema.Struct({
  id: Schema.String,
  questionId: Schema.String,
  changedBy: Schema.NullOr(Schema.String),
  oldScore: Schema.NullOr(Schema.Number),
  newScore: Schema.NullOr(Schema.Number),
  reason: Schema.String,
  at: Schema.String,
});
export type GradeChange = typeof GradeChange.Type;

// What the integrity report of one exam attempt is built from: the attempt with its events, the teacher's
// actions on it, every saved version of each answer, and the score changes after release.
export const ExamRecord = Schema.Struct({
  detail: AttemptDetail,
  incidents: Schema.Array(Incident),
  history: Schema.Array(AnswerHistoryEntry),
  gradeChanges: Schema.Array(GradeChange),
});
export type ExamRecord = typeof ExamRecord.Type;

export class SessionRpcs extends RpcGroup.make(
  // Creates a session of a quiz. classId: one of the teacher's classes, whose current members are on the roster;
  // null: no class, so any student on a class roster may join with the key.
  Rpc.make("create", {
    payload: {
      ...QuizId,
      classId: Schema.NullOr(Schema.String),
      // true: opens right away (a game opens its lobby). false: follows opensAt, or waits for Start.
      startNow: Schema.Boolean,
      ...sessionSettings,
    },
    success: Session,
    error: stateErrors,
  }),
  // Changes settings and class. Conflict once the session has ended.
  Rpc.make("update", {
    payload: { ...SessionId, classId: Schema.NullOr(Schema.String), ...sessionSettings },
    success: Session,
    error: stateErrors,
  }),
  Rpc.make("list", {
    payload: { quizId: Schema.optionalKey(Schema.String), classId: Schema.optionalKey(Schema.String) },
    success: Schema.Array(SessionListItem),
    error: Forbidden,
  }),
  Rpc.make("get", {
    payload: SessionId,
    success: Schema.Struct({
      session: Session,
      quiz: QuizDetail,
      studentIds: Schema.Array(Schema.String),
      // Only the teacher gets these (see sessionSettings).
      roomPassword: Schema.NullOr(Schema.String),
      ipAllowlist: Schema.Array(Schema.String),
      relayPassword: Schema.NullOr(Schema.String),
      relayClues: Schema.Array(Schema.String),
    }),
    error: teacherErrors,
  }),
  // Opens the session now (before opensAt, or when it has none). Conflict if it has ended.
  Rpc.make("start", { payload: SessionId, success: Session, error: stateErrors }),
  // Ends the session now and submits the attempts still in progress.
  Rpc.make("end", { payload: SessionId, success: Session, error: teacherErrors }),
  Rpc.make("remove", { payload: SessionId, error: teacherErrors }),
  // For resultsRelease "manual": show or hide scores to students.
  Rpc.make("releaseResults", {
    payload: { ...SessionId, released: Schema.Boolean },
    success: Session,
    error: teacherErrors,
  }),
  // Every attempt of the session, submitted or not.
  Rpc.make("attempts", { payload: SessionId, success: Schema.Array(AttemptDetail), error: teacherErrors }),
  // Sets (or clears, with null) the teacher's score in points and the feedback for one answer, then updates
  // the attempt's status: graded once nothing is left waiting.
  Rpc.make("grade", {
    payload: {
      ...AttemptId,
      questionId: Schema.String,
      manualScore: Schema.NullOr(Schema.Number),
      feedback: Schema.NullOr(Schema.String),
      // Required (exam sessions) when the score changes after the results were released; kept in the grade log.
      reason: Schema.optionalKey(Schema.String),
    },
    success: Schema.Struct({ status: AttemptStatus }),
    error: stateErrors,
  }),
  // The sessions linked to a class and each student's score, for the class record.
  Rpc.make("classScores", {
    payload: { classId: Schema.String },
    success: Schema.Array(ClassSessionScores),
    error: Forbidden,
  }),
  // --- Teacher actions while the session runs (each is kept as an `Incident`) ---
  // Stops every clock and refuses saves; deadlines move by the time paused once it resumes.
  Rpc.make("pause", { payload: SessionId, success: Session, error: stateErrors }),
  Rpc.make("resume", { payload: SessionId, success: Session, error: stateErrors }),
  // Extra time for one student (attemptId) or everyone still taking the session.
  Rpc.make("addTime", {
    payload: { ...SessionId, attemptId: Schema.optionalKey(Schema.String), seconds: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 86400 })) },
    error: stateErrors,
  }),
  Rpc.make("warn", {
    payload: { ...AttemptId, message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500)) },
    error: stateErrors,
  }),
  // A locked student can't save or submit until unlocked.
  Rpc.make("setLocked", { payload: { ...AttemptId, locked: Schema.Boolean }, error: stateErrors }),
  // Submits the attempt as it is.
  Rpc.make("forceSubmit", { payload: AttemptId, error: stateErrors }),
  // Frees the attempt from the browser it started on, so the student can resume on another.
  Rpc.make("allowBackIn", { payload: AttemptId, error: stateErrors }),
  // Exam sessions: lets one named student, who used all their attempts, take the exam again. The reason is
  // kept as an incident. `attemptId` is any attempt of that student in the session.
  Rpc.make("grantRetake", {
    payload: { ...AttemptId, reason: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500)) },
    error: stateErrors,
  }),
  // Exam sessions: the full record of one attempt, for the integrity report (PDF and Excel).
  Rpc.make("examRecord", { payload: AttemptId, success: ExamRecord, error: teacherErrors }),
  // One attempt with the actions taken on it, for the live drawer.
  Rpc.make("liveAttempt", {
    payload: AttemptId,
    success: Schema.Struct({ detail: AttemptDetail, incidents: Schema.Array(Incident) }),
    error: teacherErrors,
  }),
)
  .prefix("session.")
  .middleware(AuthMiddleware) {}
