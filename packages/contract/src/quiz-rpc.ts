// The quiz system's RPC groups. `quiz.*` is the teacher's content (quizzes, parts, questions, the bank),
// `session.*` runs a quiz for a class and reads the results, `attempt.*` is what a student does.
// Times are ISO 8601 strings. Students are named by roster id (`Student.id`, e.g. "s9"; the API maps it to an
// account through users.student_id); classes are web-app data, so `classId` is just an id the web app owns.
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Conflict, Forbidden, NotFound } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";
import { CodeTestResult, Question, StudentQuestion } from "./question.ts";
import {
  Answer,
  AnswerValue,
  Attempt,
  AttemptStatus,
  CodeResults,
  ExamPeriod,
  IntegrityEvent,
  IntegritySettings,
  PaperHeader,
  PaperSettings,
  Quiz,
  QuizPart,
  QuizSettings,
  ResultsRelease,
  Session,
  SessionMode,
  SessionStatus,
  SubjectArea,
  TypingEdits,
} from "./quiz.ts";

const QuizId = { quizId: Schema.String };
const SessionId = { sessionId: Schema.String };
const AttemptId = { attemptId: Schema.String };
const ByQuestion = <S extends Schema.Top>(schema: S) => Schema.Record(Schema.String, schema);

// --- Quizzes ---

export const QuizPartWithQuestions = Schema.Struct({ ...QuizPart.fields, questions: Schema.Array(Question) });
export type QuizPartWithQuestions = typeof QuizPartWithQuestions.Type;

// A quiz with its parts and questions (teacher's view, answers included), parts and questions in order.
export const QuizDetail = Schema.Struct({ quiz: Quiz, parts: Schema.Array(QuizPartWithQuestions) });
export type QuizDetail = typeof QuizDetail.Type;

export const QuizListItem = Schema.Struct({
  quiz: Quiz,
  questionCount: Schema.Int,
  totalPoints: Schema.Number,
  // Newest first. A quiz with none shows as "Draft".
  sessions: Schema.Array(Session),
});
export type QuizListItem = typeof QuizListItem.Type;

// What the editor saves. New parts and questions carry any id (it only has to be unique within the draft):
// ids the quiz already has are updated in place, anything else is created with a fresh id, and parts or
// questions left out are deleted. Order in the arrays is the order in the quiz. Read the saved quiz back with
// `quiz.get` to learn the final ids.
export const QuizDraftPart = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  instructions: Schema.String,
  shuffleQuestions: Schema.Boolean,
  poolSize: Schema.NullOr(Schema.Int),
  questions: Schema.Array(Question),
});
export type QuizDraftPart = typeof QuizDraftPart.Type;

export const QuizDraft = Schema.Struct({
  // Absent: create a new quiz.
  id: Schema.optionalKey(Schema.String),
  title: Schema.String,
  description: Schema.String,
  subject: Schema.NullOr(Schema.String),
  subjectArea: Schema.NullOr(SubjectArea),
  header: PaperHeader,
  paper: PaperSettings,
  settings: QuizSettings,
  parts: Schema.Array(QuizDraftPart),
});
export type QuizDraft = typeof QuizDraft.Type;

export class QuizRpcs extends RpcGroup.make(
  Rpc.make("list", { success: Schema.Array(QuizListItem), error: Forbidden }),
  Rpc.make("get", { payload: QuizId, success: QuizDetail, error: Schema.Union([Forbidden, NotFound]) }),
  Rpc.make("save", {
    payload: { draft: QuizDraft },
    success: Schema.Struct({ quizId: Schema.String }),
    error: Schema.Union([Forbidden, NotFound]),
  }),
  Rpc.make("remove", { payload: QuizId, error: Schema.Union([Forbidden, NotFound]) }),
  Rpc.make("duplicate", {
    payload: QuizId,
    success: Schema.Struct({ quizId: Schema.String }),
    error: Schema.Union([Forbidden, NotFound]),
  }),
  // The shared question bank plus the signed-in teacher's own questions.
  Rpc.make("bank", { success: Schema.Array(Question), error: Forbidden }),
)
  .prefix("quiz.")
  .middleware(AuthMiddleware) {}

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
  countInRecord: Schema.Boolean,
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
  codeResults: ByQuestion(CodeResults),
  typing: ByQuestion(TypingEdits),
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

