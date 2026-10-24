// Class records (grade books) for teachers: the school's Excel class record, kept in Examinus.
// The record is stored by the API; scores linked to quiz sessions and attendance are filled in here when it's shown.
// The record's shapes, grade math and how it is filled in live in `@examinus/domain/class-record`.
import "server-only";
import { Option, Schema } from "effect";
import { requireTeacher } from "@/lib/auth/dal";
import { ClassRecord as ClassRecordSchema } from "@examinus/contract/class-record";
import { type ClassSessionScores } from "@examinus/contract/session";
import { blankRecord, courseResult, prepareRecord, type ClassRecord, type LinkedScores } from "@examinus/domain/class-record";
import { classMeetings } from "@/features/attendance/data";
import { read, write } from "@/lib/api/helpers";
import { getClass, getClasses, getStudents } from "@/features/classes/data";

// Scores for items linked to a quiz session: each student's latest submitted attempt. Teachers see them
// whether or not results are released; one with an essay still being graded stays empty.
function linkedScores(
  record: ClassRecord,
  sessions: readonly ClassSessionScores[],
): { scores: LinkedScores; pending: Record<string, string[]> } {
  const scores: LinkedScores = {};
  const pending: Record<string, string[]> = {};
  for (const term of ["midterm", "final"] as const)
    for (const cat of record.terms[term])
      for (const item of cat.items) {
        if (!item.sessionId) continue;
        const s = sessions.find((x) => x.sessionId === item.sessionId);
        if (!s) continue;
        scores[item.id] = {};
        pending[item.id] = [];
        for (const { studentId, score } of s.scores) {
          scores[item.id][studentId] = score;
          if (score === null) pending[item.id].push(studentId);
        }
      }
  return { scores, pending };
}

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
  const { record, scores: fromAttendance, taken: attendanceTaken } = prepareRecord(stored, cls, sessions, meetings);
  const { scores: fromExams, pending } = linkedScores(record, sessions);
  const linked = { ...fromExams, ...fromAttendance };
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
          const { record: withAttendance, scores: fromAttendance } = prepareRecord(record, cls, sessions, meetings);
          const linked = { ...linkedScores(withAttendance, sessions).scores, ...fromAttendance };
          for (const sid of cls.studentIds) counts[courseResult(withAttendance, linked, sid).remark]++;
        }
        return { cls, hasRecord: !!record, total: cls.studentIds.length, counts };
      }),
    ),
  };
}
