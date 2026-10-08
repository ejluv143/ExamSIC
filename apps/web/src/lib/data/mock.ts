// Demo data for classes, rosters, class records and attendance, used until those move to the API. Only src/lib/data/ should import this file.
import type { AttendanceStatus, Class, ClassMeeting, ClassRecord, RecordItem, Student } from "../types";
import { academicCalendar, meetingDays } from "../attendance";

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

export const students: Student[] = firstNames.map((first, i) => {
  const last = lastNames[i];
  return {
    id: `s${i + 1}`,
    studentNumber: `2023-${String(10241 + i * 37).padStart(5, "0")}`,
    firstName: first,
    lastName: last,
    email: `${first}.${last.replace(" ", "")}@student.sic.edu.ph`.toLowerCase(),
    // The demo first names alternate female and male.
    sex: i % 2 === 0 ? "F" : "M",
  };
});

const ids = (from: number, to: number) =>
  students.slice(from, to).map((s) => s.id);

export const classes: Class[] = [
  {
    id: "c1",
    courseCode: "IT302",
    subjectArea: "programming",
    title: "Database Management Systems",
    section: "BSIT 3-A",
    term: "1st Sem 2026–2027",
    schedule: "MWF 9:00–10:30 AM",
    room: "Lab 204",
    units: 3,
    classroom: {
      courseId: "683920114527",
      link: "https://classroom.google.com/c/683920114527",
      lastSyncedAt: "2026-10-06T07:30:00+08:00",
    },
    studentIds: ids(0, 14),
  },
  {
    id: "c2",
    courseCode: "GEA101",
    subjectArea: "math",
    title: "Business Logic",
    section: "BSIT 1-B",
    term: "1st Sem 2026–2027",
    schedule: "TTh 1:00–2:30 PM",
    room: "Room 312",
    units: 3,
    classroom: {
      courseId: "683920118841",
      link: "https://classroom.google.com/c/683920118841",
      lastSyncedAt: "2026-10-06T07:30:00+08:00",
    },
    studentIds: ids(8, 24),
  },
  {
    id: "c3",
    courseCode: "ITPROF EL1",
    subjectArea: "programming",
    title: "Professional Elective 1",
    section: "BSIT 4-A",
    term: "1st Sem 2026–2027",
    schedule: "Sat 8:00–11:00 AM",
    room: "Lab 101",
    units: 3,
    classroom: {
      courseId: "683920120365",
      link: "https://classroom.google.com/c/683920120365",
      lastSyncedAt: "2026-10-06T07:30:00+08:00",
    },
    studentIds: ids(16, 24),
  },
];

// Deterministic "random" so the demo looks the same on every render.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// Class records (grade books), laid out like the school's Excel sheet. It's mid-semester: midterm
// work is partly in, finals haven't started. Linked items take their scores from quiz sessions.
function buildRecord(
  cls: Class,
  seed: number,
  midterm: { name: string; weight: number; isExam?: boolean; items: Omit<RecordItem, "id">[] }[],
): ClassRecord {
  const rand = seeded(seed);
  const terms = {
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
  const scores: ClassRecord["scores"] = {};
  for (const cat of terms.midterm)
    for (const item of cat.items) {
      if (item.sessionId || item.source) continue;
      scores[item.id] = Object.fromEntries(
        cls.studentIds.map((id) => [
          id,
          rand() < 0.04 ? null : Math.min(item.maxScore, Math.round(item.maxScore * (ability[id] + (rand() - 0.5) * 0.2))),
        ]),
      );
    }
  return {
    classId: cls.id,
    terms,
    scores,
    absences: {
      midterm: Object.fromEntries(cls.studentIds.map((id) => [id, Math.floor(rand() * rand() * 5)])),
      final: {},
    },
    dropped: [],
    signatories: { dean: "Dr. Elena V. Cruz", vpaa: "Dr. Ramon T. Villanueva", registrar: "Ms. Grace L. Santos" },
  };
}


export const classRecords: ClassRecord[] = [
  buildRecord(classes.find((c) => c.id === "c1")!, 7, [
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
    {
      name: "Midterm exam",
      weight: 40,
      isExam: true,
      // The midterm exam (a quiz session in Examora) is added to the record automatically.
      items: [],
    },
  ]),
  buildRecord(classes.find((c) => c.id === "c2")!, 11, [
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
    {
      name: "Prelim exam",
      weight: 40,
      isExam: true,
      // The prelim exam (a quiz session in Examora) is added to the record automatically.
      items: [],
    },
  ]),
];

// --- Attendance: every class meeting from the start of the semester up to today ---

const manilaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

function buildMeetings(): ClassMeeting[] {
  const today = manilaToday();
  const meetings: ClassMeeting[] = [];
  const rand = seeded(21);
  for (const cls of classes) {
    const days = meetingDays(cls.schedule);
    const dates: string[] = [];
    for (let d = new Date(`${academicCalendar.semesterStart}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
      const date = d.toISOString().slice(0, 10);
      if (date > today || date > academicCalendar.semesterEnd) break;
      if (days.includes(d.getUTCDay())) dates.push(date);
    }
    dates.forEach((date, n) => {
      const isToday = date === today;
      const records: Record<string, AttendanceStatus> = {};
      if (!isToday)
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
      meetings.push({
        id: `${cls.id}-${date}`,
        classId: cls.id,
        date,
        records,
        takenAt: isToday ? null : `${date}T12:00:00+08:00`,
      });
    });
  }
  return meetings;
}

export const meetings: ClassMeeting[] = buildMeetings();
