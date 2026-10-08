// Attendance for teachers: class meetings, taking attendance, and feeding it into the class record.
// Classes and rosters come from the API; meetings are mock data for now and become API calls later.
import "server-only";
import { attendanceStanding, tally, termOf } from "../attendance";
import { requireTeacher } from "../auth/dal";
import type { LinkedScores } from "../grading";
import type { AttendanceStatus, Class, ClassMeeting, ClassRecord } from "../types";
import { meetings } from "./mock";
import { getClass, getClasses, getStudents } from "./teacher";

const statuses = new Set<AttendanceStatus>(["present", "late", "absent", "excused"]);

export const classMeetings = (classId: string) =>
  meetings.filter((m) => m.classId === classId).sort((a, b) => b.date.localeCompare(a.date));

// Absences in the class record come from attendance once any has been taken, and items set to
// "From attendance" score meetings held minus absences. Returns the record (changed copy) and those scores.
export function applyAttendance(
  record: ClassRecord,
  cls: Pick<Class, "id" | "studentIds">,
): { record: ClassRecord; scores: LinkedScores; taken: boolean } {
  const list = classMeetings(cls.id);
  const scores: LinkedScores = {};
  if (!list.some((m) => m.takenAt)) return { record, scores, taken: false };
  const out = structuredClone(record);
  for (const term of ["midterm", "final"] as const) {
    for (const sid of cls.studentIds) out.absences[term][sid] = tally(list, sid, term).effectiveAbsences;
    for (const cat of out.terms[term])
      for (const item of cat.items) {
        if (item.source !== "attendance") continue;
        const held = list.filter((m) => m.takenAt && termOf(m.date) === term).length;
        item.maxScore = held;
        scores[item.id] = Object.fromEntries(
          cls.studentIds.map((sid) => [sid, Math.max(0, held - tally(list, sid, term).effectiveAbsences)]),
        );
      }
  }
  return { record: out, scores, taken: true };
}

export async function getAttendance(classId: string) {
  await requireTeacher();
  const cls = await getClass(classId);
  if (!cls) return null;
  const list = classMeetings(classId);
  const roster = await getStudents(cls.studentIds);
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
  const classes = await getClasses();
  return meetings
    .filter((m) => m.date === today)
    .flatMap((m) => {
      const cls = classes.find((c) => c.id === m.classId);
      return cls ? [{ meeting: m, cls }] : [];
    });
}

export async function getMeeting(classId: string, meetingId: string) {
  await requireTeacher();
  const cls = await getClass(classId);
  const meeting = meetings.find((m) => m.id === meetingId && m.classId === classId);
  if (!cls || !meeting) return null;
  return { cls, meeting, students: await getStudents(cls.studentIds) };
}

export async function saveMeeting(
  classId: string,
  meetingId: string,
  raw: Record<string, unknown>,
): Promise<string | null> {
  await requireTeacher();
  const cls = await getClass(classId);
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