export class SessionRpcs extends RpcGroup.make(
  // Creates a scheduled session of a quiz for the given roster students.
  Rpc.make("create", {
    payload: { ...QuizId, classId: Schema.String, studentIds: Schema.Array(Schema.String), ...sessionSettings },
    success: Session,
    error: stateErrors,
  }),
  // Changes settings and roster. Conflict once the session has ended.
  Rpc.make("update", {
    payload: { ...SessionId, classId: Schema.String, studentIds: Schema.Array(Schema.String), ...sessionSettings },
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
    success: Schema.Struct({ session: Session, quiz: QuizDetail, studentIds: Schema.Array(Schema.String) }),
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
    },
    success: Schema.Struct({ status: AttemptStatus }),
    error: teacherErrors,
  }),
  // The sessions linked to a class and each student's score, for the class record.
  Rpc.make("classScores", {
    payload: { classId: Schema.String },
    success: Schema.Array(ClassSessionScores),
    error: Forbidden,
  }),
)
  .prefix("session.")
  .middleware(AuthMiddleware) {}

// --- Attempts (the student's side) ---

// The quiz facts a student may see before and while taking it.
export const QuizMeta = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  subject: Schema.NullOr(Schema.String),
  subjectArea: Schema.NullOr(SubjectArea),
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

// A student's paper. `parts` is empty until an attempt is in progress (questions are only sent after
// `attempt.start`), and is then in this attempt's seeded order. `deadline` is when the attempt stops
// accepting answers (time limit or session close, whichever is first), null when there is none.
export const Paper = Schema.Struct({
  session: Session,
  quiz: QuizMeta,
  parts: Schema.Array(PaperPart),
  attempt: Schema.NullOr(Attempt),
  attemptsUsed: Schema.Int,
  answers: ByQuestion(AnswerValue),
  typing: ByQuestion(TypingEdits),
  deadline: Schema.NullOr(Schema.String),
  // Whether the Run button can use the code runner (for languages the browser can't run).
  codeRunner: Schema.Boolean,
});
export type Paper = typeof Paper.Type;

export const ResultItem = Schema.Struct({
  partTitle: Schema.String,
  // With the answer key.
  question: Question,
  answer: AnswerValue,
  // null: waiting for the teacher.
  points: Schema.NullOr(Schema.Number),
  feedback: Schema.String,
});
export type ResultItem = typeof ResultItem.Type;

// The student's latest submitted attempt. `visible` follows the session's results release; until then
// `summary` is null and `items` is empty.
export const MyResult = Schema.Struct({
  session: Session,
  quiz: QuizMeta,
  attemptsUsed: Schema.Int,
  submittedAt: Schema.NullOr(Schema.String),
  visible: Schema.Boolean,
  summary: Schema.NullOr(AttemptResult),
  items: Schema.Array(ResultItem),
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

const openErrors = Schema.Union([Forbidden, NotFound, Conflict]);

export class AttemptRpcs extends RpcGroup.make(
  // Every session the student is on the roster of.
  Rpc.make("mine", { success: Schema.Array(MySessionItem), error: Forbidden }),
  Rpc.make("paper", { payload: SessionId, success: Paper, error: openErrors }),
  // Starts an attempt, or returns the one in progress (keeping its first startedAt). Conflict when the
  // session isn't open or the attempts are used up.
  Rpc.make("start", { payload: SessionId, success: Attempt, error: openErrors }),
  // Autosave of one answer. Conflict once the attempt is submitted or past its deadline (+60 s grace).
  Rpc.make("saveAnswer", {
    payload: {
      ...AttemptId,
      questionId: Schema.String,
      value: AnswerValue,
      typing: Schema.optionalKey(TypingEdits),
    },
    error: openErrors,
  }),
  // Runs a code answer against the question's sample tests. null: the runner isn't available.
  Rpc.make("runSampleTests", {
    payload: { ...AttemptId, questionId: Schema.String, code: Schema.String },
    success: Schema.NullOr(Schema.Array(CodeTestResult)),
    error: openErrors,
  }),
  // Saves the final answers and grades them. Submitting twice returns the first result.
  Rpc.make("submit", {
    payload: {
      ...AttemptId,
      answers: ByQuestion(AnswerValue),
      events: Schema.Array(IntegrityEvent),
      typing: ByQuestion(TypingEdits),
    },
    success: Schema.Struct({ status: AttemptStatus, result: Schema.NullOr(AttemptResult) }),
    error: openErrors,
  }),
  Rpc.make("recordEvents", { payload: { ...AttemptId, events: Schema.Array(IntegrityEvent) }, error: openErrors }),
  Rpc.make("result", { payload: SessionId, success: MyResult, error: openErrors }),
  Rpc.make("myScores", { success: Schema.Array(MyScore), error: Forbidden }),
)
  .prefix("attempt.")
  .middleware(AuthMiddleware) {}
