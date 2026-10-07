// Data for the signed-in student. Reads and writes mock data for now; becomes API calls later.
// Answer keys never leave this file except in results the teacher has released.
import { requirePermission, requireStudent } from "../auth/dal";
import type { Permissions } from "../auth/permissions";
import { categoryResult, remark, transmute, type LinkedScores } from "../grading";
import { cleanEvents } from "../integrity";
import { maxScore, questionScore } from "../scoring";
import type { AnswerValue, Assessment, GradingTerm, Question, Submission } from "../types";
import { assessments, classes, classRecords, students, submissions } from "./mock";

export type Availability = "upcoming" | "open" | "closed";

export function availability(a: Assessment, now = Date.now()): Availability {
  if (a.status === "closed") return "closed";
  if (a.settings.closesAt && now > Date.parse(a.settings.closesAt)) return "closed";
  if (a.settings.opensAt && now < Date.parse(a.settings.opensAt)) return "upcoming";
  return "open";
}

// Whether students may see their score and the answer key yet.
export function resultsVisible(a: Assessment, now = Date.now()): boolean {
  switch (a.settings.resultsRelease) {
    case "immediately":
      return true;
    case "after_close":
      return availability(a, now) === "closed";
    case "manual":
      return a.resultsReleased;
  }
}

// The same question with every answer removed, safe to send to the browser.
function withoutAnswers(q: Question): Question {
  switch (q.type) {
    case "multiple_choice":
      return { ...q, correctChoiceId: "" };
    case "true_false":
      return { ...q, answer: false };
    case "identification":
      return { ...q, acceptedAnswers: [] };
    case "fill_in_the_blank":
      return { ...q, prompt: q.prompt.replace(/\[[^\]]*\]/g, "[]") };
    case "enumeration":
      return { ...q, items: q.items.map(() => "") };
    case "numeric":
      return { ...q, answer: 0, tolerance: 0 };
    case "essay":
      return { ...q, rubric: "" };
  }
}

// The signed-in student, once their role is confirmed to grant `permissions`.
async function me(permissions: Permissions) {
  await requirePermission(permissions);
  const user = await requireStudent();
  const myClasses = classes.filter((c) => c.studentIds.includes(user.studentId));
  return { user, myClasses, classIds: new Set(myClasses.map((c) => c.id)) };
}

const mySubmissions = (studentId: string, assessmentId: string) =>
  submissions
    .filter((s) => s.studentId === studentId && s.assessmentId === assessmentId && s.submittedAt)
    .sort((x, y) => x.submittedAt!.localeCompare(y.submittedAt!));

function scoreOf(a: Assessment, s: Submission) {
  let score = 0;
  let pending = 0;
  for (const q of a.questions) {
    const points = questionScore(q, s);
    if (points === null) pending++;
    else score += points;
  }
  return { score: Math.round(score * 100) / 100, max: maxScore(a.questions), pendingEssays: pending };
}

export async function getMyClasses() {
  return (await me({ enrollment: ["read"] })).myClasses;
}

// Everything assigned to the student's classes, except drafts, with their own progress.
export async function getMyAssessments() {
  const { user, classIds } = await me({ enrollment: ["read"] });
  const now = Date.now();
  return assessments
    .filter((a) => a.status !== "draft" && a.classIds.some((id) => classIds.has(id)))
    .map((a) => {
      const done = mySubmissions(user.studentId, a.id);
      const last = done.at(-1);
      const visible = resultsVisible(a, now);
      return {
        id: a.id,
        kind: a.kind,
        title: a.title,
        classIds: a.classIds.filter((id) => classIds.has(id)),
        opensAt: a.settings.opensAt,
        closesAt: a.settings.closesAt,
        timeLimitMinutes: a.settings.timeLimitMinutes,
        questionCount: a.questions.length,
        totalPoints: maxScore(a.questions),
        availability: availability(a, now),
        attemptsUsed: done.length,
        attemptsAllowed: a.settings.attemptsAllowed,
        lastSubmittedAt: last?.submittedAt ?? null,
        result: last && visible ? scoreOf(a, last) : null,
      };
    })
    .sort((x, y) => (x.closesAt ?? "9999").localeCompare(y.closesAt ?? "9999"));
}

