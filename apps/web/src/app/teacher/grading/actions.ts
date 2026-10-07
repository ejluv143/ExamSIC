"use server";

import { revalidatePath } from "next/cache";
import { gradeAnswer } from "@/lib/data/teacher";

// Saves the teacher's score (points; null clears it) and feedback for one answer. The result says whether
// the attempt is now graded.
export async function gradeAnswerAction(
  attemptId: string,
  questionId: string,
  manualScore: number | null,
  feedback: string | null,
) {
  const result = await gradeAnswer(attemptId, questionId, manualScore, feedback);
  if ("error" in result) return result;
  revalidatePath("/teacher", "layout");
  revalidatePath("/student", "layout");
  return result;
}
