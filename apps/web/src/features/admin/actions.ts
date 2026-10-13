"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result, Schema } from "effect";
import { callApi, forwardedHeaders } from "@/lib/api/client";
import { emailPattern, parseForm } from "@/lib/validate";

export type FormState = { error: string } | { saved: string } | undefined;

// Form fields with messages for people; the API validates the same rules again and enforces permissions.
// Each role carries exactly its own profile field.
const required =
  (message: string) =>
  <S extends Schema.Top>(self: S) =>
    self.pipe(Schema.annotateKey({ messageMissingKey: message }));
const text = (missing: string) =>
  Schema.Trim.check(Schema.isMinLength(1, { message: missing })).pipe(required(missing));
const name = Schema.Trim.check(
  Schema.isMinLength(1, { message: "Enter a name." }),
  Schema.isMaxLength(100, { message: "Use a name of at most 100 characters." }),
).pipe(required("Enter a name."));
const passwordText = Schema.String.check(
  Schema.isMinLength(8, { message: "Use a password of at least 8 characters." }),
  Schema.isMaxLength(128, { message: "Use a password of at most 128 characters." }),
);
const password = passwordText.pipe(required("Enter a password."));
const email = Schema.Trim.check(Schema.isPattern(emailPattern, { message: "Enter a valid email address." })).pipe(
  required("Enter an email address."),
);

const withProfile = <F extends Schema.Struct.Fields>(fields: F) =>
  Schema.Union([
    Schema.Struct({ ...fields, role: Schema.Literal("admin") }),
    Schema.Struct({
      ...fields,
      role: Schema.Literal("teacher"),
      department: text("Enter the teacher's department."),
    }),
    Schema.Struct({
      ...fields,
      role: Schema.Literal("student"),
      studentId: text("Choose the student's roster entry."),
    }),
  ]).annotate({ message: "Choose a role." });
const createFields = withProfile({ name, email, password });
const updateFields = withProfile({ name });

// Keeps only the active role's profile field.
const profileOf = (fields: typeof createFields.Type | typeof updateFields.Type) =>
  fields.role === "teacher"
    ? { role: fields.role, department: fields.department }
    : fields.role === "student"
      ? { role: fields.role, studentId: fields.studentId }
      : { role: fields.role };

// The API's declared errors, as form messages. A lost session goes back to sign-in.
function failure(error: { _tag: "Unauthorized" } | { _tag: string; message: string }): FormState {
  if (error._tag === "Unauthorized") redirect("/login");
  return { error: "message" in error ? error.message : "Something went wrong." };
}

async function call<A, E extends { _tag: "Unauthorized" } | { _tag: string; message: string }>(
  run: Parameters<typeof callApi<A, E>>[0],
): Promise<FormState | null> {
  const result = await callApi(run, forwardedHeaders(await headers()));
  return Result.isFailure(result) ? failure(result.failure) : null;
}

export async function createAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(createFields, Object.fromEntries(formData));
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  const { name: n, email: e, password: p } = parsed.success;

  const failed = await call((api) => api["admin.createUser"]({ name: n, email: e, password: p, profile: profileOf(parsed.success) }));
  if (failed) return failed;
  revalidatePath("/admin");
  redirect("/admin");
}

export async function updateAccount(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(updateFields, Object.fromEntries(formData));
  if (Result.isFailure(parsed)) return { error: parsed.failure };

  const failed = await call((api) =>
    api["admin.updateUser"]({ userId, name: parsed.success.name, profile: profileOf(parsed.success) }),
  );
  if (failed) return failed;
  revalidatePath("/admin");
  return { saved: "Saved." };
}

export async function setAccountPassword(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(passwordText, formData.get("password") ?? "");
  if (Result.isFailure(parsed)) return { error: parsed.failure };
  return (await call((api) => api["admin.setPassword"]({ userId, password: parsed.success }))) ?? { saved: "Password changed." };
}

// Suspending signs the user out everywhere and blocks sign-in until reinstated.
export async function setAccountSuspended(userId: string, suspended: boolean): Promise<FormState> {
  const failed = await call((api) => api["admin.setSuspended"]({ userId, suspended }));
  if (failed) return failed;
  revalidatePath("/admin");
  return { saved: suspended ? "Account suspended." : "Account reinstated." };
}

export async function removeAccount(userId: string): Promise<FormState> {
  const failed = await call((api) => api["admin.removeUser"]({ userId }));
  if (failed) return failed;
  revalidatePath("/admin");
  redirect("/admin");
}
