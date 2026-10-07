"use server";

import { revalidatePath } from "next/cache";
import { gradeAnswer } from "@/lib/data/teacher";

// Saves the teacher's score (points; null clears it) and feedback for one answer. The result says whether
// the attempt is now graded. `reason` is kept in the exam record when a released score changes.
export async function gradeAnswerAction(
  attemptId: string,
  questionId: string,
  manualScore: number | null,
  feedback: string | null,
  reason?: string,
) {
  const result = await gradeAnswer(attemptId, questionId, manualScore, feedback, reason);
  if ("error" in result) return result;
  revalidatePath("/teacher", "layout");
  revalidatePath("/student", "layout");
  return result;
}
