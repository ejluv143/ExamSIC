"use server";

import { revalidatePath } from "next/cache";
import { getClassRecord, saveClassRecord } from "@/lib/data/class-records";
import { saveMeeting } from "@/lib/data/attendance";
import { classRecords } from "@/lib/data/mock";

// Returns an error message, or null when saved.
export async function saveAttendance(classId: string, meetingId: string, records: Record<string, string>) {
  const error = await saveMeeting(classId, meetingId, records);
  if (!error) revalidatePath(`/teacher/classes/${classId}`, "layout");
  return error;
}

// Marks a student as dropped (DR) in the class record, after the teacher confirms.
export async function markDropped(classId: string, studentId: string): Promise<string | null> {
  const data = await getClassRecord(classId);
  if (!data) return "That class doesn't exist.";
  // Start from what's stored (not the attendance-filled copy) so absences stay computed.
  const stored = structuredClone(classRecords.find((r) => r.classId === classId) ?? data.record);
  if (!stored.dropped.includes(studentId)) stored.dropped.push(studentId);
  const error = await saveClassRecord(stored, classId);
  if (!error) revalidatePath(`/teacher/classes/${classId}`, "layout");
  return error;
}
