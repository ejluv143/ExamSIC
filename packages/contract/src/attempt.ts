// What a student does with a session (`attempt.*`). Times are ISO 8601 strings.
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { CoachResult } from "@examinus/domain/analytics";
import { SubjectAreaSchema } from "@examinus/domain/classes";
import { MasteryAnswerResult, MasteryState } from "@examinus/domain/mastery";
import { CodeTestResult } from "@examinus/domain/kinds/base";
import { RevealQuestion, StudentQuestion } from "@examinus/domain/question";
import { AnswerValue, Attempt, AttemptStatus, ExamPeriod, IntegrityEvent, PaperHeader, QuizPart, Session, SessionMode, TypingEdits } from "@examinus/domain/quiz";
import { ClientInfo } from "@examinus/domain/client";
import { Conflict, Forbidden, NotFound } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";
import { AttemptId, SessionId } from "./shared.ts";

const ByQuestion = <S extends Schema.Top>(schema: S) => Schema.Record(Schema.String, schema);

// --- Attempts (the student's side) ---

// The quiz facts a student may see before and while taking it.
export const QuizMeta = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  subject: Schema.NullOr(Schema.String),
  subjectArea: Schema.NullOr(SubjectAreaSchema),
  header: PaperHeader,
});
export type QuizMeta = typeof QuizMeta.Type;

export const AttemptResult = Schema.Struct({
  score: Schema.Number,
  max: Schema.Number,
  // Questions still waiting for the teacher.
  pendingEssays: Schema.Int,
});
export type AttemptResult = typeof AttemptResult.Type;

export const MySessionItem = Schema.Struct({
  session: Session,
  quizTitle: Schema.String,
  questionCount: Schema.Int,
  totalPoints: Schema.Number,
  // Attempts started, including one in progress.
  attemptsUsed: Schema.Int,
  inProgress: Schema.Boolean,
  lastSubmittedAt: Schema.NullOr(Schema.String),
  // The latest submitted attempt's score, only once results are visible to the student.
  result: Schema.NullOr(AttemptResult),
});
export type MySessionItem = typeof MySessionItem.Type;

export const PaperPart = Schema.Struct({
  ...QuizPart.fields,
  questions: Schema.Array(StudentQuestion),
});
export type PaperPart = typeof PaperPart.Type;

// Where each question of the paper stands, in the paper's order, for the overview and the review screen. With
// oneQuestionAtATime the paper only holds the question the student is on, so this is all they see of the others.
export const ReviewItem = Schema.Struct({
  questionId: Schema.String,
  answered: Schema.Boolean,
  marked: Schema.Boolean,
  // One question at a time with a time limit per question: its time ran out, so it can't be opened again.
  closed: Schema.Boolean,
  // The saved answer in a few words (`answerSummary`); null when not answered.
  summary: Schema.NullOr(Schema.String),
});
export type ReviewItem = typeof ReviewItem.Type;

// A student's paper. `parts` is empty until an attempt is in progress (questions are only sent after
// `attempt.start`), and is then in this attempt's seeded order. `deadline` is when the attempt stops
// accepting answers (time limit or session close, whichever is first), null when there is none.
export const Paper = Schema.Struct({
  session: Session,
  quiz: QuizMeta,
  parts: Schema.Array(PaperPart),
  attempt: Schema.NullOr(Attempt),
  attemptsUsed: Schema.Int,
  // What a student's paper holds (a pool counts as its draw size), shown on the intro screen.
  questionCount: Schema.Int,
  totalPoints: Schema.Number,
  answers: ByQuestion(AnswerValue),
  typing: ByQuestion(TypingEdits),
  deadline: Schema.NullOr(Schema.String),
  // With oneQuestionAtATime: `parts` holds only the question the student is on. `index` is its number (0-based)
  // among `questionCount`, `furthest` the furthest question reached; `deadline` is when its time runs out
  // (questionTimeLimitSeconds).
  progress: Schema.NullOr(
    Schema.Struct({ index: Schema.Int, furthest: Schema.Int, deadline: Schema.NullOr(Schema.String) }),
  ),
  // Every question of the attempt in progress (empty before it starts, and in mastery sessions).
  review: Schema.Array(ReviewItem),
  // Whether the Run button can use the code runner (for languages the browser can't run).
  codeRunner: Schema.Boolean,
  // Signed URLs (valid for ten minutes) of the images on the paper and in the student's own answers, by asset id.
  assetUrls: Schema.Record(Schema.String, Schema.String),
  // The teacher paused the session, or locked this attempt: nothing can be saved until they undo it.
  paused: Schema.Boolean,
  locked: Schema.Boolean,
});
export type Paper = typeof Paper.Type;

