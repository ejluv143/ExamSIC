"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { subjectAreaNames } from "@examora/contract";
import { archiveClass, createClass, newJoinCode, removeStudent, updateClass } from "@/lib/data/teacher";

export type ClassFormState = { error: string } | undefined;

// Form fields with messages for people; the API checks the same rules again.
const text = (max: number, label: string) => z.string().trim().max(max, `Use at most ${max} characters for the ${label}.`);
const fields = z.object({
  courseCode: text(40, "course code").min(1, "Enter the course code, e.g. IT302."),
  title: text(120, "title").min(1, "Enter the class title."),
  subjectArea: z.enum(subjectAreaNames).or(z.literal("").transform(() => null)),
  section: text(60, "section"),
  term: text(60, "term"),
  schedule: text(80, "schedule"),
  room: text(60, "room"),
  units: z.coerce.number({ error: "Enter the units as a number." }).int("Enter whole units.").min(0).max(12, "Use at most 12 units."),
});

const parse = (formData: FormData) => fields.safeParse(Object.fromEntries(formData));

export async function createClassAction(_prev: ClassFormState, formData: FormData): Promise<ClassFormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = await createClass(parsed.data);
  revalidatePath("/teacher", "layout");
  redirect(`/teacher/classes/${id}`);
}

export async function updateClassAction(classId: string, _prev: ClassFormState, formData: FormData): Promise<ClassFormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const error = await updateClass(classId, parsed.data);
  if (error) return { error };
  revalidatePath("/teacher", "layout");
  redirect(`/teacher/classes/${classId}`);
}

export async function archiveClassAction(classId: string): Promise<ClassFormState> {
  const error = await archiveClass(classId);
  if (error) return { error };
  revalidatePath("/teacher", "layout");
  redirect("/teacher/classes");
}

export async function newJoinCodeAction(classId: string): Promise<ClassFormState> {
  const error = await newJoinCode(classId);
  if (error) return { error };
  revalidatePath(`/teacher/classes/${classId}`);
}

export async function removeStudentAction(classId: string, studentId: string): Promise<ClassFormState> {
  const error = await removeStudent(classId, studentId);
  if (error) return { error };
  revalidatePath(`/teacher/classes/${classId}`, "layout");
}
