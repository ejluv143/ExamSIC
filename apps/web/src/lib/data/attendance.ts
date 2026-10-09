// Attendance for teachers: class meetings, taking attendance, and feeding it into the class record.
// Meetings and roll calls come from the API, which works meetings out from each class's schedule.
import "server-only";
import { attendanceStanding, tally, termOf } from "../attendance";
import { requireTeacher } from "../auth/dal";
import type { LinkedScores } from "../grading";
import type { AttendanceStatus, Class, ClassMeeting, ClassRecord } from "../types";
import { read, readOrNull, write } from "./api";
import { getClass, getClasses, getStudents } from "./teacher";

const statuses = new Set<AttendanceStatus>(["present", "late", "absent", "excused"]);

// A teacher's class's meetings so far, newest first.
export const classMeetings = (classId: string): Promise<readonly ClassMeeting[]> =>
  read((api) => api["attendance.meetings"]({ classId }));

// Absences in the class record come from attendance once any has been taken, and items set to
// "From attendance" score meetings held minus absences. Returns the record (changed copy) and those scores.
export function applyAttendance(
  record: ClassRecord,
  cls: Pick<Class, "id" | "studentIds">,
  list: readonly ClassMeeting[],
): { record: ClassRecord; scores: LinkedScores; taken: boolean } {
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
  const [list, roster] = await Promise.all([classMeetings(classId), getStudents(cls.studentIds)]);
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
  const [meetings, classes] = await Promise.all([read((api) => api["attendance.today"]()), getClasses()]);
  return meetings.flatMap((m) => {
    const cls = classes.find((c) => c.id === m.classId);
    return cls ? [{ meeting: m, cls }] : [];
  });
}

// One meeting (its id is its date) with the class roster.
export async function getMeeting(classId: string, meetingId: string) {
  await requireTeacher();
  const cls = await getClass(classId);
  if (!cls) return null;
  const list = await readOrNull((api) => api["attendance.meetings"]({ classId }));
  const meeting = list?.find((m) => m.id === meetingId);
  if (!meeting) return null;
  return { cls, meeting, students: await getStudents(cls.studentIds) };
}

// Saves a roll call. Returns an error message, or null when saved.
export async function saveMeeting(
  classId: string,
  meetingId: string,
  raw: Record<string, unknown>,
): Promise<string | null> {
  await requireTeacher();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingId)) return "That class meeting doesn't exist.";
  // Only exceptions are sent; everyone else was present. The API keeps only students on the roster.
  const records: Record<string, AttendanceStatus> = {};
  for (const [sid, v] of Object.entries(raw ?? {}))
    if (typeof v === "string" && statuses.has(v as AttendanceStatus) && v !== "present") records[sid] = v as AttendanceStatus;
  const outcome = await write((api) => api["attendance.save"]({ classId, date: meetingId, records }));
  return "error" in outcome ? outcome.error : null;
}
