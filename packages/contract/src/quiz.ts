// Quizzes and their sessions. A quiz is reusable content (parts of questions); a session is one run of it,
// with its own mode, schedule and anti-cheat rules; an attempt is one student's go at a session.
// Timestamps are ISO 8601 strings, as the web app uses them today.
import { Schema } from "effect";
import { CodeTestResult } from "./question.ts";

export const subjectAreas = ["general", "english", "math", "science", "programming"] as const;
export const SubjectArea = Schema.Literals(subjectAreas);
export type SubjectArea = typeof SubjectArea.Type;

export const ExamPeriod = Schema.Literals(["prelim", "midterm", "prefinal", "final"]);
export type ExamPeriod = typeof ExamPeriod.Type;

export const Semester = Schema.Literals(["first", "second", "summer"]);
export type Semester = typeof Semester.Type;

export const PaperSize = Schema.Literals(["letter", "a4", "long"]);
export type PaperSize = typeof PaperSize.Type;

// Printed at the top of the paper, like a school's test-paper letterhead.
export const PaperHeader = Schema.Struct({
  // Image URLs or data: URLs from an upload. null hides that logo.
  schoolLogoUrl: Schema.NullOr(Schema.String),
  departmentLogoUrl: Schema.NullOr(Schema.String),
  school: Schema.String,
  // Line under the school name, e.g. "City of Malaybalay".
  schoolAddress: Schema.String,
  department: Schema.String,
  semester: Semester,
  // e.g. "2026-2027"
  academicYear: Schema.String,
  // null for quizzes that don't belong to a grading period.
  period: Schema.NullOr(ExamPeriod),
  // e.g. "October 5-9, 2026". Empty means it comes from the open and close times.
  dates: Schema.String,
});
export type PaperHeader = typeof PaperHeader.Type;

// The school's document-control footer printed on every page.
export const PaperFooter = Schema.Struct({
  documentNo: Schema.String,
  effectivityDate: Schema.String,
  revisionNo: Schema.String,
  member: Schema.String,
  motto: Schema.String,
});
export type PaperFooter = typeof PaperFooter.Type;

// Everything about the printed paper besides the letterhead and the parts.
export const PaperSettings = Schema.Struct({
  size: PaperSize,
  // Students answer on a separate bubble sheet; the test paper itself has no answer spaces.
  answerSheet: Schema.Boolean,
  instructor: Schema.String,
  // One per line; the first word is printed in red, e.g. "PRAY before you start."
  generalInstructions: Schema.Array(Schema.String),
  footer: PaperFooter,
});
export type PaperSettings = typeof PaperSettings.Type;

export const QuizSettings = Schema.Struct({
  shuffleQuestions: Schema.Boolean,
  shuffleChoices: Schema.Boolean,
  shuffleParts: Schema.Boolean,
});
export type QuizSettings = typeof QuizSettings.Type;

