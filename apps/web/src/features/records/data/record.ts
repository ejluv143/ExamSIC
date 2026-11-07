// Class records (grade books) for teachers: the school's Excel class record, kept in Examinus.
// The record is stored by the API; scores linked to quiz sessions and attendance are filled in here when it's shown.
// The record's shapes, grade math and how it is filled in live in `@examinus/domain/class-record`.
import "server-only";
import { Option, Schema } from "effect";
import { requireTeacher } from "@/lib/auth/dal";
import { ClassRecord as ClassRecordSchema } from "@examinus/contract/class-record";
import { type ClassSessionScores } from "@examinus/contract/session";
import { blankRecord, courseResult, setDropped, teacherRecord, type ClassRecord } from "@examinus/domain/class-record";
import { classMeetings } from "@/features/attendance/data";
import { read, write } from "@/lib/api/helpers";
import { getClass, getClasses, getStudents } from "@/features/classes/data";

// The teacher's sessions for a class with each student's score.
async function classSessions(classId: string): Promise<readonly ClassSessionScores[]> {
  return read((api) => api["session.classScores"]({ classId }));
}

export async function getClassRecord(classId: string) {
  await requireTeacher();
  const cls = await getClass(classId);
  if (!cls) return null;
  // Absences and attendance items come from attendance taken in Examinus.
  const [stored, roster, sessions, meetings] = await Promise.all([
    getStoredRecord(classId).then((r) => r ?? blankRecord(classId)),
    getStudents(cls.studentIds),
    classSessions(classId),
    classMeetings(classId),
  ]);
  const { record, linked, pending, attendanceTaken } = teacherRecord(stored, cls, sessions, meetings);
  // Sessions for this class that an item can be linked to, with their total points.
  const linkable = sessions.map((s) => ({ id: s.sessionId, title: s.title, kind: s.mode, maxScore: s.maxScore }));
  const attendance = {
    taken: meetings.filter((m) => m.takenAt).length,
    // A meeting today or earlier that still needs attendance.
    open: meetings.filter((m) => !m.takenAt).length,
  };
  return { cls, record, students: roster, linked, pending, linkable, attendanceTaken, attendance };
}

// The teacher's class record as saved, without linked scores or attendance; null before the first save.
// The API's copy is read-only, so this is a copy the caller may change.
export async function getStoredRecord(classId: string): Promise<ClassRecord | null> {
  const stored = await read((api) => api["classRecord.get"]({ classId }));
  return stored && (structuredClone(stored) as ClassRecord);
}

const decodeRecord = Schema.decodeUnknownOption(ClassRecordSchema);

// Saves the record from the editor. The API keeps only this class's students and sessions and clamps the numbers.
// Returns an error message, or null when saved.
export async function saveClassRecord(raw: ClassRecord, classId: string): Promise<string | null> {
  await requireTeacher();
  const record = decodeRecord(raw);
  if (Option.isNone(record)) return "That class record couldn't be read. Reload the page and try again.";
  if (record.value.classId !== classId) return "This class record doesn't belong to that class.";
  const outcome = await write((api) => api["classRecord.save"]({ record: record.value }));
  return "error" in outcome ? outcome.error : null;
}

// Marks a student as dropped (DR). Starts from what's stored (not the attendance-filled copy) so absences stay computed.
// Returns an error message, or null when saved.
export async function markStudentDropped(classId: string, studentId: string): Promise<string | null> {
  if (!(await getClass(classId))) return "That class doesn't exist.";
  const stored = (await getStoredRecord(classId)) ?? blankRecord(classId);
  return saveClassRecord(setDropped(stored, studentId, true), classId);
}

// The Summary Report on Class Academic Performance: per class, how many passed, failed, FA and DR.
export async function getSummaryReport() {
  const user = await requireTeacher();
  return {
    faculty: user.name,
    rows: await Promise.all(
      (await getClasses()).map(async (cls) => {
        const record = await getStoredRecord(cls.id);
        const counts = { P: 0, F: 0, FA: 0, DR: 0 };
        if (record) {
          const [sessions, meetings] = await Promise.all([classSessions(cls.id), classMeetings(cls.id)]);
          const { record: withAttendance, linked } = teacherRecord(record, cls, sessions, meetings);
          for (const sid of cls.studentIds) counts[courseResult(withAttendance, linked, sid).remark]++;
        }
        return { cls, hasRecord: !!record, total: cls.studentIds.length, counts };
      }),
    ),
  };
}
