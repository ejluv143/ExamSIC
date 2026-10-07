// Quizzes, their sessions and what students did in them. Shapes match packages/contract/src/quiz.ts and
// question.ts; jsonb columns are typed with the contract types. Times that a quiz works with are timestamptz.
// Scores: `answers.auto_score` is the fraction correct (0..1), multiplied by the question's points when totals
// are computed; `answers.manual_score` is in points.
import {
  integrityEventTypes,
  questionTypes,
  AttemptStatus,
  ResultsRelease,
  SessionMode,
  SessionPacing,
  SessionStatus,
  type AnswerValue,
  type CodeResults,
  type IntegritySettings,
  type PaperHeader,
  type PaperSettings,
  type Question,
  type QuestionBody,
  type QuizSettings,
  type SubjectArea,
  type TypingEdits,
} from "@examora/contract";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { newId, timestamps, timestamptz } from "./_helpers.ts";
import { users } from "./auth.ts";

export const sessionMode = pgEnum("session_mode", SessionMode.literals);
export const sessionPacing = pgEnum("session_pacing", SessionPacing.literals);
export const sessionStatus = pgEnum("session_status", SessionStatus.literals);
export const resultsRelease = pgEnum("results_release", ResultsRelease.literals);
export const questionType = pgEnum("question_type", questionTypes);
export const gamePoints = pgEnum("game_points", ["standard", "double", "none"]);
export const attemptStatus = pgEnum("attempt_status", AttemptStatus.literals);
export const integrityEventType = pgEnum("integrity_event_type", integrityEventTypes);

export const quizzes = pgTable(
  "quizzes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("quiz")),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // Markdown.
    description: text("description").notNull().default(""),
    subject: text("subject"),
    subjectArea: text("subject_area").$type<SubjectArea>(),
    header: jsonb("header").$type<PaperHeader>().notNull(),
    paper: jsonb("paper").$type<PaperSettings>().notNull(),
    settings: jsonb("settings").$type<QuizSettings>().notNull(),
    ...timestamps,
  },
  (t) => [index("quizzes_owner_id_idx").on(t.ownerId)],
);

export const quizParts = pgTable(
  "quiz_parts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("part")),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    // Markdown.
    instructions: text("instructions").notNull().default(""),
    shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
    // Draw this many of the part's questions for each student. null: every question.
    poolSize: integer("pool_size"),
    ...timestamps,
  },
  (t) => [index("quiz_parts_quiz_id_position_idx").on(t.quizId, t.position)],
);

export const questions = pgTable(
  "questions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("q")),
    partId: text("part_id")
      .notNull()
      .references(() => quizParts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: questionType("type").notNull(),
    // Markdown.
    prompt: text("prompt").notNull(),
    topic: text("topic"),
    points: doublePrecision("points").notNull().default(1),
    gamePoints: gamePoints("game_points").notNull().default("standard"),
    // The type-specific data, including the answers. Its `type` matches the `type` column.
    body: jsonb("body").$type<QuestionBody>().notNull(),
    ...timestamps,
  },
  (t) => [index("questions_part_id_position_idx").on(t.partId, t.position)],
);

export const quizSessions = pgTable(
  "quiz_sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("session")),
    quizId: text("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    // Classes are web-app data for now; the students allowed in are in `session_students`.
    classId: text("class_id"),
    mode: sessionMode("mode").notNull().default("quiz"),
    pacing: sessionPacing("pacing").notNull().default("student"),
    status: sessionStatus("status").notNull().default("scheduled"),
    opensAt: timestamptz("opens_at"),
    closesAt: timestamptz("closes_at"),
    timeLimitMinutes: integer("time_limit_minutes"),
    // 1 means no retakes. null means unlimited retakes.
    attemptsAllowed: integer("attempts_allowed"),
    resultsRelease: resultsRelease("results_release").notNull().default("immediately"),
    resultsReleased: boolean("results_released").notNull().default(false),
    integrity: jsonb("integrity").$type<IntegritySettings>().notNull(),
    countInRecord: boolean("count_in_record").notNull().default(true),
    joinCode: text("join_code").unique(),
    startedAt: timestamptz("started_at"),
    endedAt: timestamptz("ended_at"),
    ...timestamps,
  },
  (t) => [index("quiz_sessions_quiz_id_idx").on(t.quizId)],
);

