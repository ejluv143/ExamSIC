// Shapes shared by the teacher module. The API will return these same shapes.

export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "identification"
  | "fill_in_the_blank"
  | "enumeration"
  | "numeric"
  | "essay";

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

export type Question =
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | IdentificationQuestion
  | FillInTheBlankQuestion
  | EnumerationQuestion
  | NumericQuestion
  | EssayQuestion;

export type Class = {
  id: string;
  courseCode: string;
  title: string;
  section: string;
  term: string;
  schedule: string;
  room: string;
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
  // Exams only: log when a student leaves the exam tab.
  trackTabSwitches: boolean;
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
  // Teacher-awarded points for essay questions, keyed by question id.
  manualScores: Record<string, number>;
  feedback: Record<string, string>;
  tabSwitches: number;
};