export const ResultItem = Schema.Struct({
  partTitle: Schema.String,
  // With the answer key, but without the grading secrets (hidden tests, rubric, hidden SQL data): issue #14.
  question: RevealQuestion,
  answer: AnswerValue,
  // null: waiting for the teacher.
  points: Schema.NullOr(Schema.Number),
  feedback: Schema.String,
  // Mastery sessions: the tries this question took and whether it was mastered (null: waits for the teacher).
  mastery: Schema.optionalKey(Schema.Struct({ tries: Schema.Int, mastered: Schema.NullOr(Schema.Boolean) })),
  // Time the question was on screen; null when it wasn't measured.
  timeSpentMs: Schema.NullOr(Schema.Int),
  // Times the answer changed before submitting; null where changes aren't recorded (games, mastery, older attempts).
  answerChanges: Schema.NullOr(Schema.Int),
});
export type ResultItem = typeof ResultItem.Type;

// The student's latest submitted attempt. `visible` follows the session's results release; until then
// `summary` is null and `items` is empty. `answerKey` says whether the questions and their answers are out too: not
// while the student can still take the session again (issue #15), when `summary` has the score and `items` is empty.
export const MyResult = Schema.Struct({
  session: Session,
  quiz: QuizMeta,
  attemptsUsed: Schema.Int,
  startedAt: Schema.NullOr(Schema.String),
  submittedAt: Schema.NullOr(Schema.String),
  // The version code of the paper this student got (derived from the attempt's seed); null before they started.
  paperVersion: Schema.NullOr(Schema.String),
  visible: Schema.Boolean,
  answerKey: Schema.Boolean,
  summary: Schema.NullOr(AttemptResult),
  items: Schema.Array(ResultItem),
  // Signed URLs of the images in the questions and in the student's answers, by asset id.
  assetUrls: Schema.Record(Schema.String, Schema.String),
});
export type MyResult = typeof MyResult.Type;

// One session in the student's standing, for linking class-record items.
export const MyScore = Schema.Struct({
  sessionId: Schema.String,
  quizId: Schema.String,
  classId: Schema.NullOr(Schema.String),
  title: Schema.String,
  mode: SessionMode,
  period: Schema.NullOr(ExamPeriod),
  opensAt: Schema.NullOr(Schema.String),
  closesAt: Schema.NullOr(Schema.String),
  countInRecord: Schema.Boolean,
  maxScore: Schema.Number,
  // The session has ended.
  closed: Schema.Boolean,
  // The student submitted at least once.
  attempted: Schema.Boolean,
  // The released, fully graded score; null while hidden or waiting for the teacher.
  score: Schema.NullOr(Schema.Number),
  // Submitted, but the score isn't out yet (not released, or waiting for the teacher).
  pending: Schema.Boolean,
});
export type MyScore = typeof MyScore.Type;

// The attempt belongs to a game session: its questions and answers only go through `game.*`, so the teacher's
// pacing and the live scoring hold. The web app sends the student to the game screen. `message` is written for people.
export class PlayInGame extends Schema.TaggedError<PlayInGame>()("PlayInGame", { message: Schema.String }) {}

// An exam for computers only, and the request came from a phone or tablet. `message` is written for people.
export class ComputersOnly extends Schema.TaggedError<ComputersOnly>()("ComputersOnly", { message: Schema.String }) {}

