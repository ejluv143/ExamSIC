import type { SubjectArea } from "@examinus/domain/roles";

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
