// Class records (grade books), laid out like the school's Excel class record (CLASS-RECORD-2026.xlsm): the shapes,
// the grade math, how a record is filled in from quiz sessions and attendance, how the teacher edits it, the roster
// order, and a student's standing so far. Shared by the web app (teacher's record, grade sheet, attendance, student's
// standing) and the mobile app (standing).
import { attendanceStanding, tally, termOf, type ClassMeeting, type GradingTerm } from "./attendance.ts";
import type { ExamPeriod, SessionMode } from "./quiz.ts";

export type RecordItem = {
  id: string;
  title: string;
  maxScore: number;
  // Linked to a quiz session: scores fill in from students' submitted attempts.
  sessionId: string | null;
  // "attendance": the score is the term's attendance (meetings held minus absences); maxScore follows it.
  source?: "attendance";
};

export type RecordCategory = {
  id: string;
  name: string;
  // Percent of the term grade. ADW categories plus the major exam add up to 100.
  weight: number;
  // The major exam is listed apart from ADW (activities and daily work).
  isExam: boolean;
  items: RecordItem[];
};

// A class's grade book, laid out like the school's Excel class record.
export type ClassRecord = {
  classId: string;
  terms: Record<GradingTerm, RecordCategory[]>;
  // Typed-in scores by item id, then student id. Linked items aren't stored here.
  scores: Record<string, Record<string, number | null>>;
  absences: Record<GradingTerm, Record<string, number>>;
  // Students marked DR (dropped).
  dropped: string[];
  // Sessions the teacher took out of this record, so they aren't added back automatically.
  unlinked?: string[];
  signatories: { dean: string; vpaa: string; registrar: string };
};

// --- Grade math ---

// The TRANSMU sheet: lowest raw score for each grade. Like Excel's VLOOKUP(…, TRUE),
// a score takes the grade of the highest row it reaches, so 49.5 is still 3.25.
const transmutation: [number, number][] = [
  [97, 1],
  [93, 1.25],
  [88, 1.5],
  [83, 1.75],
  [77, 2],
  [71, 2.25],
  [65, 2.5],
  [58, 2.75],
  [50, 3],
  [45, 3.25],
  [39, 3.5],
  [33, 3.75],
  [27, 4],
  [21, 4.25],
  [15, 4.5],
  [9, 4.75],
  [0, 5],
];

export const transmutationTable = transmutation;

export function transmute(rawScore: number): number {
  return transmutation.find(([min]) => rawScore >= min)?.[1] ?? 5;
}

export const passingGrade = 3;
// More absences than this in a term (or in total) makes a failing grade "FA".
export const absenceLimit = 7;

export type Remark = "P" | "F" | "FA" | "DR";

export function remark(grade: number, absences: number, dropped: boolean): Remark {
  if (dropped) return "DR";
  if (grade <= passingGrade) return "P";
  return absences > absenceLimit ? "FA" : "F";
}

// Scores for linked items, by item id then student id (null = didn't submit).
export type LinkedScores = Record<string, Record<string, number | null>>;

export function itemScore(record: ClassRecord, linked: LinkedScores, itemId: string, studentId: string) {
  return (linked[itemId] ?? record.scores[itemId])?.[studentId] ?? null;
}

