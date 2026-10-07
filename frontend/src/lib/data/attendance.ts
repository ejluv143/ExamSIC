// Attendance for teachers: class meetings, taking attendance, and feeding it into the class record.
// Reads and writes mock data for now; becomes API calls later.
import "server-only";
import { attendanceStanding, tally, termOf } from "../attendance";
import { requireTeacher } from "../auth/dal";
import type { LinkedScores } from "../grading";
import type { AttendanceStatus, ClassMeeting, ClassRecord } from "../types";
import { classes, meetings, students } from "./mock";

const statuses = new Set<AttendanceStatus>(["present", "late", "absent", "excused"]);

export const classMeetings = (classId: string) =>
  meetings.filter((m) => m.classId === classId).sort((a, b) => b.date.localeCompare(a.date));

// Absences in the class record come from attendance once any has been taken, and items set to
// "From attendance" score meetings held minus absences. Returns the record (changed copy) and those scores.
export function applyAttendance(
  record: ClassRecord,
  classId: string,
): { record: ClassRecord; scores: LinkedScores; taken: boolean } {
  const list = classMeetings(classId);
  const scores: LinkedScores = {};
  if (!list.some((m) => m.takenAt)) return { record, scores, taken: false };
  const cls = classes.find((c) => c.id === classId);
  const out = structuredClone(record);
  for (const term of ["midterm", "final"] as const) {
    for (const sid of cls?.studentIds ?? []) out.absences[term][sid] = tally(list, sid, term).effectiveAbsences;
    for (const cat of out.terms[term])
      for (const item of cat.items) {
        if (item.source !== "attendance") continue;
        const held = list.filter((m) => m.takenAt && termOf(m.date) === term).length;
        item.maxScore = held;
        scores[item.id] = Object.fromEntries(
          (cls?.studentIds ?? []).map((sid) => [sid, Math.max(0, held - tally(list, sid, term).effectiveAbsences)]),
        );
      }
  }
  return { record: out, scores, taken: true };
}

export async function getAttendance(classId: string) {
  await requireTeacher();
  const cls = classes.find((c) => c.id === classId);
  if (!cls) return null;
  const list = classMeetings(classId);
  const roster = students.filter((s) => cls.studentIds.includes(s.id));
  return {
    cls,
    meetings: list,
    students: roster.map((s) => {
      const t = tally(list, s.id);
      return { student: s, tally: t, standing: attendanceStanding(t.effectiveAbsences) };
    }),
  };
}

// Today's meetings across the teacher's classes, so attendance is one tap from the dashboard.
export async function getTodaysMeetings() {
  await requireTeacher();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  return meetings
    .filter((m) => m.date === today)
    .map((m) => ({ meeting: m, cls: classes.find((c) => c.id === m.classId)! }))
    .filter((x) => x.cls);
}

export async function getMeeting(classId: string, meetingId: string) {
  await requireTeacher();
  const cls = classes.find((c) => c.id === classId);
  const meeting = meetings.find((m) => m.id === meetingId && m.classId === classId);
  if (!cls || !meeting) return null;
  return { cls, meeting, students: students.filter((s) => cls.studentIds.includes(s.id)) };
}

export async function saveMeeting(
  classId: string,
  meetingId: string,
  raw: Record<string, unknown>,
): Promise<string | null> {
  await requireTeacher();
  const cls = classes.find((c) => c.id === classId);
  const meeting = meetings.find((m) => m.id === meetingId && m.classId === classId);
  if (!cls || !meeting) return "That class meeting doesn't exist.";
  const records: ClassMeeting["records"] = {};
  for (const sid of cls.studentIds) {
    const v = raw?.[sid];
    // Only exceptions are stored; everyone else was present.
    if (typeof v === "string" && statuses.has(v as AttendanceStatus) && v !== "present") records[sid] = v as AttendanceStatus;
  }
  // TODO: PUT to the API. The mock keeps it in memory until the dev server restarts.
  meeting.records = records;
  meeting.takenAt = new Date().toISOString();
  return null;
}
