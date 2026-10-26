import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refusalScreen } from "@examinus/copy/errors";
import { deviceCookie } from "@/lib/device";
import type { AnswerValue, IntegrityEvent, TypingEdits } from "@examinus/domain/quiz";
import { can, type Permissions } from "@examinus/domain/permissions";
import { homeFor, roleOf } from "@examinus/domain/roles";
import { getCurrentUser, requirePermission } from "@/lib/auth/dal";
import { read, readOrNull, readOrRefusal, write } from "@/lib/api/helpers";
import { me } from "@/features/classes/data";
import { attemptHrefs, type PlayerArea } from "./hrefs";

// Who is taking it: a student with their roster entry and classes, or a guest (an anonymous account from /join),
// who has neither and only the attempt permissions. `area` is where their pages live.
async function player(permissions: Permissions) {
  const user = await getCurrentUser();
  if (user.role !== "guest") return { ...(await me(permissions)), area: "student" as PlayerArea };
  if (!can(user, permissions)) redirect(homeFor(roleOf(user)));
  return { user: { ...user, studentId: "" }, student: null, myClasses: [], area: "guest" as PlayerArea };
}

// Every session the student is on the roster of, with their own progress.
export async function getMySessions() {
  await me({ enrollment: ["read"] });
  const items = await read((api) => api["attempt.mine"]());
  return [...items].sort((x, y) => (x.session.closesAt ?? "9999").localeCompare(y.session.closesAt ?? "9999"));
}

// What the student needs to take a session: the questions without answers (once an attempt is in progress),
// their saved answers, and when the attempt stops accepting answers. Once per request: the page and its metadata
// both ask, and every "Next question" refreshes the page.
export const getPaperToTake = cache(async (sessionId: string) => {
  const { user, student, myClasses, area } = await player({ attempt: ["create"] });
  const hrefs = attemptHrefs(area, sessionId);
  // The browser's device token (a cookie), so the API can tell whether this is the browser the attempt started on.
  const deviceId = (await cookies()).get(deviceCookie)?.value;
  const paper = await readOrRefusal((api) => api["attempt.paper"]({ sessionId, ...(deviceId ? { deviceId } : {}) }));
  if (!paper) return null;
  if ("refused" in paper) {
    const { tag, message } = paper.refused;
    // A game has its own screen.
    if (tag === "PlayInGame") redirect(hrefs.game);
    // The teacher must approve this device first (the page waits and continues by itself); a phone or tablet on a
    // computers-only exam; another browser, a network that isn't allowed, or an outdated desktop app: the page says
    // so. Otherwise time ran out (or the attempts are used up) and the result page says what happened.
    const screen = refusalScreen(tag);
    if (screen === "waiting") return { waiting: message };
    if (screen) return { blocked: message, computersOnly: screen === "computers_only" };
    redirect(hrefs.result);
  }
  // A guest has no student number; the watermark and the exam gate show them as a guest.
  const studentNumber = student?.studentNumber ?? (area === "guest" ? "Guest" : user.email);
  return {
    paper,
    classes: myClasses.filter((c) => c.id === paper.session.classId),
    studentId: user.studentId,
    studentName: user.name,
    studentNumber,
    // Printed faintly across the exam when the watermark is on.
    watermark: `${user.name} · ${studentNumber}`,
  };
});

// While the student waits for the teacher to approve their device: whether the paper can be opened now.
export async function checkDeviceApproval(sessionId: string): Promise<"allowed" | "waiting" | "computers_only" | "blocked"> {
  await player({ attempt: ["create"] });
  const deviceId = (await cookies()).get(deviceCookie)?.value;
  const paper = await readOrRefusal((api) => api["attempt.paper"]({ sessionId, ...(deviceId ? { deviceId } : {}) }));
  if (!paper) return "blocked";
  if (!("refused" in paper)) return "allowed";
  return refusalScreen(paper.refused.tag) ?? "blocked";
}

// The device check's connection test: one cheap authenticated call to the API.
export async function pingApi() {
  await player({ attempt: ["read"] });
  await read((api) => api["attempt.mine"]());
}

// Called when the student presses Start. Starting again (another browser, cleared draft) keeps the first time.
// `pledgeAccepted` is sent for exam sessions, where the API requires it.
export async function startAttempt(sessionId: string, deviceId: string, roomPassword: string, pledgeAccepted?: boolean) {
  await player({ attempt: ["create"] });
  return write((api) =>
    api["attempt.start"]({
      sessionId,
      deviceId,
      ...(roomPassword ? { roomPassword } : {}),
      ...(pledgeAccepted ? { pledgeAccepted } : {}),
    }),
  );
}

// Examinus Desktop: checks the exit password a student (or their teacher) typed to close the app mid-attempt.
export async function verifyExitPassword(sessionId: string, password: string) {
  await player({ attempt: ["update"] });
  return write((api) => api["attempt.verifyExitPassword"]({ sessionId, password }));
}

export async function saveAnswer(
  attemptId: string,
  deviceId: string,
  questionId: string,
  value: AnswerValue,
  typing?: TypingEdits,
  timeSpentMs?: number,
) {
  await player({ attempt: ["update"] });
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
  await player({ attempt: ["update"] });
  return write((api) => api["attempt.runSampleTests"]({ attemptId, questionId, code }));
}

export async function recordEvents(attemptId: string, deviceId: string, events: readonly IntegrityEvent[]) {
  await player({ attempt: ["update"] });
  return write((api) => api["attempt.recordEvents"]({ attemptId, deviceId, events }));
}

// The check-in every ~15 seconds that lets the API notice a lost connection.
export async function heartbeat(attemptId: string, deviceId: string) {
  await player({ attempt: ["update"] });
  return write((api) => api["attempt.heartbeat"]({ attemptId, deviceId }));
}

// One question at a time: opens question `index` (0-based), as the session's navigation allows.
export async function goToQuestion(attemptId: string, deviceId: string, index: number) {
  await player({ attempt: ["update"] });
  return write((api) => api["attempt.goTo"]({ attemptId, deviceId, index }));
}

// Marks a question for review, or clears the mark.
export async function setMarked(attemptId: string, deviceId: string, questionId: string, marked: boolean) {
  await player({ attempt: ["update"] });
  return write((api) => api["attempt.setMarked"]({ attemptId, deviceId, questionId, marked }));
}

// Hands the attempt in and moves on to the result page; returns the error (message and tag) when the API refuses.
export async function submitAttempt(
  sessionId: string,
  attemptId: string,
  deviceId: string,
  answers: Record<string, AnswerValue>,
  events: readonly IntegrityEvent[],
  typing: Record<string, TypingEdits>,
) {
  const { area } = await player({ attempt: ["update"] });
  const result = await write((api) => api["attempt.submit"]({ attemptId, deviceId, answers, events, typing }));
  if ("error" in result) return result;
  redirect(`${attemptHrefs(area, sessionId).result}?submitted=1`);
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
  const { user, myClasses } = await player({ attempt: ["read"] });
  const result = await readOrNull((api) => api["attempt.result"]({ sessionId }));
  if (!result) return null;
  return { ...result, userId: user.id, classes: myClasses.filter((c) => c.id === result.session.classId) };
}

// The AI coach's report on the student's latest released result (the rule-based one when AI isn't available).
export async function getMyCoach(sessionId: string) {
  await requirePermission({ attempt: ["read"] });
  return write((api) => api["attempt.coach"]({ sessionId }));
}
