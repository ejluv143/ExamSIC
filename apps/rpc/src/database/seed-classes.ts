// The demo roster and the test teacher's classes, with attendance taken so far and their class records. The seeded
// quizzes and sessions (seed-quizzes.ts) are the test teacher's too and use these classes.
import { meetingDates, type AttendanceStatus, type ClassRecord } from "@examora/contract";
import type { ClassItem, classRecords, StudentItem } from "./schemas/index.ts";

const firstNames = [
  "Andrea", "Miguel", "Bea", "Carlo", "Denise", "Enzo", "Francine", "Gabriel",
  "Hannah", "Ivan", "Jasmine", "Kyle", "Lara", "Marco", "Nicole", "Paolo",
  "Rica", "Sean", "Trisha", "Vince", "Yna", "Zach", "Alyssa", "Bryan",
];
const lastNames = [
  "Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Mendoza", "Torres", "Flores",
  "Ramos", "Villanueva", "Aquino", "Castillo", "Navarro", "Domingo", "Lopez", "Rivera",
  "Morales", "Pascual", "Salazar", "Dela Cruz", "Gonzales", "Fernandez", "Soriano", "Valdez",
];

// Every roster entry has an account (u-s1 …), so each can take the seeded sessions.
export const userIdOf = (rosterId: string) => `u-${rosterId}`;

export const seedStudents: Omit<StudentItem, "createdAt" | "updatedAt">[] = firstNames.map((first, i) => {
  const last = lastNames[i]!;
  return {
    id: `s${i + 1}`,
    userId: userIdOf(`s${i + 1}`),
    studentNumber: `2023-${String(10241 + i * 37).padStart(5, "0")}`,
    firstName: first,
    lastName: last,
    email: `${first}.${last.replace(" ", "")}@student.sic.edu.ph`.toLowerCase(),
    // The demo first names alternate female and male.
    sex: i % 2 === 0 ? "F" : "M",
  };
});
const roster = (from: number, to: number) => seedStudents.slice(from, to).map((s) => s.id);

const term = "1st Sem 2026–2027";
const lastSyncedAt = "2026-10-06T07:30:00+08:00";
const classroom = (courseId: string) => ({ courseId, link: `https://classroom.google.com/c/${courseId}`, lastSyncedAt });

type SeedClass = Omit<ClassItem, "createdAt" | "updatedAt" | "archivedAt"> & { studentIds: string[] };

export const seedClasses: SeedClass[] = [
  {
    id: "c1",
    teacherId: "t-test",
    courseCode: "IT302",
    subjectArea: "programming",
    title: "Database Management Systems",
    section: "BSIT 3-A",
    term,
    schedule: "MWF 9:00–10:30 AM",
    room: "Lab 204",
    units: 3,
    joinCode: "DBMS3AX",
    classroom: classroom("683920114527"),
    studentIds: roster(0, 14),
  },
  {
    id: "c2",
    teacherId: "t-test",
    courseCode: "GEA101",
    subjectArea: "math",
    title: "Business Logic",
    section: "BSIT 1-B",
    term,
    schedule: "TTh 1:00–2:30 PM",
    room: "Room 312",
    units: 3,
    joinCode: "LOGIC1B",
    classroom: classroom("683920118841"),
    studentIds: roster(8, 24),
  },
  {
    id: "c3",
    teacherId: "t-test",
    courseCode: "ITPROF EL1",
    subjectArea: "programming",
    title: "Professional Elective 1",
    section: "BSIT 4-A",
    term,
    schedule: "Sat 8:00–11:00 AM",
    room: "Lab 101",
    units: 3,
    joinCode: "ELECT4A",
    classroom: classroom("683920120365"),
    studentIds: roster(16, 24),
  },
];

// The same numbers on every run.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// Roll calls for every meeting from the start of the semester up to yesterday; today's is left for the teacher.
export function seedMeetings(today: string) {
  const rand = seeded(21);
  return seedClasses.flatMap((cls) => {
    const dates = meetingDates(cls.schedule, today).reverse().filter((date) => date < today);
    return dates.map((date, n) => {
      const records: Record<string, AttendanceStatus> = {};
      cls.studentIds.forEach((sid, i) => {
        const r = rand();
        let status: AttendanceStatus = r < 0.03 ? "absent" : r < 0.09 ? "late" : r < 0.1 ? "excused" : "present";
        // A few students near the limits so the rules show: in IT302 the 3rd student has 4 absences (drop),
        // the 6th has 3 (one away), and the 9th was late 7 times (= 1 absence) plus absent once.
        if (cls.id === "c1") {
          if (i === 2) status = n % 5 === 1 ? "absent" : "present";
          if (i === 5) status = n % 8 === 2 ? "absent" : "present";
          if (i === 8) status = n % 3 === 0 && n < 21 ? "late" : n === 4 ? "absent" : "present";
        }
        if (status !== "present") records[sid] = status;
      });
      return { classId: cls.id, date, records, takenAt: new Date(`${date}T12:00:00+08:00`) };
    });
  });
}