// What the student needs to take the exam: the questions without answers, and their attempt count.
export async function getAssessmentToTake(id: string) {
  const { user, myClasses, classIds } = await me({ attempt: ["create"] });
  const a = assessments.find((x) => x.id === id && x.status !== "draft" && x.classIds.some((c) => classIds.has(c)));
  if (!a) return null;
  return {
    assessment: { ...a, questions: a.questions.map(withoutAnswers) },
    classes: myClasses.filter((c) => a.classIds.includes(c.id)),
    availability: availability(a),
    attemptsUsed: mySubmissions(user.studentId, a.id).length,
    studentId: user.studentId,
    // Printed faintly across the exam when the watermark is on.
    watermark: `${user.name} · ${students.find((s) => s.id === user.studentId)?.studentNumber ?? user.email}`,
  };
}

// When each attempt started, by student, assessment and attempt number. The server's clock decides
// the time limit, so changing the computer's clock or the saved draft doesn't buy extra time.
// TODO: the API stores this with the attempt. The mock keeps it in memory.
const attemptStarts = new Map<string, string>();
const attemptKey = (studentId: string, assessmentId: string) =>
  `${studentId}:${assessmentId}:${mySubmissions(studentId, assessmentId).length + 1}`;

// Called when the student presses Start. Starting again (another browser, cleared draft) keeps the first time.
export async function startAttempt(assessmentId: string): Promise<string | null> {
  const { user, classIds } = await me({ attempt: ["create"] });
  const a = assessments.find((x) => x.id === assessmentId && x.classIds.some((c) => classIds.has(c)));
  if (!a || a.status === "draft" || availability(a) !== "open") return null;
  if (mySubmissions(user.studentId, a.id).length >= a.settings.attemptsAllowed) return null;
  const key = attemptKey(user.studentId, a.id);
  if (!attemptStarts.has(key)) attemptStarts.set(key, new Date().toISOString());
  return attemptStarts.get(key)!;
}

const maxTextLength = 5000;

// Keeps only answers to real questions, in the shape each question type expects.
function cleanAnswers(a: Assessment, raw: Record<string, unknown>): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const q of a.questions) {
    const v = raw[q.id];
    if (q.type === "true_false") out[q.id] = typeof v === "boolean" ? v : null;
    else if (q.type === "fill_in_the_blank" || q.type === "enumeration")
      out[q.id] = Array.isArray(v) ? v.slice(0, 50).map((x) => String(x ?? "").slice(0, maxTextLength)) : null;
    else out[q.id] = typeof v === "string" ? v.slice(0, maxTextLength) : null;
  }
  return out;
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

export async function submitAttempt(
  assessmentId: string,
  rawAnswers: Record<string, unknown>,
  startedAt: string,
  rawEvents: unknown,
): Promise<SubmitResult> {
  const { user, classIds } = await me({ attempt: ["create"] });
  const a = assessments.find((x) => x.id === assessmentId && x.classIds.some((c) => classIds.has(c)));
  if (!a || a.status === "draft") return { ok: false, error: "This assessment isn't available to you." };
  // The same attempt sent twice (a double click, or an old copy of the page) is already in; don't spend another attempt.
  if (mySubmissions(user.studentId, a.id).some((s) => s.startedAt === startedAt)) return { ok: true };

  // A minute of grace so an answer sent right at the deadline still counts.
  if (availability(a, Date.now() - 60_000) !== "open") return { ok: false, error: "This assessment is closed." };
  if (mySubmissions(user.studentId, a.id).length >= a.settings.attemptsAllowed)
    return { ok: false, error: "You've used all your attempts." };

  const answers = cleanAnswers(a, rawAnswers);
  const hasEssay = a.questions.some((q) => q.type === "essay");
  // Trust the server's start time; the browser's is only a fallback (e.g. after a server restart).
  const key = attemptKey(user.studentId, a.id);
  const started =
    attemptStarts.get(key) ?? (Number.isNaN(Date.parse(startedAt)) ? new Date().toISOString() : startedAt);
  attemptStarts.delete(key);
  const now = new Date();
  const integrityEvents = cleanEvents(rawEvents);
  // The client submits by itself when time runs out; a minute of slack covers a slow connection.
  const limit = a.settings.timeLimitMinutes;
  if (limit !== null && now.getTime() - Date.parse(started) > (limit + 1) * 60_000)
    integrityEvents.push({ type: "late_submit", at: now.toISOString() });
  // TODO: POST to the API. The mock keeps it in memory until the dev server restarts.
  submissions.push({
    id: `sub-${a.id}-${user.studentId}-${Date.now()}`,
    assessmentId: a.id,
    studentId: user.studentId,
    startedAt: started,
    submittedAt: now.toISOString(),
    status: hasEssay ? "needs_grading" : "graded",
    answers,
    manualScores: {},
    feedback: {},
    integrityEvents,
  });
  return { ok: true };
}

