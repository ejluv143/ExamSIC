"use server";

import { redirect } from "next/navigation";
import type { AnswerValue, IntegrityEvent, TypingEdits } from "@examora/contract";
import * as student from "@/lib/data/student";

// Records the start on the server; the page then re-reads the paper, which now has the questions.
export async function startExam(sessionId: string) {
  return student.startAttempt(sessionId);
}

// Called as the student answers, so closing the browser loses nothing.
export async function saveExamAnswer(attemptId: string, questionId: string, value: AnswerValue, typing?: TypingEdits) {
  return student.saveAnswer(attemptId, questionId, value, typing);
}

// The Run button for languages the browser can't run: the question's visible tests on the code runner.
export async function runSampleTests(attemptId: string, questionId: string, code: string) {
  return student.runSampleTests(attemptId, questionId, code);
}

export async function recordExamEvents(attemptId: string, events: readonly IntegrityEvent[]) {
  return student.recordEvents(attemptId, events);
}

// Returns an error message to show, or moves on to the result page.
export async function submitExam(
  sessionId: string,
  attemptId: string,
  answers: Record<string, AnswerValue>,
  events: readonly IntegrityEvent[],
  typing: Record<string, TypingEdits>,
): Promise<string | null> {
  const result = await student.submitAttempt(attemptId, answers, events, typing);
  if ("error" in result) return result.error;
  redirect(`/student/assessments/${encodeURIComponent(sessionId)}/result?submitted=1`);
}
