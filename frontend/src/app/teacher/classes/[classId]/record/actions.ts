"use server";

import { revalidatePath } from "next/cache";
import { saveClassRecord } from "@/lib/data/class-records";
import type { ClassRecord } from "@/lib/types";

// Returns an error message, or null when saved.
export async function saveRecord(classId: string, record: ClassRecord): Promise<string | null> {
  const error = await saveClassRecord(record, classId);
  if (!error) revalidatePath(`/teacher/classes/${classId}`, "layout");
  return error;
}