type SeedItem = { title: string; maxScore: number; sessionId: null; source?: "attendance" };
type SeedCategory = { name: string; weight: number; isExam?: boolean; items: SeedItem[] };

// A class record laid out like the school's Excel sheet. It's mid-semester: midterm work is partly in, finals
// haven't started. Exams are quiz sessions, which the web app adds to the record by itself.
function buildRecord(classId: string, seed: number, midterm: SeedCategory[]): typeof classRecords.$inferInsert {
  const cls = seedClasses.find((c) => c.id === classId)!;
  const rand = seeded(seed);
  const terms: ClassRecord["terms"] = {
    midterm: midterm.map((c, i) => ({
      id: `${cls.id}-m${i}`,
      name: c.name,
      weight: c.weight,
      isExam: !!c.isExam,
      items: c.items.map((item, j) => ({ ...item, id: `${cls.id}-m${i}-${j}` })),
    })),
    // Same categories for finals (the major exam becomes the final exam), nothing recorded yet.
    final: midterm.map((c, i) => ({
      id: `${cls.id}-f${i}`,
      name: c.isExam ? "Final exam" : c.name,
      weight: c.weight,
      isExam: !!c.isExam,
      // Attendance carries on into finals; everything else is recorded as the term goes.
      items: c.items
        .filter((item) => item.source === "attendance")
        .map((item, j) => ({ ...item, id: `${cls.id}-f${i}-${j}` })),
    })),
  };
  // Each student has a steady "ability" so their scores look consistent across items.
  const ability = Object.fromEntries(cls.studentIds.map((id) => [id, 0.55 + rand() * 0.4]));
  const scores: Record<string, Record<string, number | null>> = {};
  for (const cat of terms.midterm)
    for (const item of cat.items) {
      if (item.sessionId || item.source) continue;
      scores[item.id] = Object.fromEntries(
        cls.studentIds.map((id) => [
          id,
          rand() < 0.04 ? null : Math.min(item.maxScore, Math.round(item.maxScore * (ability[id]! + (rand() - 0.5) * 0.2))),
        ]),
      );
    }
  return {
    classId: cls.id,
    terms,
    scores,
    // Taken over by attendance once any is taken, which the seed does.
    absences: {
      midterm: Object.fromEntries(cls.studentIds.map((id) => [id, Math.floor(rand() * rand() * 5)])),
      final: {},
    },
    dropped: [],
    unlinked: [],
    signatories: { dean: "Dr. Elena V. Cruz", vpaa: "Dr. Ramon T. Villanueva", registrar: "Ms. Grace L. Santos" },
    updatedBy: cls.teacherId,
  };
}

export const seedClassRecords = [
  buildRecord("c1", 7, [
    {
      name: "Quizzes",
      weight: 20,
      items: [
        { title: "Quiz 1: ER diagrams", maxScore: 20, sessionId: null },
        { title: "Quiz 3: Keys", maxScore: 15, sessionId: null },
      ],
    },
    {
      name: "Laboratory activities",
      weight: 25,
      items: [
        { title: "Lab 1: Creating tables", maxScore: 50, sessionId: null },
        { title: "Lab 2: SELECT and WHERE", maxScore: 50, sessionId: null },
      ],
    },
    {
      name: "Attendance / Participation",
      weight: 15,
      items: [
        { title: "Attendance", maxScore: 0, sessionId: null, source: "attendance" },
        { title: "Recitation", maxScore: 30, sessionId: null },
      ],
    },
    // The midterm exam (a quiz session in Examinus) is added to the record automatically.
    { name: "Midterm exam", weight: 40, isExam: true, items: [] },
  ]),
  buildRecord("c2", 11, [
    {
      name: "Quizzes",
      weight: 25,
      items: [
        { title: "Quiz 1: Propositions", maxScore: 20, sessionId: null },
        { title: "Quiz 2: Truth tables", maxScore: 20, sessionId: null },
      ],
    },
    {
      name: "Seatwork",
      weight: 25,
      items: [{ title: "Seatwork 1: Decision tables", maxScore: 30, sessionId: null }],
    },
    {
      name: "Attendance / Participation",
      weight: 10,
      items: [
        { title: "Attendance", maxScore: 0, sessionId: null, source: "attendance" },
        { title: "Recitation", maxScore: 20, sessionId: null },
      ],
    },
    // The prelim exam (a quiz session in Examinus) is added to the record automatically.
    { name: "Prelim exam", weight: 40, isExam: true, items: [] },
  ]),
];
