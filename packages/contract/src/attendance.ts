// Attendance: the school's rules, the semester calendar, and class meetings worked out from a class's schedule.
// Shared by the API (which stores roll calls) and the web app (which shows them).
import { Schema } from "effect";

export const attendanceStatusNames = ["present", "late", "absent", "excused"] as const;
export const AttendanceStatus = Schema.Literals(attendanceStatusNames);
export type AttendanceStatus = typeof AttendanceStatus.Type;

// A meeting date, YYYY-MM-DD in Manila time.
export const MeetingDate = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/));

// One class meeting and who came. `id` is the date. `records` lists only students who weren't present, by roster
// id. takenAt is null until the teacher takes attendance.
export const ClassMeeting = Schema.Struct({
  id: Schema.String,
  classId: Schema.String,
  date: MeetingDate,
  records: Schema.Record(Schema.String, AttendanceStatus),
  takenAt: Schema.NullOr(Schema.String),
});
export type ClassMeeting = typeof ClassMeeting.Type;

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

export type GradingTerm = "midterm" | "final";

export const termOf = (date: string): GradingTerm => (date <= academicCalendar.midtermEnd ? "midterm" : "final");

// Today's date in Manila, YYYY-MM-DD.
export const manilaDate = (now: Date = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

// "MWF 9:00–10:30 AM" → [1, 3, 5]; "TTh …" → [2, 4]; "Sat …" → [6]. 0 is Sunday.
export function meetingDays(schedule: string): number[] {
  const code = schedule.trim().split(/\s+/)[0] ?? "";
  const days: number[] = [];
  for (const [, token] of code.matchAll(/(Th|Sat|Sa|Su|M|T|W|F|S)/g)) {
    const day = ({ Su: 0, M: 1, T: 2, W: 3, Th: 4, F: 5, S: 6, Sa: 6, Sat: 6 } as Record<string, number>)[token!];
    if (day !== undefined && !days.includes(day)) days.push(day);
  }
  return days.sort();
}

// The class's meeting dates from the start of the semester up to `until` (today) or the end of the semester,
// newest first. Worked out on every call, so a new day's meeting appears on its own.
export function meetingDates(schedule: string, until: string): string[] {
  const days = meetingDays(schedule);
  if (days.length === 0) return [];
  const last = until < academicCalendar.semesterEnd ? until : academicCalendar.semesterEnd;
  const dates: string[] = [];
  for (let d = new Date(`${academicCalendar.semesterStart}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    if (date > last) break;
    if (days.includes(d.getUTCDay())) dates.push(date);
  }
  return dates.reverse();
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

export function tally(meetings: readonly ClassMeeting[], studentId: string, term?: GradingTerm): AttendanceTally {
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
