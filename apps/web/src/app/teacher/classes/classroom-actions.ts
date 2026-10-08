"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { applyCookies } from "@/lib/api/client";
import { connectClassroom, importClassroomCourses, syncClassroomRoster } from "@/lib/data/classroom";

// Sends the teacher to Google to allow read-only Classroom access; Google comes back to /teacher/classes/import.
export async function connectClassroomAction() {
  const result = await connectClassroom();
  if ("error" in result) redirect(`/teacher/classes?classroom=${encodeURIComponent(result.error)}`);
  // Better Auth's OAuth state cookie; the callback comes back through /api/auth/* (next.config.ts).
  applyCookies(await cookies(), result.cookies);
  redirect(result.url);
}

export type ImportState = { error: string } | undefined;

export async function importClassroomAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const courseIds = formData.getAll("courseId").filter((v): v is string => typeof v === "string" && v !== "");
  if (courseIds.length === 0) return { error: "Choose at least one course to import." };
  const result = await importClassroomCourses(courseIds);
  if ("error" in result) return result;
  revalidatePath("/teacher", "layout");
  redirect(result.classIds.length === 1 ? `/teacher/classes/${result.classIds[0]}` : "/teacher/classes");
}

export async function syncRosterAction(classId: string) {
  const result = await syncClassroomRoster(classId);
  if ("ok" in result) revalidatePath(`/teacher/classes/${classId}`, "layout");
  return result;
}
