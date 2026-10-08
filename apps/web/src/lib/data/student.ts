// Data for the signed-in student. Classes, quiz sessions, attempts and results come from the API, which never sends
// the answer key before results are released; only the class record is still mock data.
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { deviceCookie } from "../device";
import {
  computersOnlyMessage,
  deviceApprovalMessage,
  otherDeviceMessage,
  type AnswerValue,
  type IntegrityEvent,
  type MyScore,
  type Permissions,
  type Sex,
  type TypingEdits,
} from "@examora/contract";
import { requirePermission, requireStudent } from "../auth/dal";
import { categoryResult, remark, transmute, type LinkedScores } from "../grading";
import type { GradingTerm } from "../types";
import { classMeetings } from "./attendance";
import { prepareRecord } from "./class-records";
import { attendanceStanding, tally } from "../attendance";
import { apiCall, apiValue, messageOf, read, readOrNull, readOrRefusal, toClass, write } from "./api";
import { classRecords } from "./mock";

// Asked once per request, however many functions on the page need it.
const myEnrollment = cache(() => apiValue((api) => api["enrollment.mine"]()));

// The signed-in student, once their role is confirmed to grant `permissions`.
async function me(permissions: Permissions) {
  await requirePermission(permissions);
  const signedIn = await requireStudent();
  // Their roster entry, made the first time they join a class; the API names them by its id.
  const { student, classes } = await myEnrollment();
  const user = { ...signedIn, studentId: student?.id ?? "" };
  const myClasses = classes.map(toClass);
  return { user, student, myClasses };
}

export async function getMyClasses() {
  return (await me({ enrollment: ["read"] })).myClasses;
}

// Before their first class, joining also asks for their student number and sex (for the teacher's grade sheet).
export async function isFirstJoin() {
  return (await me({ enrollment: ["read"] })).student === null;
}

// Joins a class with its code. Returns an error message, or null when joined.
export async function joinClass(code: string, sex: Sex | null, studentNumber: string | null) {
  await requirePermission({ enrollment: ["create"] });
  return messageOf(await apiCall((api) => api["enrollment.join"]({ code, sex, studentNumber })));
}

export async function leaveClass(classId: string) {
  await requirePermission({ enrollment: ["delete"] });
  return messageOf(await apiCall((api) => api["enrollment.leave"]({ classId })));
}

// Every session the student is on the roster of, with their own progress.
export async function getMySessions() {
  await me({ enrollment: ["read"] });
  const items = await read((api) => api["attempt.mine"]());
  return [...items].sort((x, y) => (x.session.closesAt ?? "9999").localeCompare(y.session.closesAt ?? "9999"));
}

// What the student needs to take a session: the questions without answers (once an attempt is in progress),
// their saved answers, and when the attempt stops accepting answers.
export async function getPaperToTake(sessionId: string) {
  const { user, student, myClasses } = await me({ attempt: ["create"] });
  // The browser's device token (a cookie), so the API can tell whether this is the browser the attempt started on.
  const deviceId = (await cookies()).get(deviceCookie)?.value;
  const paper = await readOrRefusal((api) => api["attempt.paper"]({ sessionId, ...(deviceId ? { deviceId } : {}) }));
  if (!paper) return null;
  if ("refused" in paper) {
    const { tag, message } = paper.refused;
    // The teacher must approve this device first: the page waits and continues by itself.
    if (tag === "Conflict" && message === deviceApprovalMessage) return { waiting: message };
    // A phone or tablet on a computers-only exam.
    if (tag === "Forbidden" && message === computersOnlyMessage) return { blocked: message, computersOnly: true };
    // Another browser, or a network that isn't allowed: the page says so. Otherwise time ran out (or the
    // attempts are used up) and the result page says what happened.
    if (tag === "Forbidden" || message === otherDeviceMessage) return { blocked: message, computersOnly: false };
    redirect(`/student/assessments/${encodeURIComponent(sessionId)}/result`);
  }
  const studentNumber = student?.studentNumber ?? user.email;
  return {
    paper,
    classes: myClasses.filter((c) => c.id === paper.session.classId),
    studentId: user.studentId,
    studentName: user.name,
    studentNumber,
    // Printed faintly across the exam when the watermark is on.
    watermark: `${user.name} · ${studentNumber}`,
  };
}

// While the student waits for the teacher to approve their device: whether the paper can be opened now.
export async function checkDeviceApproval(sessionId: string): Promise<"allowed" | "waiting" | "computers_only" | "blocked"> {
  await me({ attempt: ["create"] });
  const deviceId = (await cookies()).get(deviceCookie)?.value;
  const paper = await readOrRefusal((api) => api["attempt.paper"]({ sessionId, ...(deviceId ? { deviceId } : {}) }));
  if (!paper || ("refused" in paper && paper.refused.tag !== "Conflict" && paper.refused.tag !== "Forbidden")) return "blocked";
  if (!("refused" in paper)) return "allowed";
  const { tag, message } = paper.refused;
  if (tag === "Conflict" && message === deviceApprovalMessage) return "waiting";
  if (tag === "Forbidden" && message === computersOnlyMessage) return "computers_only";
  return "blocked";
}

