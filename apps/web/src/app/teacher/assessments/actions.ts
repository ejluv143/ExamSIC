"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveAssessment } from "@/lib/data/teacher";
import type { Assessment } from "@/lib/types";

// Saves a quiz or exam. A new one moves on to its own edit page, so reloading doesn't start a blank one.
export async function saveAssessmentAction(assessment: Assessment) {
  const result = await saveAssessment(assessment);
  if ("error" in result) return result;
  // Lists, class records and students' pages all read assessments.
  revalidatePath("/teacher", "layout");
  revalidatePath("/student", "layout");
  if (assessment.id === "new")
    redirect(`/teacher/assessments/${result.id}/edit?saved=${assessment.status === "draft" ? "draft" : "published"}`);
  return result;
}
