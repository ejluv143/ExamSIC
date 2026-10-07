// Attendance rules and math, shared by the teacher's and students' pages.
import type { AttendanceStatus, ClassMeeting, GradingTerm } from "./types";

// School policy. Late arrivals add up to absences; enough absences in the semester and the student is dropped.
export const attendancePolicy = {
  latesPerAbsence: 7,
  dropAtAbsences: 4,
};

// The semester's dates (Manila). Meetings up to midtermEnd count toward the midterm, the rest toward finals.
export const academicCalendar = {
  semesterStart: "2026-08-10",
  midtermEnd: "2026-10-10",
  semesterEnd: "2026-12-12",
};

export const termOf = (date: string): GradingTerm => (date <= academicCalendar.midtermEnd ? "midterm" : "final");

export const statusLabel: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};

// "MWF 9:00–10:30 AM" → [1, 3, 5]; "TTh …" → [2, 4]; "Sat …" → [6]. 0 is Sunday.
export function meetingDays(schedule: string): number[] {
  const code = schedule.trim().split(/\s+/)[0] ?? "";
  const days: number[] = [];
  for (const [, token] of code.matchAll(/(Th|Sat|Sa|Su|M|T|W|F|S)/g)) {
    const day = { Su: 0, M: 1, T: 2, W: 3, Th: 4, F: 5, S: 6, Sa: 6, Sat: 6 }[token];
    if (day !== undefined && !days.includes(day)) days.push(day);
  }
  return days.sort();
}

export type AttendanceTally = {
  present: number;
  late: number;
  absent: number;
  excused: number;
  // Meetings that were held (attendance taken).
  held: number;
  // Absences plus one for every 7 lates. Excused absences don't count.
  effectiveAbsences: number;
};

export function tally(meetings: ClassMeeting[], studentId: string, term?: GradingTerm): AttendanceTally {
  const t = { present: 0, late: 0, absent: 0, excused: 0, held: 0, effectiveAbsences: 0 };
  for (const m of meetings) {
    if (!m.takenAt || (term && termOf(m.date) !== term)) continue;
    t.held++;
    t[m.records[studentId] ?? "present"]++;
  }
  t.effectiveAbsences = t.absent + Math.floor(t.late / attendancePolicy.latesPerAbsence);
  return t;
}

// "ok", "warning" (one absence away from being dropped) or "drop" (reached the limit).
export function attendanceStanding(effectiveAbsences: number): "ok" | "warning" | "drop" {
  if (effectiveAbsences >= attendancePolicy.dropAtAbsences) return "drop";
  if (effectiveAbsences >= attendancePolicy.dropAtAbsences - 1) return "warning";
  return "ok";
}