export const Quiz = Schema.Struct({
  id: Schema.String,
  ownerId: Schema.String,
  title: Schema.String,
  // Markdown.
  description: Schema.String,
  // The subject (e.g. "IT302") and its type, which decides the question types offered.
  subject: Schema.NullOr(Schema.String),
  subjectArea: Schema.NullOr(SubjectArea),
  header: PaperHeader,
  paper: PaperSettings,
  settings: QuizSettings,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type Quiz = typeof Quiz.Type;

export const QuizPart = Schema.Struct({
  id: Schema.String,
  quizId: Schema.String,
  position: Schema.Int,
  title: Schema.String,
  // Markdown.
  instructions: Schema.String,
  shuffleQuestions: Schema.Boolean,
  // Draw this many of the part's questions for each student. null: every question.
  poolSize: Schema.NullOr(Schema.Int),
});
export type QuizPart = typeof QuizPart.Type;

// --- Sessions ---

export const SessionMode = Schema.Literals(["quiz", "exam", "mastery", "game"]);
export type SessionMode = typeof SessionMode.Type;

// Who moves through the questions: the teacher for the whole room, or each student alone.
export const SessionPacing = Schema.Literals(["teacher", "student"]);
export type SessionPacing = typeof SessionPacing.Type;

export const SessionStatus = Schema.Literals(["scheduled", "lobby", "running", "ended"]);
export type SessionStatus = typeof SessionStatus.Type;

export const ResultsRelease = Schema.Literals(["immediately", "after_close", "manual"]);
export type ResultsRelease = typeof ResultsRelease.Type;

// Anti-cheating rules for taking it online. A browser can't stop a second device, so these deter and log.
export const IntegritySettings = Schema.Struct({
  requireFullscreen: Schema.Boolean,
  // Log each time the student switches tabs or apps (Alt+Tab), or moves the mouse off the exam.
  trackFocus: Schema.Boolean,
  // Chrome and Edge only: refuse to start with a second monitor connected, and pause if one is added.
  blockSecondScreen: Schema.Boolean,
  // Block copy, cut, paste, drag-and-drop, right-click and printing, and log attempts.
  blockCopyPaste: Schema.Boolean,
  // Faint student name and number across the screen, so photos and screenshots can be traced.
  watermark: Schema.Boolean,
  // Submit automatically once the student has left the page or full screen this many times. null = never.
  autoSubmitAfter: Schema.NullOr(Schema.Int),
});
export type IntegritySettings = typeof IntegritySettings.Type;

export const Session = Schema.Struct({
  id: Schema.String,
  quizId: Schema.String,
  classId: Schema.NullOr(Schema.String),
  mode: SessionMode,
  pacing: SessionPacing,
  status: SessionStatus,
  opensAt: Schema.NullOr(Schema.String),
  closesAt: Schema.NullOr(Schema.String),
  timeLimitMinutes: Schema.NullOr(Schema.Int),
  // Attempts a student gets: 1 means no retakes. null means unlimited retakes.
  attemptsAllowed: Schema.NullOr(Schema.Int),
  resultsRelease: ResultsRelease,
  // For resultsRelease "manual": whether the teacher has released scores to students.
  resultsReleased: Schema.Boolean,
  integrity: IntegritySettings,
  // Add the scores to the class's record automatically.
  countInRecord: Schema.Boolean,
  joinCode: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.String),
  endedAt: Schema.NullOr(Schema.String),
});
export type Session = typeof Session.Type;

// --- Attempts, answers and what was noticed while the student took it ---

export const AttemptStatus = Schema.Literals(["in_progress", "needs_grading", "graded"]);
export type AttemptStatus = typeof AttemptStatus.Type;

export const Attempt = Schema.Struct({
  id: Schema.String,
  sessionId: Schema.String,
  studentId: Schema.String,
  // Seeds this attempt's shuffling, so the order survives a reload.
  seed: Schema.Int,
  status: AttemptStatus,
  startedAt: Schema.String,
  submittedAt: Schema.NullOr(Schema.String),
});
export type Attempt = typeof Attempt.Type;

// string[] holds one entry per blank (fill in the blank) or per listed item (enumeration).
export const AnswerValue = Schema.Union([Schema.String, Schema.Boolean, Schema.Array(Schema.String), Schema.Null]);
export type AnswerValue = typeof AnswerValue.Type;

export const Answer = Schema.Struct({
  attemptId: Schema.String,
  questionId: Schema.String,
  value: AnswerValue,
  correct: Schema.NullOr(Schema.Boolean),
  // Automatic score as the fraction correct, 0 to 1. Multiplied by the question's points for totals.
  autoScore: Schema.NullOr(Schema.Number),
  // Teacher-awarded score in points: every essay, plus any automatic score the teacher changed.
  manualScore: Schema.NullOr(Schema.Number),
  feedback: Schema.NullOr(Schema.String),
  answeredAt: Schema.String,
});
export type Answer = typeof Answer.Type;

export const integrityEventTypes = [
  "left_page",
  "switched_app",
  "alt_tab",
  "mouse_left",
  "window_resize",
  "second_screen",
  "exit_fullscreen",
  "copy",
  "paste",
  "drop",
  "bulk_input",
  "right_click",
  "print",
  "screenshot",
  "auto_submitted",
  "late_submit",
] as const;
export const IntegrityEventType = Schema.Literals(integrityEventTypes);
export type IntegrityEventType = typeof IntegrityEventType.Type;

export const IntegrityEvent = Schema.Struct({
  type: IntegrityEventType,
  at: Schema.String,
  // How long the student was away, for events that have a duration.
  durationMs: Schema.optionalKey(Schema.Int),
});
export type IntegrityEvent = typeof IntegrityEvent.Type;

// Test results for one code or SQL answer. Missing until something has checked it.
export const CodeResults = Schema.Array(CodeTestResult);
export type CodeResults = typeof CodeResults.Type;

// One edit: ms since the attempt started, the replaced range [from, to) in the text as it was just
// before this edit, and the inserted text. Applying edits in order rebuilds the answer from the starter.
export const TypingEdit = Schema.Tuple([Schema.Int, Schema.Int, Schema.Int, Schema.String]);
export type TypingEdit = typeof TypingEdit.Type;

// Edit history of one code or SQL answer, for the teacher's typing replay.
export const TypingEdits = Schema.Array(TypingEdit);
export type TypingEdits = typeof TypingEdits.Type;
