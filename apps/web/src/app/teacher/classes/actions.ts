"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Result, Schema, SchemaGetter } from "effect";
import { subjectAreaNames } from "@examora/contract";
import { parseForm } from "@/lib/validate";
import { archiveClass, createClass, newJoinCode, removeStudent, updateClass } from "@/lib/data/teacher";

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