// The device check's connection test: one cheap authenticated call to the API.
export async function pingApi() {
  await me({ enrollment: ["read"] });
  await read((api) => api["attempt.mine"]());
}

// Called when the student presses Start. Starting again (another browser, cleared draft) keeps the first time.
// `pledgeAccepted` is sent for exam sessions, where the API requires it.
export async function startAttempt(sessionId: string, deviceId: string, roomPassword: string, pledgeAccepted?: boolean) {
  await me({ attempt: ["create"] });
  return write((api) =>
    api["attempt.start"]({
      sessionId,
      deviceId,
      ...(roomPassword ? { roomPassword } : {}),
      ...(pledgeAccepted ? { pledgeAccepted } : {}),
    }),
  );
}

export async function saveAnswer(
  attemptId: string,
  deviceId: string,
  questionId: string,
  value: AnswerValue,
  typing?: TypingEdits,
  timeSpentMs?: number,
) {
  await me({ attempt: ["update"] });
  return write((api) =>
    api["attempt.saveAnswer"]({
      attemptId,
      deviceId,
      questionId,
      value,
      ...(typing ? { typing } : {}),
      ...(timeSpentMs === undefined ? {} : { timeSpentMs }),
    }),
  );
}

// The Run button for languages the browser can't run: the API runs the visible tests only, a few times a minute.
export async function runSampleTests(attemptId: string, questionId: string, code: string) {
  await me({ attempt: ["update"] });
  return write((api) => api["attempt.runSampleTests"]({ attemptId, questionId, code }));
}

export async function recordEvents(attemptId: string, deviceId: string, events: readonly IntegrityEvent[]) {
  await me({ attempt: ["update"] });
  return write((api) => api["attempt.recordEvents"]({ attemptId, deviceId, events }));
}

// The check-in every ~15 seconds that lets the API notice a lost connection.
export async function heartbeat(attemptId: string, deviceId: string) {
  await me({ attempt: ["update"] });
  return write((api) => api["attempt.heartbeat"]({ attemptId, deviceId }));
}

// One question at a time: opens question `index` (0-based), as the session's navigation allows.
export async function goToQuestion(attemptId: string, deviceId: string, index: number) {
  await me({ attempt: ["update"] });
  return write((api) => api["attempt.goTo"]({ attemptId, deviceId, index }));
}

// Marks a question for review, or clears the mark.
export async function setMarked(attemptId: string, deviceId: string, questionId: string, marked: boolean) {
  await me({ attempt: ["update"] });
  return write((api) => api["attempt.setMarked"]({ attemptId, deviceId, questionId, marked }));
}

export async function submitAttempt(
  attemptId: string,
  deviceId: string,
  answers: Record<string, AnswerValue>,
  events: readonly IntegrityEvent[],
  typing: Record<string, TypingEdits>,
) {
  await me({ attempt: ["update"] });
  return write((api) => api["attempt.submit"]({ attemptId, deviceId, answers, events, typing }));
}

// Mastery mode: where the student stands and the question to answer now (the saved queue).
export async function masteryState(attemptId: string, deviceId: string) {
  await me({ attempt: ["read"] });
  return write((api) => api["attempt.masteryState"]({ attemptId, deviceId }));
}

// Mastery mode: grades one try at once.
export async function masteryAnswer(
  attemptId: string,
  deviceId: string,
  questionId: string,
  value: AnswerValue,
  timeSpentMs?: number,
) {
  await me({ attempt: ["update"] });
  return write((api) =>
    api["attempt.masteryAnswer"]({ attemptId, deviceId, questionId, value, ...(timeSpentMs === undefined ? {} : { timeSpentMs }) }),
  );
}

// The student's latest attempt. Points and the answer key only once results are released.
export async function getMyResult(sessionId: string) {
  const { myClasses } = await me({ attempt: ["read"] });
  const result = await readOrNull((api) => api["attempt.result"]({ sessionId }));
  if (!result) return null;
  return { ...result, classes: myClasses.filter((c) => c.id === result.session.classId) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// The student's grade in each subject so far, from the class record. Only their own scores leave here.
// Unlike the end-of-term sheet, work that hasn't happened yet doesn't count as zero: each term's raw
// score is scaled over the categories that have recorded work, so the grade shows where they stand now.
export async function getMyStanding() {
  const { user, myClasses } = await me({ enrollment: ["read"] });
  const sid = user.studentId;
  const scores: readonly MyScore[] = await read((api) => api["attempt.myScores"]());

  return myClasses.map((cls) => {
    // The student's own attendance in this class, against the drop rule.
    const attendanceTally = tally(classMeetings(cls.id), sid);
    const attendance = { ...attendanceTally, standing: attendanceStanding(attendanceTally.effectiveAbsences) };
    const stored = classRecords.find((r) => r.classId === cls.id);
    if (!stored) return { class: cls, terms: null, current: null, attendance };
    // Absences and attendance items come from attendance taken in Examinus.
    const sessions = scores.filter((m) => m.classId === cls.id);
    const { record, scores: attendanceScores } = prepareRecord(stored, cls, sessions);

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
      class: cls,
      attendance,
      terms,
      current:
        rawScore === null
          ? null
          : { rawScore, grade: transmute(rawScore), remark: remark(transmute(rawScore), absences, dropped), absences },
    };
  });
}
