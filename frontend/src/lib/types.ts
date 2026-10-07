// Shapes shared by the teacher module. The API will return these same shapes.

export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "identification"
  | "fill_in_the_blank"
  | "enumeration"
  | "numeric"
  | "essay"
  | "code"
  | "sql";

type QuestionBase = {
  id: string;
  prompt: string;
  points: number;
  topic?: string;
};

export type Choice = { id: string; text: string };

export type MultipleChoiceQuestion = QuestionBase & {
  type: "multiple_choice";
  choices: Choice[];
  correctChoiceId: string;
};

export type TrueFalseQuestion = QuestionBase & {
  type: "true_false";
  answer: boolean;
};

export type IdentificationQuestion = QuestionBase & {
  type: "identification";
  // Any of these counts as correct; compared case-insensitively unless caseSensitive.
  acceptedAnswers: string[];
  caseSensitive: boolean;
};

// Blanks live in the prompt as [answer] or [answer|alternative]; see lib/blanks.ts.
// Each blank earns an equal share of the points.
export type FillInTheBlankQuestion = QuestionBase & {
  type: "fill_in_the_blank";
  caseSensitive: boolean;
};

// Students list items.length answers. Each item may hold alternatives as "1NF|First Normal Form".
// Each item earns an equal share of the points.
export type EnumerationQuestion = QuestionBase & {
  type: "enumeration";
  items: string[];
  orderMatters: boolean;
  caseSensitive: boolean;
};

// Students type a number (decimals, fractions like 3/4, mixed numbers like 1 1/2).
export type NumericQuestion = QuestionBase & {
  type: "numeric";
  answer: number;
  // How far off still counts as correct, e.g. 0.01. 0 means exact.
  tolerance: number;
  // Shown after the answer box, e.g. "cm". May be empty.
  unit: string;
};

export type EssayQuestion = QuestionBase & {
  type: "essay";
  rubric: string;
};

export type CodeLanguage = "python" | "java" | "cpp" | "c" | "javascript";

// The program reads `input` from standard input and must print `expectedOutput`.
// Hidden tests are never sent to students, so they can't hard-code the answers.
export type CodeTestCase = { id: string; input: string; expectedOutput: string; hidden: boolean };

// Students write a program; each passing test case earns an equal share of the points.
export type CodeQuestion = QuestionBase & {
  type: "code";
  language: CodeLanguage;
  starterCode: string;
  tests: CodeTestCase[];
  // Notes for the teacher's review (style, approach). Not shown to students.
  rubric: string;
};

// `expected` is filled in for SQL checks, where the expected rows come from running the answer query.
export type CodeTestResult = { testId: string; passed: boolean; output: string; error?: string; expected?: string };

// Students write a SELECT query against tables made by setupSql. It's right when it returns the same rows
// as answerSql. With hiddenDataSql, both run again after it adds rows, so a hard-coded answer fails.
export type SqlQuestion = QuestionBase & {
  type: "sql";
  // CREATE TABLE and INSERT statements. Shown to students.
  setupSql: string;
  // The teacher's query. Never sent to students.
  answerSql: string;
  // Extra statements (more INSERTs) for a second, hidden check. Empty: only the sample data is checked.
  hiddenDataSql: string;
  orderMatters: boolean;
  starterCode: string;
  rubric: string;
  // Filled in by the server for students: what the answer returns on the sample data.
  sampleResult?: { columns: string[]; rows: (string | number | null)[][] };
};

export type Question =
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | IdentificationQuestion
  | FillInTheBlankQuestion
  | EnumerationQuestion
  | NumericQuestion
  | EssayQuestion
  | CodeQuestion
  | SqlQuestion;

export type Class = {
  id: string;
  courseCode: string;
  title: string;
  section: string;
  term: string;
  schedule: string;
  room: string;
  units: number;
  // The Google Classroom course this class mirrors. Students and the roster come from there.
  classroom: {
    courseId: string;
    link: string;
    lastSyncedAt: string;
  };
  studentIds: string[];
};

export type Student = {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  // The school's grade sheet lists male and female students separately.
  sex: "M" | "F";
};

export type GradingTerm = "midterm" | "final";

export type RecordItem = {
  id: string;
  title: string;
  maxScore: number;
  // Linked to an Examora quiz or exam: scores fill in from students' submissions.
  assessmentId: string | null;
};

export type RecordCategory = {
  id: string;
  name: string;
  // Percent of the term grade. ADW categories plus the major exam add up to 100.
  weight: number;
  // The major exam is listed apart from ADW (activities and daily work).
  isExam: boolean;
  items: RecordItem[];
};