// The student's latest attempt. Points and the answer key only once results are released.
export async function getMyResult(assessmentId: string) {
  const { user, myClasses, classIds } = await me({ attempt: ["read"] });
  const a = assessments.find((x) => x.id === assessmentId && x.classIds.some((c) => classIds.has(c)));
  if (!a) return null;
  const done = mySubmissions(user.studentId, a.id);
  const last = done.at(-1);
  const visible = resultsVisible(a);
  return {
    assessment: {
      id: a.id,
      title: a.title,
      kind: a.kind,
      resultsRelease: a.settings.resultsRelease,
      attemptsAllowed: a.settings.attemptsAllowed,
      closesAt: a.settings.closesAt,
    },
    classes: myClasses.filter((c) => a.classIds.includes(c.id)),
    availability: availability(a),
    attemptsUsed: done.length,
    submittedAt: last?.submittedAt ?? null,
    visible,
    summary: last && visible ? scoreOf(a, last) : null,
    items:
      last && visible
        ? a.questions.map((q) => ({
            question: q,
            answer: last.answers[q.id] ?? null,
            points: questionScore(q, last),
            feedback: last.feedback[q.id] ?? "",
          }))
        : [],
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// The student's grade in each subject so far, from the class record. Only their own scores leave here.
// Unlike the end-of-term sheet, work that hasn't happened yet doesn't count as zero: each term's raw
// score is scaled over the categories that have recorded work, so the grade shows where they stand now.
export async function getMyStanding() {
  const { user, myClasses } = await me({ enrollment: ["read"] });
  const sid = user.studentId;

  return myClasses.map((cls) => {
    const record = classRecords.find((r) => r.classId === cls.id);
    if (!record) return { class: cls, terms: null, current: null };

    // Linked items: the latest attempt's score once results are out and essays are graded.
    const linked: LinkedScores = {};
    const recorded = new Set<string>();
    // Taken, but the score isn't out yet (results not released, or an essay waiting).
    const pending = new Set<string>();
    for (const term of ["midterm", "final"] as const)
      for (const cat of record.terms[term])
        for (const item of cat.items) {
          if (item.assessmentId) {
            const a = assessments.find((x) => x.id === item.assessmentId);
            const last = a && mySubmissions(sid, a.id).at(-1);
            const result = a && last && resultsVisible(a) ? scoreOf(a, last) : null;
            const score = result && result.pendingEssays === 0 ? result.score : null;
            linked[item.id] = { [sid]: score };
            // A missed exam counts once it has closed; one still open or ungraded doesn't yet.
            if (score !== null || (a && availability(a) === "closed" && !last)) recorded.add(item.id);
            else if (last) pending.add(item.id);
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
      class: cls,
      terms,
      current:
        rawScore === null
          ? null
          : { rawScore, grade: transmute(rawScore), remark: remark(transmute(rawScore), absences, dropped), absences },
    };
  });
}
