// Quizzes and their sessions. A quiz is reusable content (parts of questions); a session is one run of it,
// with its own mode, schedule and anti-cheat rules; an attempt is one student's go at a session.
// Timestamps are ISO 8601 strings, as the web app uses them today.
import { Schema } from "effect";
import { SubjectAreaSchema } from "./classes.ts";
import { CodeTestResult } from "./question.ts";

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
  subjectArea: Schema.NullOr(SubjectAreaSchema),
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

// Going back to earlier questions when they come one at a time: `free` goes anywhere, `marked_only` moves forward but
// may return to a question while it is marked for review, `forward_only` never goes back. A paper on one page is
// always `free`.
export const SessionNavigation = Schema.Literals(["free", "marked_only", "forward_only"]);
export type SessionNavigation = typeof SessionNavigation.Type;

// Anti-cheating rules for taking it online. A browser can't stop a second device, so these deter and log.
export const IntegritySettings = Schema.Struct({
  requireFullscreen: Schema.Boolean,
  // Log each time the student switches tabs or apps (Alt+Tab), or moves the mouse off the exam.
  trackFocus: Schema.Boolean,
  // Chrome and Edge only: refuse to start with a second monitor connected, and pause if one is added.
  blockSecondScreen: Schema.Boolean,
  // Each switch is independent and logs the attempts it blocks. Right-click menu (and long-press menus on phones).
  blockRightClick: Schema.Boolean,
  // Copy and cut, and selecting the question text.
  blockCopy: Schema.Boolean,
  // Paste by any method, and dragging text in.
  blockPaste: Schema.Boolean,
  // Printing and saving the page.
  blockPrint: Schema.Boolean,
  // Empty the clipboard when the student starts, so notes copied beforehand can't be pasted.
  clearClipboardOnStart: Schema.Boolean,
  // With blockPaste on: still allow paste in the code editor. Every paste is logged and shows in the typing replay.
  allowPasteInCode: Schema.Boolean,
  // Faint student name and number across the screen, so photos and screenshots can be traced.
  watermark: Schema.Boolean,
  // Submit automatically once the student has left the page or full screen this many times. null = never.
  autoSubmitAfter: Schema.NullOr(Schema.Int),
});
export type IntegritySettings = typeof IntegritySettings.Type;

// Mastery mode: self-paced practice. The settings the teacher chooses for a mastery session.
export const masteryMaxRetries = 10;

// What the teacher chooses for a mastery session.
export const MasterySettings = Schema.Struct({
  // Tries a student gets for each question (the first answer counts as a try).
  retryLimit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: masteryMaxRetries })),
  // Percent of the points the student should reach. null: no target.
  targetPercent: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  // After the last wrong try of a question, show the correct answer.
  showCorrectAnswer: Schema.Boolean,
});
export type MasterySettings = typeof MasterySettings.Type;

export const defaultMastery: MasterySettings = { retryLimit: 3, targetPercent: null, showCorrectAnswer: true };

// Exam mode only: what the teacher can set besides the anti-cheat switches.
export const ExamSettings = Schema.Struct({
  // Phones and tablets are refused.
  computersOnly: Schema.Boolean,
  // The honor pledge text students accept before starting.
  honorPledge: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2000)),
  // Minutes after the last check-in that the same device may resume without the teacher's approval.
  deviceGraceMinutes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 60 })),
});
export type ExamSettings = typeof ExamSettings.Type;

// Game mode only: what the teacher chooses besides the pacing.
export const gameMinSeconds = 5;
export const gameMaxSeconds = 300;
export const GameSettings = Schema.Struct({
  // Seconds a player gets for each question.
  questionSeconds: Schema.Int.check(Schema.isBetween({ minimum: gameMinSeconds, maximum: gameMaxSeconds })),
  // Show the standings after every question (the final standings always show).
  showLeaderboard: Schema.Boolean,
  // +100 points for every correct answer in a row after the first, up to +500.
  streakBonus: Schema.Boolean,
});
export type GameSettings = typeof GameSettings.Type;

export const defaultGame: GameSettings = { questionSeconds: 20, showLeaderboard: true, streakBonus: true };

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
  // Prevention (the server enforces these). One question at a time: the paper shows only the question the student
  // is on; `navigation` decides where they may go from there.
  oneQuestionAtATime: Schema.Boolean,
  // Seconds a student gets per question (only with oneQuestionAtATime). null: no limit per question. A question
  // whose time ran out can't be opened again.
  questionTimeLimitSeconds: Schema.NullOr(Schema.Int),
  navigation: SessionNavigation,
  // How many questions a student may have marked for review at once. 0: marking is off; null: no limit.
  maxMarked: Schema.NullOr(Schema.Int),
  // Minutes after the session opens that students may still start. null: no cutoff.
  lateJoinMinutes: Schema.NullOr(Schema.Int),
  // Students must type the room password to start. The password itself is only sent to the teacher.
  roomPasswordRequired: Schema.Boolean,
  // Only these networks may take it (CIDR or plain addresses). Empty: anywhere. Only the count leaves the teacher side.
  ipRestricted: Schema.Boolean,
  // Anyone with the key may play as a guest, giving only a name (games without a class only).
  allowGuests: Schema.Boolean,
  integrity: IntegritySettings,
  // Mastery sessions only (mode "mastery"); null otherwise.
  mastery: Schema.NullOr(MasterySettings),
  // Exam sessions only (mode "exam"); null otherwise.
  exam: Schema.NullOr(ExamSettings),
  // Game sessions only (mode "game"); null otherwise.
  game: Schema.NullOr(GameSettings),
  // Add the scores to the class's record automatically.
  countInRecord: Schema.Boolean,
  joinCode: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.String),
  endedAt: Schema.NullOr(Schema.String),
  // Set while the teacher has paused the session: the clocks are stopped and nobody can save.
  pausedAt: Schema.NullOr(Schema.String),
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
  // When the student accepted the honor pledge (exam sessions); null before, and in other modes.
  pledgeAcceptedAt: Schema.NullOr(Schema.String),
});
export type Attempt = typeof Attempt.Type;

// string[] holds one entry per blank (fill in the blank) or per listed item (enumeration).
export const AnswerValue = Schema.Union([Schema.String, Schema.Boolean, Schema.Array(Schema.String), Schema.Null]);
export type AnswerValue = typeof AnswerValue.Type;

// One try at a mastery question, kept for the teacher. `score`: fraction correct, null while it waits for the teacher.
export const MasteryTry = Schema.Struct({ value: AnswerValue, score: Schema.NullOr(Schema.Number), at: Schema.String });
export type MasteryTry = typeof MasteryTry.Type;

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
  // The student marked it for review (the mark they left it with, once submitted).
  markedForReview: Schema.Boolean,
  // Time the student spent on this question in ms (page visible, question on screen), as the browser measured it.
  timeSpentMs: Schema.optionalKey(Schema.Int),
  // Mastery: tries used so far, and each try (value, fraction correct). Missing in other modes.
  tries: Schema.optionalKey(Schema.Int),
  triesLog: Schema.optionalKey(Schema.Array(MasteryTry)),
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
  // Detection: with `durationMs` where it applies.
  "disconnected",
  "device_changed",
  "network_changed",
  "shared_device",
  "shared_network",
  "too_fast",
  "devtools_open",
  "split_screen",
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
