import type { SessionStatus, SubjectArea } from "@examora/contract";

// Shapes for what the web app still owns: classes, the roster and the class record. Quizzes, sessions,
// questions and attempts come from @examora/contract.

export type Class = {
  id: string;
  courseCode: string;
  title: string;
  // Decides which question types its exams offer. Guessed from the course code and title when missing.
  subjectArea?: SubjectArea;
  section: string;
  term: string;
  schedule: string;
  room: string;
  units: number;
  // The Google Classroom course this class mirrors, when it was imported from there.
  classroom: {
    courseId: string;
    link: string;
    lastSyncedAt: string;
  } | null;
  studentIds: string[];
  // What students enter to join; only its teacher sees it.
  joinCode?: string;
};

export type Student = {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  // The school's grade sheet lists male and female students separately. Null for a student imported from Google
  // Classroom until they sign in and give it (their studentNumber is "" until then too).
  sex: "M" | "F" | null;
};

export type GradingTerm = "midterm" | "final";

export type RecordItem = {
  id: string;
  title: string;
  maxScore: number;
  // Linked to a quiz session: scores fill in from students' submitted attempts.
  sessionId: string | null;
  // "attendance": the score is the term's attendance (meetings held minus absences); maxScore follows it.
  source?: "attendance";
};

// Class meetings come from the API (@examora/contract): worked out from the class's schedule, with the roll calls
// teachers took. A meeting's id is its date.
export type { AttendanceStatus, ClassMeeting } from "@examora/contract";

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
  // Sessions the teacher took out of this record, so they aren't added back automatically.
  unlinked?: string[];
  signatories: { dean: string; vpaa: string; registrar: string };
};

// How the printed paper is titled: "Quiz", or "<period> Examination" for exams.
export type PaperKind = "quiz" | "exam";

// What a quiz shows in the teacher's lists: its latest session's status, or "draft" when it has no session.
export type QuizStatus = SessionStatus | "draft";