// An exam attempt on another device, or the same one after being away longer than the grace period, waits for
// the teacher's approval. The web app shows the waiting page. `message` is written for people.
export class DeviceApprovalRequired extends Schema.TaggedError<DeviceApprovalRequired>()("DeviceApprovalRequired", {
  message: Schema.String,
}) {}

// The attempt (not an exam) is open in another browser or device. `message` is written for people.
export class OpenElsewhere extends Schema.TaggedError<OpenElsewhere>()("OpenElsewhere", { message: Schema.String }) {}

// The request came from the desktop or mobile app, and that build is older than DESKTOP_MIN_VERSION or
// MOBILE_MIN_VERSION. `message` is written for people; `releasesUrl` is where the current build is downloaded from
// (the store page for the mobile app).
export class ClientOutdated extends Schema.TaggedError<ClientOutdated>()("ClientOutdated", {
  message: Schema.String,
  version: Schema.String,
  minVersion: Schema.String,
  releasesUrl: Schema.String,
}) {}

// An exam that needs the Examinus app on a verified device (the mobile app is allowed, and the device hasn't passed
// `client.attest`, or the exam doesn't allow the mobile app). `message` is written for people.
export class DeviceAttestationRequired extends Schema.TaggedError<DeviceAttestationRequired>()("DeviceAttestationRequired", {
  message: Schema.String,
}) {}

const openErrors = Schema.Union([Forbidden, NotFound, Conflict]);
// Calls that touch an attempt in progress must come from the browser it started on.
const guardedErrors = Schema.Union([Forbidden, NotFound, Conflict, DeviceApprovalRequired, OpenElsewhere]);
// ...and a game's attempts aren't served here.
const gameGuardedErrors = Schema.Union([Forbidden, NotFound, Conflict, DeviceApprovalRequired, OpenElsewhere, PlayInGame]);
// Opening a paper also refuses phones on computers-only exams, an app older than the API requires, and a mobile app
// that isn't verified. Running sample tests on a game attempt is refused too.
const gameErrors = Schema.Union([Forbidden, NotFound, Conflict, PlayInGame]);
const openingErrors = Schema.Union([
  Forbidden,
  NotFound,
  Conflict,
  DeviceApprovalRequired,
  OpenElsewhere,
  PlayInGame,
  ComputersOnly,
  ClientOutdated,
  DeviceAttestationRequired,
]);
// The id one attempt belongs to: a random token the browser keeps, or the hardware id a native app sends. The
// attestation (`client.attest`) of a native app is bound to it.
const DeviceId = { deviceId: Schema.String };
// What a client tells when it opens a paper or starts an attempt: who it is, and the proof from `client.attest`.
const ClientClaim = { client: Schema.optionalKey(ClientInfo), attestation: Schema.optionalKey(Schema.String) };

