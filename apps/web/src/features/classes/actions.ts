"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Result, Schema, SchemaGetter } from "effect";
import { subjectAreaNames } from "@examinus/domain/roles";
import { parseForm } from "@/lib/validate";
import {
  archiveClass,
  createClass,
  newJoinCode,
  removeStudent,
  updateClass,
  connectClassroom,
  importClassroomCourses,
  syncClassroomRoster,
  joinClass,
  leaveClass,
} from "@/features/classes/data";
import { cookies } from "next/headers";
import { applyCookies } from "@/lib/api/client";

export type ClassFormState = { error: string } | undefined;

// Form fields with messages for people; the API checks the same rules again.
const required =
  (message: string) =>
  <S extends Schema.Top>(self: S) =>
    self.pipe(Schema.annotateKey({ messageMissingKey: message }));
const text = (max: number, label: string) =>
  Schema.Trim.check(Schema.isMaxLength(max, { message: `Use at most ${max} characters for the ${label}.` }));
const requiredText = (max: number, label: string, missing: string) =>
  Schema.Trim.check(
    Schema.isMinLength(1, { message: missing }),
    Schema.isMaxLength(max, { message: `Use at most ${max} characters for the ${label}.` }),
  ).pipe(required(missing));
const unitsMessage = "Enter the units as a whole number from 0 to 12.";
const fields = Schema.Struct({
  courseCode: requiredText(40, "course code", "Enter the course code, e.g. IT302."),
  title: requiredText(120, "title", "Enter the class title."),
  // "": no subject, guessed from the course code and title.
  subjectArea: Schema.Literals(["", ...subjectAreaNames]).pipe(
    Schema.decodeTo(Schema.NullOr(Schema.Literals(subjectAreaNames)), {
      decode: SchemaGetter.transform((v) => (v === "" ? null : v)),
      encode: SchemaGetter.transform((v) => v ?? ""),
    }),
    required("Choose a subject."),
  ),
  section: text(60, "section").pipe(required("Enter the section.")),
  term: text(60, "term").pipe(required("Enter the term.")),
  schedule: text(80, "schedule").pipe(required("Enter the schedule.")),
  room: text(60, "room").pipe(required("Enter the room.")),
  units: Schema.FiniteFromString.check(Schema.isInt({ message: unitsMessage }), Schema.isBetween({ minimum: 0, maximum: 12 }, { message: unitsMessage })).pipe(
    required(unitsMessage),
  ),
});

const parse = (formData: FormData) => parseForm(fields, Object.fromEntries(formData));

export async function createClassAction(_prev: ClassFormState, formData: FormData): Promise<ClassFormState> {
  const parsed = parse(formData);
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  const id = await createClass(parsed.success);
  revalidatePath("/teacher", "layout");
  redirect(`/teacher/classes/${id}`);
}

export async function updateClassAction(classId: string, _prev: ClassFormState, formData: FormData): Promise<ClassFormState> {
  const parsed = parse(formData);
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  const error = await updateClass(classId, parsed.success);
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

export type JoinState = { error: string } | { joined: true } | undefined;

export async function joinClassAction(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the class code from your teacher." };
  const sex = formData.get("sex");
  const studentNumber = String(formData.get("studentNumber") ?? "").trim();
  if (studentNumber.length > 40) return { error: "That student number is too long." };
  const error = await joinClass(code, sex === "M" || sex === "F" ? sex : null, studentNumber || null);
  if (error) return { error };
  revalidatePath("/", "layout");
  return { joined: true };
}

export async function leaveClassAction(classId: string): Promise<{ error: string } | undefined> {
  const error = await leaveClass(classId);
  if (error) return { error };
  revalidatePath("/student", "layout");
}