// A class's grade book, laid out like the school's Excel class record.
export type ClassRecord = {
  classId: string;
  terms: Record<GradingTerm, RecordCategory[]>;
  // Typed-in scores by item id, then student id. Linked items aren't stored here.
  scores: Record<string, Record<string, number | null>>;
  absences: Record<GradingTerm, Record<string, number>>;
  // Students marked DR (dropped).
  dropped: string[];
  signatories: { dean: string; vpaa: string; registrar: string };
};

export type AssessmentKind = "quiz" | "exam";
export type AssessmentStatus = "draft" | "scheduled" | "open" | "closed";
export type ResultsRelease = "immediately" | "after_close" | "manual";

export type AssessmentSettings = {
  timeLimitMinutes: number | null;
  opensAt: string | null;
  closesAt: string | null;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  attemptsAllowed: number;
  resultsRelease: ResultsRelease;
  integrity: IntegritySettings;
};

// Anti-cheating rules for taking it online. A browser can't stop a second device, so these deter and log.
export type IntegritySettings = {
  requireFullscreen: boolean;
  // Log each time the student switches tabs or apps (Alt+Tab), or moves the mouse off the exam.
  trackFocus: boolean;
  // Chrome and Edge only: refuse to start with a second monitor connected, and pause if one is added.
  blockSecondScreen: boolean;
  // Block copy, cut, paste, drag-and-drop, right-click and printing, and log attempts. Clears the
  // clipboard on start and flags large text that appears at once (auto-typer tools).
  blockCopyPaste: boolean;
  // Faint student name and number across the screen, so photos and screenshots can be traced.
  watermark: boolean;
  // Submit automatically once the student has left the page or full screen this many times. null = never.
  autoSubmitAfter: number | null;
};

export type ExamPeriod = "prelim" | "midterm" | "prefinal" | "final";
export type Semester = "first" | "second" | "summer";

// Printed at the top of the paper, like a school's test-paper letterhead.
export type PaperHeader = {
  // Image URLs or data: URLs from an upload. null hides that logo.
  schoolLogoUrl: string | null;
  departmentLogoUrl: string | null;
  school: string;
  // Line under the school name, e.g. "City of Malaybalay".
  schoolAddress: string;
  department: string;
  semester: Semester;
  // e.g. "2026-2027"
  academicYear: string;
  // null for quizzes that don't belong to a grading period.
  period: ExamPeriod | null;
  // e.g. "October 5-9, 2026". Empty means it comes from the open and close times.
  dates: string;
};

export type PaperSize = "letter" | "a4" | "long";

// The school's document-control footer printed on every page.
export type PaperFooter = {
  documentNo: string;
  effectivityDate: string;
  revisionNo: string;
  member: string;
  motto: string;
};

export type PartSettings = { title: string; instructions: string };

// Everything about the printed paper besides the letterhead.
export type PaperSettings = {
  size: PaperSize;
  // Students answer on a separate bubble sheet; the test paper itself has no answer spaces.
  answerSheet: boolean;
  instructor: string;
  // One per line; the first word is printed in red, e.g. "PRAY before you start."
  generalInstructions: string[];
  footer: PaperFooter;
  // Each question type is printed as one part. Empty values fall back to the defaults.
  parts: Partial<Record<QuestionType, PartSettings>>;
};

export type Assessment = {
  id: string;
  kind: AssessmentKind;
  title: string;
  header: PaperHeader;
  paper: PaperSettings;
  description: string;
  classIds: string[];
  status: AssessmentStatus;
  // For resultsRelease "manual": whether the teacher has released scores to students.
  resultsReleased: boolean;
  questions: Question[];
  settings: AssessmentSettings;
  updatedAt: string;
};

// string[] holds one entry per blank (fill in the blank) or per listed item (enumeration).
export type AnswerValue = string | boolean | string[] | null;

export type SubmissionStatus = "in_progress" | "needs_grading" | "graded";

export type Submission = {
  id: string;
  assessmentId: string;
  studentId: string;
  startedAt: string;
  submittedAt: string | null;
  status: SubmissionStatus;
  answers: Record<string, AnswerValue>;
  // Teacher-awarded points by question id: every essay, plus any automatic score the teacher changed.
  manualScores: Record<string, number>;
  feedback: Record<string, string>;
  // Test results for code and SQL questions, by question id. Missing until something has checked it.
  codeResults?: Record<string, CodeTestResult[]>;
  // What the anti-cheating checks noticed while the student took it, oldest first.
  integrityEvents: IntegrityEvent[];
};

export type IntegrityEventType =
  | "left_page"
  | "switched_app"
  | "alt_tab"
  | "mouse_left"
  | "window_resize"
  | "second_screen"
  | "exit_fullscreen"
  | "copy"
  | "paste"
  | "drop"
  | "bulk_input"
  | "right_click"
  | "print"
  | "screenshot"
  | "auto_submitted"
  | "late_submit";

export type IntegrityEvent = { type: IntegrityEventType; at: string };
