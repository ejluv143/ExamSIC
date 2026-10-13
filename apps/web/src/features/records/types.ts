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
