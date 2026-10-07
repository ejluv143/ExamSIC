"use server";

import { redirect } from "next/navigation";
import { runMySampleTests, startAttempt, submitAttempt } from "@/lib/data/student";

// The Run button for Python, Java, C and C++: the question's visible tests on the code runner.
export async function runSampleTests(assessmentId: string, questionId: string, code: string) {
  return runMySampleTests(assessmentId, questionId, code);
}

// Records the start on the server and returns it, so the timer runs from the server's clock.
export async function startExam(assessmentId: string): Promise<string | null> {
  return startAttempt(assessmentId);
}

// Returns an error message to show, or moves on to the result page.
export async function submitExam(
  assessmentId: string,
  answers: Record<string, unknown>,
  startedAt: string,
  integrityEvents: unknown,
  typing: unknown,
): Promise<string | null> {
  const result = await submitAttempt(assessmentId, answers, startedAt, integrityEvents, typing);
  if (!result.ok) return result.error;
  redirect(`/student/assessments/${encodeURIComponent(assessmentId)}/result?submitted=1`);
}
