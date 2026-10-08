"use server";

import { redirect } from "next/navigation";
import type { AnswerValue, IntegrityEvent, TypingEdits } from "@examora/contract";
import * as student from "@/lib/data/student";

// Every call carries `deviceId`, the browser's token: the API refuses a different browser for an attempt.

// Records the start on the server; the page then re-reads the paper, which now has the questions.
export async function startExam(sessionId: string, deviceId: string, roomPassword: string, pledgeAccepted?: boolean) {
  return student.startAttempt(sessionId, deviceId, roomPassword, pledgeAccepted);
}

// The exam gate's connection test: a round trip to the API, timed by the browser.
export async function pingExamApi() {
  await student.pingApi();
}

// While a student waits for their teacher to approve this device.
export async function checkExamDevice(sessionId: string) {
  return student.checkDeviceApproval(sessionId);
}

// Called as the student answers, so closing the browser loses nothing. `timeSpentMs` is how long the question was on screen.
export async function saveExamAnswer(
  attemptId: string,
  deviceId: string,
  questionId: string,
  value: AnswerValue,
  typing?: TypingEdits,
  timeSpentMs?: number,
) {
  return student.saveAnswer(attemptId, deviceId, questionId, value, typing, timeSpentMs);
}

// The Run button for languages the browser can't run: the question's visible tests on the code runner.
export async function runSampleTests(attemptId: string, questionId: string, code: string) {
  return student.runSampleTests(attemptId, questionId, code);
}

export async function recordExamEvents(attemptId: string, deviceId: string, events: readonly IntegrityEvent[]) {
  return student.recordEvents(attemptId, deviceId, events);
}

// The check-in that lets the server notice a lost connection.
export async function examHeartbeat(attemptId: string, deviceId: string) {
  return student.heartbeat(attemptId, deviceId);
}

// One question at a time: opens question `index` (0-based).
export async function goToExamQuestion(attemptId: string, deviceId: string, index: number) {
  return student.goToQuestion(attemptId, deviceId, index);
}

export async function markExamQuestion(attemptId: string, deviceId: string, questionId: string, marked: boolean) {
  return student.setMarked(attemptId, deviceId, questionId, marked);
}

// Returns an error message to show, or moves on to the result page.
export async function submitExam(
  sessionId: string,
  attemptId: string,
  deviceId: string,
  answers: Record<string, AnswerValue>,
  events: readonly IntegrityEvent[],
  typing: Record<string, TypingEdits>,
): Promise<string | null> {
  const result = await student.submitAttempt(attemptId, deviceId, answers, events, typing);
  if ("error" in result) return result.error;
  redirect(`/student/assessments/${encodeURIComponent(sessionId)}/result?submitted=1`);
}

// Mastery mode: the saved queue and the question to answer now.
export async function getMasteryState(attemptId: string, deviceId: string) {
  return student.masteryState(attemptId, deviceId);
}

// Mastery mode: grades one try and returns the feedback with the next question.
export async function answerMastery(
  attemptId: string,
  deviceId: string,
  questionId: string,
  value: AnswerValue,
  timeSpentMs?: number,
) {
  return student.masteryAnswer(attemptId, deviceId, questionId, value, timeSpentMs);
}