// Raw total over the category's max, scaled to its weight. As in the sheet, ADW categories never go
// above their weight (extra credit is cut off); the major exam isn't capped.
export function categoryResult(record: ClassRecord, linked: LinkedScores, cat: RecordCategory, studentId: string) {
  const max = cat.items.reduce((n, i) => n + i.maxScore, 0);
  const raw = cat.items.reduce((n, i) => n + (itemScore(record, linked, i.id, studentId) ?? 0), 0);
  const scaled = max > 0 ? (raw / max) * cat.weight : 0;
  return { raw, max, weighted: cat.isExam ? scaled : Math.min(cat.weight, scaled) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function termResult(record: ClassRecord, linked: LinkedScores, term: GradingTerm, studentId: string) {
  const cats = record.terms[term].map((c) => ({ cat: c, ...categoryResult(record, linked, c, studentId) }));
  const adw = cats.filter((c) => !c.cat.isExam).reduce((n, c) => n + c.weighted, 0);
  const exam = cats.filter((c) => c.cat.isExam).reduce((n, c) => n + c.weighted, 0);
  const rawScore = round2(adw + exam);
  return { categories: cats, adw: round2(adw), exam: round2(exam), rawScore, grade: transmute(rawScore) };
}

export function courseResult(record: ClassRecord, linked: LinkedScores, studentId: string) {
  const midterm = termResult(record, linked, "midterm", studentId);
  const final = termResult(record, linked, "final", studentId);
  const absences = {
    midterm: record.absences.midterm[studentId] ?? 0,
    final: record.absences.final[studentId] ?? 0,
  };
  const dropped = record.dropped.includes(studentId);
  const rawScore = round2((midterm.rawScore + final.rawScore) / 2);
  const grade = transmute(rawScore);
  return {
    midterm: { ...midterm, absences: absences.midterm, remark: remark(midterm.grade, absences.midterm, dropped) },
    final: {
      ...final,
      absences: absences.final,
      remark: remark(final.grade, absences.midterm + absences.final, dropped),
    },
    rawScore,
    grade,
    remark: remark(grade, absences.midterm + absences.final, dropped),
  };
}

export const termWeightTotal = (cats: RecordCategory[]) => cats.reduce((n, c) => n + c.weight, 0);

// --- Filling a record in ---

const newId = () => globalThis.crypto.randomUUID().slice(0, 8);

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

// The record before the teacher first saves it. Teachers and students both see this one, so quiz scores and attendance
// count toward the standing from the start.
export function blankRecord(classId: string): ClassRecord {
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
export type RecordSession = {
  readonly sessionId: string;
  readonly title: string;
  readonly mode: SessionMode;
  readonly maxScore: number;
  readonly period: ExamPeriod | null;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly countInRecord: boolean;
};

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

// Absences in the class record come from attendance once any has been taken, and items set to
// "From attendance" score meetings held minus absences. Returns the record (changed copy) and those scores.
export function applyAttendance(
  record: ClassRecord,
  cls: { readonly studentIds: readonly string[] },
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

// The record as teachers and students see it: sessions linked in, attendance applied.
export function prepareRecord(
  stored: ClassRecord,
  cls: { readonly studentIds: readonly string[] },
  sessions: readonly RecordSession[],
  meetings: readonly ClassMeeting[],
) {
  return applyAttendance(autoLink(stored, sessions), cls, meetings);
}

// --- A student's standing ---

// One of the class's sessions as the student's `attempt.myScores` describes it.
export type StandingSession = RecordSession & {
  readonly closed: boolean;
  readonly attempted: boolean;
  // The released, fully graded score; null while hidden or waiting for the teacher.
  readonly score: number | null;
};

// The student's grade in one subject so far, from the class record. Unlike the end-of-term sheet, work that hasn't
// happened yet doesn't count as zero: each term's raw score is scaled over the categories that have recorded work, so
// the grade shows where they stand now. `sessions` are the class's; `stored` is the record as the teacher saved it
// (null before the first save).
export function studentStanding(input: {
  cls: { readonly id: string; readonly studentIds: readonly string[] };
  studentId: string;
  stored: ClassRecord | null;
  sessions: readonly StandingSession[];
  meetings: readonly ClassMeeting[];
}) {
  const { cls, studentId: sid, sessions, meetings } = input;
  // The student's own attendance in this class, against the drop rule.
  const attendanceTally = tally(meetings, sid);
  const attendance = { ...attendanceTally, standing: attendanceStanding(attendanceTally.effectiveAbsences) };
  // Until the teacher saves the record, the default categories, as on the teacher's page.
  const stored = input.stored ?? blankRecord(cls.id);
  const { record, scores: attendanceScores } = prepareRecord(stored, cls, sessions, meetings);

  // Linked items: the latest attempt's score once results are out and essays are graded.
  const linked: LinkedScores = {};
  const recorded = new Set<string>();
  // Taken, but the score isn't out yet (results not released, or an essay waiting).
  const pending = new Set<string>();
  for (const term of ["midterm", "final"] as const)
    for (const cat of record.terms[term])
      for (const item of cat.items) {
        if (item.source === "attendance") {
          linked[item.id] = { [sid]: attendanceScores[item.id]?.[sid] ?? null };
          if (item.maxScore > 0) recorded.add(item.id);
        } else if (item.sessionId) {
          const m = sessions.find((x) => x.sessionId === item.sessionId);
          linked[item.id] = { [sid]: m?.score ?? null };
          // A missed session counts once it has ended; one still open or ungraded doesn't yet.
          if (m?.score != null || (m?.closed && !m.attempted)) recorded.add(item.id);
          else if (m?.attempted) pending.add(item.id);
        } else if (Object.values(record.scores[item.id] ?? {}).some((v) => v !== null)) {
          recorded.add(item.id);
        }
      }

  const termStanding = (term: GradingTerm) => {
    const absences = record.absences[term][sid] ?? 0;
    const categories = record.terms[term].map((cat) => {
      const counted = { ...cat, items: cat.items.filter((i) => recorded.has(i.id)) };
      const result = counted.items.length ? categoryResult(record, linked, counted, sid) : null;
      return {
        name: cat.name,
        weight: cat.weight,
        isExam: cat.isExam,
        items: cat.items.map((i) => ({
          title: i.title,
          maxScore: i.maxScore,
          recorded: recorded.has(i.id),
          pending: pending.has(i.id),
          score: (linked[i.id] ?? record.scores[i.id])?.[sid] ?? null,
        })),
        result: result && { raw: result.raw, max: result.max, weighted: round2(result.weighted) },
      };
    });
    const counted = categories.filter((c) => c.result);
    const weightSoFar = counted.reduce((n, c) => n + c.weight, 0);
    if (weightSoFar === 0) return { categories, absences, started: false as const };
    const rawScore = round2((counted.reduce((n, c) => n + c.result!.weighted, 0) / weightSoFar) * 100);
    return {
      categories,
      absences,
      started: true as const,
      // How much of the term's grade is already decided by recorded work.
      weightSoFar,
      rawScore,
      grade: transmute(rawScore),
    };
  };

  const terms = { midterm: termStanding("midterm"), final: termStanding("final") };
  const started = [terms.midterm, terms.final].filter((t) => t.started);
  const dropped = record.dropped.includes(sid);
  const absences = terms.midterm.absences + terms.final.absences;
  const rawScore = started.length ? round2(started.reduce((n, t) => n + t.rawScore, 0) / started.length) : null;
  return {
    attendance,
    terms,
    current:
      rawScore === null
        ? null
        : { rawScore, grade: transmute(rawScore), remark: remark(transmute(rawScore), absences, dropped), absences },
  };
}

// --- Teacher's record ---

// A session as the teacher's `session.classScores` describes it: its totals plus each student's latest submitted
// score (null while an essay is still being graded).
export type ScoredSession = RecordSession & { readonly scores: readonly { readonly studentId: string; readonly score: number | null }[] };

// The record as the teacher sees it, in one place for the record page, grade sheet and summary report: sessions linked
// in, attendance applied, and each linked item's scores. Teachers see scores whether or not results are released; a
// score still waiting on an essay stays empty and is listed in `pending` (item id → student ids).
export function teacherRecord(
  stored: ClassRecord,
  cls: { readonly studentIds: readonly string[] },
  sessions: readonly ScoredSession[],
  meetings: readonly ClassMeeting[],
) {
  const { record, scores: fromAttendance, taken: attendanceTaken } = prepareRecord(stored, cls, sessions, meetings);
  const fromSessions: LinkedScores = {};
  const pending: Record<string, string[]> = {};
  for (const term of ["midterm", "final"] as const)
    for (const cat of record.terms[term])
      for (const item of cat.items) {
        if (!item.sessionId) continue;
        const s = sessions.find((x) => x.sessionId === item.sessionId);
        if (!s) continue;
        fromSessions[item.id] = {};
        pending[item.id] = [];
        for (const { studentId, score } of s.scores) {
          fromSessions[item.id]![studentId] = score;
          if (score === null) pending[item.id]!.push(studentId);
        }
      }
  return { record, linked: { ...fromSessions, ...fromAttendance }, pending, attendanceTaken };
}

// --- Every class a student is in ---

// The student's standing in each of their classes. `meetings` and `records` are each class's, in the order of `classes`
// (`records` hold the stored record or null before the teacher's first save); `scores` are all of the student's
// sessions, across classes.
export function studentStandings<C extends { readonly id: string; readonly studentIds: readonly string[] }>(input: {
  classes: readonly C[];
  studentId: string;
  scores: readonly (StandingSession & { readonly classId: string | null })[];
  meetings: readonly (readonly ClassMeeting[])[];
  records: readonly (ClassRecord | null)[];
}) {
  return input.classes.map((cls, c) => ({
    class: cls,
    ...studentStanding({
      cls,
      studentId: input.studentId,
      stored: input.records[c] ?? null,
      sessions: input.scores.filter((m) => m.classId === cls.id),
      meetings: input.meetings[c] ?? [],
    }),
  }));
}

// --- Roster order ---

// Male students first, then female, then those who haven't given their sex (imported from Google Classroom; the student
// gives it when they first sign in), each by "Last, First" name, as the school's class record asks. Empty groups left out.
export function rosterGroups<S extends { readonly name: string; readonly sex: "M" | "F" | null }>(students: readonly S[]) {
  const byName = (a: S, b: S) => a.name.localeCompare(b.name);
  const group = (label: string, keep: (s: S) => boolean) => ({ label, list: students.filter(keep).sort(byName) });
  return [
    group("MALE STUDENTS", (s) => s.sex === "M"),
    group("FEMALE STUDENTS", (s) => s.sex === "F"),
    group("NOT YET SPECIFIED (from Google Classroom)", (s) => !s.sex),
  ].filter((g) => g.list.length > 0);
}

// --- Editing a record ---
//
// Every change the teacher makes goes through here and returns a changed copy. This is also the one place that keeps
// `unlinked` right: a session taken out of the record (item removed, category removed, item pointed elsewhere) is
// remembered so `autoLink` doesn't add it back, and linking it again forgets that.

function edited(record: ClassRecord, change: (copy: ClassRecord) => void): ClassRecord {
  const copy = structuredClone(record);
  change(copy);
  return copy;
}

const category = (r: ClassRecord, term: GradingTerm, catId: string) => r.terms[term].find((c) => c.id === catId);
const item = (r: ClassRecord, term: GradingTerm, catId: string, itemId: string) =>
  category(r, term, catId)?.items.find((i) => i.id === itemId);
const nonNegative = (raw: string) => Math.max(0, Number(raw) || 0);

const unlink = (r: ClassRecord, sessionId: string | null) => {
  if (sessionId) r.unlinked = [...new Set([...(r.unlinked ?? []), sessionId])];
};

// "Quizzes" → "Quiz", "Major Projects" → "Major Project", for naming new items.
export const singular = (name: string) =>
  /zzes$/i.test(name) ? name.slice(0, -3) : /ies$/i.test(name) ? `${name.slice(0, -3)}y` : name.replace(/(?<!s)s$/i, "");

// A typed-in score; blank or not a number clears it.
export function setScore(record: ClassRecord, itemId: string, studentId: string, raw: string): ClassRecord {
  return edited(record, (r) => {
    const n = raw.trim() === "" ? null : Math.max(0, Number(raw));
    r.scores[itemId] = { ...r.scores[itemId], [studentId]: n === null || Number.isNaN(n) ? null : n };
  });
}

export function setAbsences(record: ClassRecord, term: GradingTerm, studentId: string, raw: string): ClassRecord {
  return edited(record, (r) => {
    r.absences[term][studentId] = Math.max(0, Math.floor(Number(raw) || 0));
  });
}

export function setDropped(record: ClassRecord, studentId: string, dropped: boolean): ClassRecord {
  return edited(record, (r) => {
    r.dropped = dropped ? [...new Set([...r.dropped, studentId])] : r.dropped.filter((x) => x !== studentId);
  });
}

export function setSignatory(record: ClassRecord, key: keyof ClassRecord["signatories"], value: string): ClassRecord {
  return edited(record, (r) => {
    r.signatories[key] = value;
  });
}

export function renameCategory(record: ClassRecord, term: GradingTerm, catId: string, name: string): ClassRecord {
  return edited(record, (r) => {
    const cat = category(r, term, catId);
    if (cat) cat.name = name;
  });
}

export function setCategoryWeight(record: ClassRecord, term: GradingTerm, catId: string, raw: string): ClassRecord {
  return edited(record, (r) => {
    const cat = category(r, term, catId);
    if (cat) cat.weight = nonNegative(raw);
  });
}

// A new activities-and-daily-work category, kept ahead of the major exam.
export function addCategory(record: ClassRecord, term: GradingTerm): ClassRecord {
  return edited(record, (r) => {
    const exams = r.terms[term].filter((c) => c.isExam);
    r.terms[term] = [
      ...r.terms[term].filter((c) => !c.isExam),
      { id: `${term[0]}-${newId()}`, name: "New category", weight: 0, isExam: false, items: [] },
      ...exams,
    ];
  });
}

// The major exam stays. Sessions linked in the category are remembered as taken out.
export function removeCategory(record: ClassRecord, term: GradingTerm, catId: string): ClassRecord {
  return edited(record, (r) => {
    const cat = category(r, term, catId);
    if (!cat || cat.isExam) return;
    for (const i of cat.items) unlink(r, i.sessionId);
    r.terms[term] = r.terms[term].filter((c) => c.id !== catId);
  });
}

// A typed-in item at the end of the category. Without `maxScore`: 100 for the exam, 10 otherwise.
export function addItem(record: ClassRecord, term: GradingTerm, catId: string, maxScore?: number): ClassRecord {
  return edited(record, (r) => {
    const cat = category(r, term, catId);
    if (!cat) return;
    const n = cat.items.length;
    cat.items.push({
      id: `${cat.id}-${newId()}`,
      title: cat.isExam ? (n ? `${cat.name} part ${n + 1}` : cat.name) : `${singular(cat.name)} ${n + 1}`,
      maxScore: maxScore ?? (cat.isExam ? 100 : 10),
      sessionId: null,
    });
  });
}

// An item scored from the roll call, in the attendance category if there is one, else in a new one before the exam.
export function addAttendanceItem(record: ClassRecord, term: GradingTerm): ClassRecord {
  return edited(record, (r) => {
    const cats = r.terms[term];
    let cat = cats.find((c) => !c.isExam && /attend/i.test(c.name));
    if (!cat) {
      cat = { id: `${term[0]}-${newId()}`, name: "Attendance / Participation", weight: 0, isExam: false, items: [] };
      cats.splice(cats.filter((c) => !c.isExam).length, 0, cat);
    }
    cat.items.unshift({ id: `${cat.id}-${newId()}`, title: "Attendance", maxScore: 0, sessionId: null, source: "attendance" });
  });
}

export function renameItem(record: ClassRecord, term: GradingTerm, catId: string, itemId: string, title: string): ClassRecord {
  return edited(record, (r) => {
    const target = item(r, term, catId, itemId);
    if (target) target.title = title;
  });
}

export function setItemMax(record: ClassRecord, term: GradingTerm, catId: string, itemId: string, raw: string): ClassRecord {
  return edited(record, (r) => {
    const target = item(r, term, catId, itemId);
    if (target) target.maxScore = nonNegative(raw);
  });
}

// A session taken out on purpose isn't added back automatically.
export function removeItem(record: ClassRecord, term: GradingTerm, catId: string, itemId: string): ClassRecord {
  return edited(record, (r) => {
    const cat = category(r, term, catId);
    const target = cat?.items.find((i) => i.id === itemId);
    if (!cat || !target) return;
    unlink(r, target.sessionId);
    cat.items = cat.items.filter((i) => i.id !== itemId);
  });
}

// Where an item's scores come from.
export type ItemSource =
  | { kind: "typed" }
  | { kind: "attendance" }
  | { kind: "session"; id: string; title: string; maxScore: number };

// Points an item at a new source. A session it was linked to is taken out (so it isn't added back), the new one is put
// back in; a linked item follows the session's total and, if untitled, its title.
export function linkItem(record: ClassRecord, term: GradingTerm, catId: string, itemId: string, to: ItemSource): ClassRecord {
  return edited(record, (r) => {
    const target = item(r, term, catId, itemId);
    if (!target) return;
    const nextSession = to.kind === "session" ? to.id : null;
    if (target.sessionId && target.sessionId !== nextSession) unlink(r, target.sessionId);
    if (to.kind === "session") r.unlinked = (r.unlinked ?? []).filter((id) => id !== to.id);
    target.sessionId = nextSession;
    if (to.kind === "attendance") {
      target.source = "attendance";
      if (!target.title) target.title = "Attendance";
    } else delete target.source;
    if (to.kind === "session") {
      target.maxScore = to.maxScore;
      if (!target.title) target.title = to.title;
    }
  });
}