export class AttemptRpcs extends RpcGroup.make(
  // Every session the student is on the roster of.
  Rpc.make("mine", { success: Schema.Array(MySessionItem), error: Forbidden }),
  // `deviceId` (the browser's token) lets the API refuse an attempt that is open on another device.
  Rpc.make("paper", {
    payload: { ...SessionId, deviceId: Schema.optionalKey(Schema.String), ...ClientClaim },
    success: Paper,
    error: openingErrors,
  }),
  // Starts an attempt, or returns the one in progress (keeping its first startedAt). Conflict when the
  // session isn't open, the late-join cutoff has passed, the attempts are used up, or the attempt is open on
  // another device; Forbidden for a wrong room password or a network outside the allowlist.
  Rpc.make("start", {
    payload: {
      ...SessionId,
      ...DeviceId,
      roomPassword: Schema.optionalKey(Schema.String),
      // Exam sessions: the student accepted the honor pledge and the rules. Required to start.
      pledgeAccepted: Schema.optionalKey(Schema.Boolean),
      ...ClientClaim,
    },
    success: Attempt,
    error: openingErrors,
  }),
  // Autosave of one answer. Conflict once the attempt is submitted or past its deadline (+60 s grace).
  Rpc.make("saveAnswer", {
    payload: {
      ...AttemptId,
      ...DeviceId,
      // How long the question was on screen, in ms.
      timeSpentMs: Schema.optionalKey(Schema.Int),
      questionId: Schema.String,
      value: AnswerValue,
      typing: Schema.optionalKey(TypingEdits),
    },
    error: gameGuardedErrors,
  }),
  // Runs a code answer against the question's sample tests. null: the runner isn't available.
  Rpc.make("runSampleTests", {
    payload: { ...AttemptId, questionId: Schema.String, code: Schema.String },
    success: Schema.NullOr(Schema.Array(CodeTestResult)),
    error: gameErrors,
  }),
  // Saves the final answers and grades them. Submitting twice returns the first result.
  Rpc.make("submit", {
    payload: {
      ...AttemptId,
      ...DeviceId,
      answers: ByQuestion(AnswerValue),
      events: Schema.Array(IntegrityEvent),
      typing: ByQuestion(TypingEdits),
    },
    success: Schema.Struct({ status: AttemptStatus, result: Schema.NullOr(AttemptResult) }),
    error: gameGuardedErrors,
  }),
  Rpc.make("recordEvents", {
    payload: { ...AttemptId, ...DeviceId, events: Schema.Array(IntegrityEvent) },
    error: guardedErrors,
  }),
  // Check-in about every 15 seconds while the student takes it. The server records gaps over 30 seconds as
  // `disconnected` events, and refuses another device or a network outside the allowlist.
  Rpc.make("heartbeat", { payload: { ...AttemptId, ...DeviceId }, error: guardedErrors }),
  // Examinus Desktop: whether the student may close the app during their attempt. `ok` false for a wrong password
  // (the app stays). Only while the session has an exit password and the student has an attempt in progress.
  Rpc.make("verifyExitPassword", {
    payload: { ...SessionId, password: Schema.String },
    success: Schema.Struct({ ok: Schema.Boolean }),
    error: Schema.Union([Forbidden, NotFound, Conflict]),
  }),
  // One question at a time: opens question `index` (0-based) of the paper, as the session's navigation allows
  // (`moveRefusal`). Conflict with the reason otherwise.
  Rpc.make("goTo", { payload: { ...AttemptId, ...DeviceId, index: Schema.Int }, error: gameGuardedErrors }),
  // Marks a question of the attempt for review, or clears the mark. Conflict when marking is off, the limit
  // (`maxMarked`) is reached, or (one question at a time) the question to mark isn't the one the student is on.
  Rpc.make("setMarked", {
    payload: { ...AttemptId, ...DeviceId, questionId: Schema.String, marked: Schema.Boolean },
    error: guardedErrors,
  }),
  // Mastery mode: where the student stands and the question to answer now (resumes the saved queue).
  Rpc.make("masteryState", { payload: { ...AttemptId, ...DeviceId }, success: MasteryState, error: guardedErrors }),
  // Mastery mode: grades one try at once. Conflict when the question isn't the next in the queue.
  Rpc.make("masteryAnswer", {
    payload: {
      ...AttemptId,
      ...DeviceId,
      questionId: Schema.String,
      value: AnswerValue,
      timeSpentMs: Schema.optionalKey(Schema.Int),
    },
    success: MasteryAnswerResult,
    error: guardedErrors,
  }),
  Rpc.make("result", { payload: SessionId, success: MyResult, error: openErrors }),
  // The AI coach's reading of the student's latest released result (the rule-based one when the AI isn't set up or
  // fails). Kept once written, so reloading the page doesn't ask the model again. NotFound until results show.
  Rpc.make("coach", { payload: SessionId, success: CoachResult, error: openErrors }),
  Rpc.make("myScores", { success: Schema.Array(MyScore), error: Forbidden }),
)
  .prefix("attempt.")
  .middleware(AuthMiddleware) {}
