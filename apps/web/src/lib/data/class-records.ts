// Class records (grade books) for teachers: the school's Excel class record, kept in Examinus.
// The record is stored by the API; scores linked to quiz sessions and attendance are filled in here when it's shown.
import "server-only";
import { Option, Schema } from "effect";
import { requireTeacher } from "../auth/dal";
import { courseResult, type LinkedScores } from "../grading";
import { ClassRecord as ClassRecordSchema, type ClassSessionScores } from "@examora/contract";
import type { Class, ClassMeeting, ClassRecord, GradingTerm, RecordCategory } from "../types";
import { termOf } from "../attendance";
import { applyAttendance, classMeetings } from "./attendance";
import { read, write } from "./api";
import { getClass, getClasses, getStudents } from "./teacher";

const newId = () => crypto.randomUUID().slice(0, 8);

// A new class starts with the categories most Learning Plans use: ADW adds up to 60, the major exam is 40.
function blankTerm(term: GradingTerm): RecordCategory[] {
  const prefix = term === "midterm" ? "m" : "f";
  return [
    { id: `${prefix}-${newId()}`, name: "Quizzes", weight: 20, isExam: false, items: [] },
    { id: `${prefix}-${newId()}`, name: "Assignments", weight: 15, isExam: false, items: [] },
    { id: `${prefix}-${newId()}`, name: "Major Projects", weight: 15, isExam: false, items: [] },
    {
      id: `${prefix}-${newId()}`,
      name: "Attendance / Participation",
      weight: 10,
      isExam: false,
      // Scored from the roll call: meetings held minus absences.
      items: [{ id: `${prefix}-${newId()}`, title: "Attendance", maxScore: 0, sessionId: null, source: "attendance" }],
    },
    { id: `${prefix}-${newId()}`, name: term === "midterm" ? "Midterm Exam" : "Final Exam", weight: 40, isExam: true, items: [] },
  ];
}

function blankRecord(classId: string): ClassRecord {
  return {
    classId,
    terms: { midterm: blankTerm("midterm"), final: blankTerm("final") },
    scores: {},
    absences: { midterm: {}, final: {} },
    dropped: [],
    signatories: { dean: "", vpaa: "", registrar: "" },
  };
}

// A session as the class record sees it. The teacher's `session.classScores` and the student's `attempt.myScores`
// both have these fields.
export type RecordSession = Pick<
  ClassSessionScores,
  "sessionId" | "title" | "mode" | "maxScore" | "period" | "opensAt" | "closesAt" | "countInRecord"
>;

const manilaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

// Which term a session belongs to: its grading period if it has one (prelim and midterm count toward
// the midterm, prefinal and final toward finals), otherwise the date it opens.
function termFor(s: RecordSession): GradingTerm {
  if (s.period) return s.period === "prefinal" || s.period === "final" ? "final" : "midterm";
  return termOf((s.opensAt ?? s.closesAt ?? manilaToday()).slice(0, 10));
}

// Every session of the class goes into its record by itself, so scores fill in without any setup: quizzes into
// the Quizzes category (or the first activity category), exams into the major exam.
// Skipped: ones marked not to count, and ones the teacher took out. Linked items keep the session's current total.
function autoLink(record: ClassRecord, sessions: readonly RecordSession[]): ClassRecord {
  const out = structuredClone(record);
  const linked = new Set<string>();
  for (const term of ["midterm", "final"] as const)
    for (const cat of out.terms[term])
      for (const item of cat.items)
        if (item.sessionId) {
          linked.add(item.sessionId);
          const s = sessions.find((x) => x.sessionId === item.sessionId);
          if (s) item.maxScore = s.maxScore;
        }
  for (const s of sessions) {
    if (!s.countInRecord || linked.has(s.sessionId) || out.unlinked?.includes(s.sessionId)) continue;
    const cats = out.terms[termFor(s)];
    const cat =
      s.mode === "exam"
        ? cats.find((c) => c.isExam)
        : (cats.find((c) => !c.isExam && /quiz/i.test(c.name)) ?? cats.find((c) => !c.isExam));
    if (!cat) continue;
    cat.items.push({ id: `${cat.id}-x-${s.sessionId}`, title: s.title, maxScore: s.maxScore, sessionId: s.sessionId });
  }
  return out;
}

// The record as teachers and students see it: sessions linked in, attendance applied.
export function prepareRecord(
  stored: ClassRecord,
  cls: Pick<Class, "id" | "studentIds">,
  sessions: readonly RecordSession[],
  meetings: readonly ClassMeeting[],
) {
  return applyAttendance(autoLink(stored, sessions), cls, meetings);
}

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
  const stored = (await getStoredRecord(classId)) ?? blankRecord(classId);
  const roster = await getStudents(cls.studentIds);
  // Absences and attendance items come from attendance taken in Examinus.
  const [sessions, meetings] = await Promise.all([classSessions(classId), classMeetings(classId)]);
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
