"use server";

import { redirect } from "next/navigation";
import type { AnswerValue, IntegrityEvent, TypingEdits } from "@examora/contract";
import * as student from "@/lib/data/student";

// Every call carries `deviceId`, the browser's token: the API refuses a different browser for an attempt.

// Records the start on the server; the page then re-reads the paper, which now has the questions.
export async function startExam(sessionId: string, deviceId: string, roomPassword: string) {
  return student.startAttempt(sessionId, deviceId, roomPassword);
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

// One question at a time: asks for the next question.
export async function advanceExam(attemptId: string, deviceId: string) {
  return student.advanceQuestion(attemptId, deviceId);
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
