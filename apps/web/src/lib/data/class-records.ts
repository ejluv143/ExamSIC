// Class records (grade books) for teachers: the school's Excel class record, kept in Examora.
// The record itself is mock data for now; scores linked to quiz sessions come from the API.
import "server-only";
import { requireTeacher } from "../auth/dal";
import { courseResult, type LinkedScores } from "../grading";
import type { ClassSessionScores } from "@examora/contract";
import type { ClassRecord, GradingTerm, RecordCategory } from "../types";
import { termOf } from "../attendance";
import { applyAttendance, classMeetings } from "./attendance";
import { read } from "./api";
import { classes, classRecords, students } from "./mock";

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
export function prepareRecord(stored: ClassRecord, classId: string, sessions: readonly RecordSession[]) {
  return applyAttendance(autoLink(stored, sessions), classId);
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
  const cls = classes.find((c) => c.id === classId);
  if (!cls) return null;
  const stored = structuredClone(classRecords.find((r) => r.classId === classId) ?? blankRecord(classId));
  const roster = students.filter((s) => cls.studentIds.includes(s.id));
  // Absences and attendance items come from attendance taken in Examora.
  const sessions = await classSessions(classId);
  const { record, scores: fromAttendance, taken: attendanceTaken } = prepareRecord(stored, classId, sessions);
  const { scores: fromExams, pending } = linkedScores(record, sessions);
  const linked = { ...fromExams, ...fromAttendance };
  // Sessions for this class that an item can be linked to, with their total points.
  const linkable = sessions.map((s) => ({ id: s.sessionId, title: s.title, kind: s.mode, maxScore: s.maxScore }));
  const meetings = classMeetings(classId);
  const attendance = {
    taken: meetings.filter((m) => m.takenAt).length,
    // A meeting today or earlier that still needs attendance.
    open: meetings.filter((m) => !m.takenAt).length,
  };
  return { cls, record, students: roster, linked, pending, linkable, attendanceTaken, attendance };
}

// Checks a record from the editor before keeping it: numbers in range, only this class's students.
export function cleanRecord(raw: ClassRecord, classId: string, sessionIds: ReadonlySet<string>): ClassRecord | string {
  const cls = classes.find((c) => c.id === classId);
  if (!cls || raw?.classId !== classId) return "This class record doesn't belong to that class.";
  const enrolled = new Set(cls.studentIds);
  const num = (v: unknown, max = 10_000) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
  const terms = {} as ClassRecord["terms"];
  for (const term of ["midterm", "final"] as const) {
    const cats = raw.terms?.[term];
    if (!Array.isArray(cats) || cats.length > 20) return "Too many categories.";
    terms[term] = cats.map((c) => ({
      id: String(c.id).slice(0, 40),
      name: String(c.name ?? "").slice(0, 60) || "Category",
      weight: num(c.weight, 100) ?? 0,
      isExam: !!c.isExam,
      items: (Array.isArray(c.items) ? c.items : []).slice(0, 40).map((i) => ({
        id: String(i.id).slice(0, 40),
        title: String(i.title ?? "").slice(0, 80),
        maxScore: num(i.maxScore, 1000) ?? 0,
        sessionId: typeof i.sessionId === "string" && sessionIds.has(i.sessionId) ? i.sessionId : null,
        ...(i.source === "attendance" ? { source: "attendance" as const } : {}),
      })),
    }));
  }
  const scores: ClassRecord["scores"] = {};
  for (const [itemId, byStudent] of Object.entries(raw.scores ?? {}))
    scores[itemId] = Object.fromEntries(
      Object.entries(byStudent ?? {})
        .filter(([sid]) => enrolled.has(sid))
        .map(([sid, v]) => [sid, v === null ? null : num(v, 1000)]),
    );
  const absences = { midterm: {}, final: {} } as ClassRecord["absences"];
  for (const term of ["midterm", "final"] as const)
    for (const [sid, v] of Object.entries(raw.absences?.[term] ?? {}))
      if (enrolled.has(sid) && num(v, 200) !== null) absences[term][sid] = Math.floor(v as number);
  return {
    classId,
    terms,
    scores,
    absences,
    dropped: (raw.dropped ?? []).filter((sid) => enrolled.has(sid)),
    unlinked: (raw.unlinked ?? []).filter((id) => typeof id === "string" && sessionIds.has(id)),
    signatories: {
      dean: String(raw.signatories?.dean ?? "").slice(0, 80),
      vpaa: String(raw.signatories?.vpaa ?? "").slice(0, 80),
      registrar: String(raw.signatories?.registrar ?? "").slice(0, 80),
    },
  };
}

export async function saveClassRecord(raw: ClassRecord, classId: string): Promise<string | null> {
  await requireTeacher();
  const sessions = await classSessions(classId);
  const record = cleanRecord(raw, classId, new Set(sessions.map((s) => s.sessionId)));
  if (typeof record === "string") return record;
  // TODO: PUT to the API. The mock keeps it in memory until the dev server restarts.
  const i = classRecords.findIndex((r) => r.classId === classId);
  if (i === -1) classRecords.push(record);
  else classRecords[i] = record;
  return null;
}

// The Summary Report on Class Academic Performance: per class, how many passed, failed, FA and DR.
export async function getSummaryReport() {
  const user = await requireTeacher();
  return {
    faculty: user.name,
    rows: await Promise.all(
      classes.map(async (cls) => {
        const record = classRecords.find((r) => r.classId === cls.id);
        const counts = { P: 0, F: 0, FA: 0, DR: 0 };
        if (record) {
          const sessions = await classSessions(cls.id);
          const { record: withAttendance, scores: fromAttendance } = prepareRecord(record, cls.id, sessions);
          const linked = { ...linkedScores(withAttendance, sessions).scores, ...fromAttendance };
          for (const sid of cls.studentIds) counts[courseResult(withAttendance, linked, sid).remark]++;
        }
        return { cls, hasRecord: !!record, total: cls.studentIds.length, counts };
      }),
    ),
  };
}
