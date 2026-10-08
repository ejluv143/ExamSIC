// Class records (grade books) for teachers: the school's Excel class record, kept in Examora.
// Classes and rosters come from the API; records are mock data for now and become API calls later.
import "server-only";
import { requireTeacher } from "../auth/dal";
import { courseResult, type LinkedScores } from "../grading";
import { maxScore, questionScore } from "../scoring";
import type { Class, ClassRecord, GradingTerm, RecordCategory } from "../types";
import { termOf } from "../attendance";
import { applyAttendance, classMeetings } from "./attendance";
import { assessments, classRecords, submissions } from "./mock";
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
      items: [{ id: `${prefix}-${newId()}`, title: "Attendance", maxScore: 0, assessmentId: null, source: "attendance" }],
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

// Which term a quiz or exam belongs to: its grading period if it has one (prelim and midterm count toward
// the midterm, prefinal and final toward finals), otherwise the date it opens.
function termFor(a: (typeof assessments)[number]): GradingTerm {
  const period = a.header.period;
  if (period) return period === "prefinal" || period === "final" ? "final" : "midterm";
  return termOf((a.settings.opensAt ?? a.settings.closesAt ?? a.updatedAt).slice(0, 10));
}

// Every published quiz and exam for the class goes into its record by itself, so scores fill in without any
// setup: quizzes into the Quizzes category (or the first activity category), exams into the major exam.
// Skipped: ones marked not to count, and ones the teacher took out. Linked items keep the quiz's current total.
function autoLink(record: ClassRecord, classId: string): ClassRecord {
  const out = structuredClone(record);
  const linked = new Set<string>();
  for (const term of ["midterm", "final"] as const)
    for (const cat of out.terms[term])
      for (const item of cat.items)
        if (item.assessmentId) {
          linked.add(item.assessmentId);
          const a = assessments.find((x) => x.id === item.assessmentId);
          if (a) item.maxScore = maxScore(a.questions);
        }
  for (const a of assessments) {
    if (!a.classIds.includes(classId) || a.status === "draft" || a.settings.countInRecord === false) continue;
    if (linked.has(a.id) || out.unlinked?.includes(a.id)) continue;
    const cats = out.terms[termFor(a)];
    const cat =
      a.kind === "exam"
        ? cats.find((c) => c.isExam)
        : (cats.find((c) => !c.isExam && /quiz/i.test(c.name)) ?? cats.find((c) => !c.isExam));
    if (!cat) continue;
    cat.items.push({ id: `${cat.id}-x-${a.id}`, title: a.title, maxScore: maxScore(a.questions), assessmentId: a.id });
  }
  return out;
}

// The record as teachers and students see it: quizzes and exams linked in, attendance applied.
export function prepareRecord(stored: ClassRecord, cls: Pick<Class, "id" | "studentIds">) {
  return applyAttendance(autoLink(stored, cls.id), cls);
}

// Scores for items linked to an Examora quiz or exam: each student's latest submission. Teachers see
// them whether or not results are released; one with an essay still being graded stays empty.
function linkedScores(record: ClassRecord): { scores: LinkedScores; pending: Record<string, string[]> } {
  const scores: LinkedScores = {};
  const pending: Record<string, string[]> = {};
  for (const term of ["midterm", "final"] as const)
    for (const cat of record.terms[term])
      for (const item of cat.items) {
        if (!item.assessmentId) continue;
        const a = assessments.find((x) => x.id === item.assessmentId);
        if (!a) continue;
        scores[item.id] = {};
        pending[item.id] = [];
        const latest = new Map<string, (typeof submissions)[number]>();
        for (const s of submissions)
          if (s.assessmentId === a.id && s.submittedAt && (latest.get(s.studentId)?.submittedAt ?? "") < s.submittedAt)
            latest.set(s.studentId, s);
        for (const [studentId, s] of latest) {
          const points = a.questions.map((q) => questionScore(q, s));
          if (points.some((p) => p === null)) {
            scores[item.id][studentId] = null;
            pending[item.id].push(studentId);
          } else scores[item.id][studentId] = Math.round(points.reduce((n: number, p) => n + p!, 0) * 100) / 100;
        }
      }
  return { scores, pending };
}

export async function getClassRecord(classId: string) {
  await requireTeacher();
  const cls = await getClass(classId);
  if (!cls) return null;
  const stored = structuredClone(classRecords.find((r) => r.classId === classId) ?? blankRecord(classId));
  const roster = await getStudents(cls.studentIds);
  // Absences and attendance items come from attendance taken in Examora.
  const { record, scores: fromAttendance, taken: attendanceTaken } = prepareRecord(stored, cls);
  const { scores: fromExams, pending } = linkedScores(record);
  const linked = { ...fromExams, ...fromAttendance };
  // Quizzes and exams for this class that an item can be linked to, with their total points.
  const linkable = assessments
    .filter((a) => a.classIds.includes(classId) && a.status !== "draft")
    .map((a) => ({ id: a.id, title: a.title, kind: a.kind, maxScore: maxScore(a.questions) }));
  const meetings = classMeetings(classId);
  const attendance = {
    taken: meetings.filter((m) => m.takenAt).length,
    // A meeting today or earlier that still needs attendance.
    open: meetings.filter((m) => !m.takenAt).length,
  };
  return { cls, record, students: roster, linked, pending, linkable, attendanceTaken, attendance };
}

// Checks a record from the editor before keeping it: numbers in range, only this class's students.
export function cleanRecord(raw: ClassRecord, cls: Pick<Class, "id" | "studentIds">): ClassRecord | string {
  const classId = cls.id;
  if (raw?.classId !== classId) return "This class record doesn't belong to that class.";
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
        assessmentId: typeof i.assessmentId === "string" && assessments.some((a) => a.id === i.assessmentId) ? i.assessmentId : null,
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
    unlinked: (raw.unlinked ?? []).filter((id) => typeof id === "string" && assessments.some((a) => a.id === id)),
    signatories: {
      dean: String(raw.signatories?.dean ?? "").slice(0, 80),
      vpaa: String(raw.signatories?.vpaa ?? "").slice(0, 80),
      registrar: String(raw.signatories?.registrar ?? "").slice(0, 80),
    },
  };
}

export async function saveClassRecord(raw: ClassRecord, classId: string): Promise<string | null> {
  await requireTeacher();
  const cls = await getClass(classId);
  if (!cls) return "That class doesn't exist.";
  const record = cleanRecord(raw, cls);
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
    rows: (await getClasses()).map((cls) => {
      const record = classRecords.find((r) => r.classId === cls.id);
      const counts = { P: 0, F: 0, FA: 0, DR: 0 };
      if (record) {
        const { record: withAttendance, scores: fromAttendance } = prepareRecord(record, cls);
        const linked = { ...linkedScores(withAttendance).scores, ...fromAttendance };
        for (const sid of cls.studentIds) counts[courseResult(withAttendance, linked, sid).remark]++;
      }
      return { cls, hasRecord: !!record, total: cls.studentIds.length, counts };
    }),
  };
}
