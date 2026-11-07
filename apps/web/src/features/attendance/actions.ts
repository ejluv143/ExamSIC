"use server";

import { revalidatePath } from "next/cache";
import { markStudentDropped } from "@/features/records/data/record";
import { saveMeeting } from "@/features/attendance/data";

// Returns an error message, or null when saved.
export async function saveAttendance(classId: string, meetingId: string, records: Record<string, string>) {
  const error = await saveMeeting(classId, meetingId, records);
  if (!error) revalidatePath(`/teacher/classes/${classId}`, "layout");
  return error;
}

// Marks a student as dropped (DR) in the class record, after the teacher confirms.
export async function markDropped(classId: string, studentId: string): Promise<string | null> {
  const error = await markStudentDropped(classId, studentId);
  if (!error) revalidatePath(`/teacher/classes/${classId}`, "layout");
  return error;
}