// The students allowed to take a session: a snapshot of the class roster when the session was created.
export const sessionStudents = pgTable(
  "session_students",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => quizSessions.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.studentId] }), index("session_students_student_id_idx").on(t.studentId)],
);

export const attempts = pgTable(
  "attempts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("attempt")),
    sessionId: text("session_id")
      .notNull()
      .references(() => quizSessions.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 1 for the first try, 2 for the first retake, and so on.
    attemptNumber: integer("attempt_number").notNull().default(1),
    // Seeds this attempt's shuffling, so the order survives a reload.
    seed: integer("seed")
      .notNull()
      .$defaultFn(() => crypto.getRandomValues(new Uint32Array(1))[0]! >>> 1),
    status: attemptStatus("status").notNull().default("in_progress"),
    startedAt: timestamptz("started_at").notNull().defaultNow(),
    submittedAt: timestamptz("submitted_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("attempts_session_student_number_unique").on(t.sessionId, t.studentId, t.attemptNumber),
    index("attempts_student_id_idx").on(t.studentId),
  ],
);

export const answers = pgTable(
  "answers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("answer")),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    // null: left blank.
    value: jsonb("value").$type<AnswerValue>(),
    correct: boolean("correct"),
    // Fraction correct, 0 to 1.
    autoScore: doublePrecision("auto_score"),
    // Points awarded by the teacher.
    manualScore: doublePrecision("manual_score"),
    feedback: text("feedback"),
    answeredAt: timestamptz("answered_at").notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("answers_attempt_id_question_id_unique").on(t.attemptId, t.questionId),
    index("answers_question_id_idx").on(t.questionId),
  ],
);

export const integrityEvents = pgTable(
  "integrity_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("event")),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    type: integrityEventType("type").notNull(),
    at: timestamptz("at").notNull(),
    // How long the student was away, for events that have a duration.
    durationMs: integer("duration_ms"),
  },
  (t) => [index("integrity_events_attempt_id_at_idx").on(t.attemptId, t.at)],
);

// Test results of a code or SQL answer.
export const codeResults = pgTable("code_results", {
  answerId: text("answer_id")
    .primaryKey()
    .references(() => answers.id, { onDelete: "cascade" }),
  results: jsonb("results").$type<CodeResults>().notNull(),
  ...timestamps,
});

// Edit history of a code or SQL answer, for the teacher's typing replay.
export const typingEdits = pgTable("typing_edits", {
  answerId: text("answer_id")
    .primaryKey()
    .references(() => answers.id, { onDelete: "cascade" }),
  edits: jsonb("edits").$type<TypingEdits>().notNull(),
  ...timestamps,
});

// Reusable questions teachers import into quizzes. owner_id null: the shared demo bank everyone can read.
export const bankQuestions = pgTable(
  "bank_questions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("bank")),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    // The whole question, answers included; its own `id` is the id it gets when imported into a quiz.
    question: jsonb("question").$type<Question>().notNull(),
    topic: text("topic"),
    ...timestamps,
  },
  (t) => [index("bank_questions_owner_id_idx").on(t.ownerId)],
);

export type QuizItem = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
export type QuizPartItem = typeof quizParts.$inferSelect;
export type NewQuizPart = typeof quizParts.$inferInsert;
export type QuestionItem = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type QuizSessionItem = typeof quizSessions.$inferSelect;
export type NewQuizSession = typeof quizSessions.$inferInsert;
export type AttemptItem = typeof attempts.$inferSelect;
export type NewAttempt = typeof attempts.$inferInsert;
export type AnswerItem = typeof answers.$inferSelect;
export type NewAnswer = typeof answers.$inferInsert;
export type NewBankQuestion = typeof bankQuestions.$inferInsert;
export type NewIntegrityEvent = typeof integrityEvents.$inferInsert;
