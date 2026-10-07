"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result } from "effect";
import { z } from "zod";
import { callApi, forwardedHeaders } from "@/lib/api/client";

export type FormState = { error: string } | { saved: string } | undefined;

// Form fields with messages for people; the API validates the same rules again and enforces permissions.
// Each role carries exactly its own profile field.
const profile = z.discriminatedUnion(
  "role",
  [
    z.object({ role: z.literal("admin") }),
    z.object({
      role: z.literal("teacher"),
      department: z.string({ error: "Enter the teacher's department." }).trim().min(1, "Enter the teacher's department."),
    }),
    z.object({
      role: z.literal("student"),
      studentId: z.string({ error: "Choose the student's roster entry." }).trim().min(1, "Choose the student's roster entry."),
    }),
  ],
  { error: "Choose a role." },
);
const name = z.string({ error: "Enter a name." }).trim().min(1, "Enter a name.").max(100, "Use a name of at most 100 characters.");
const password = z
  .string({ error: "Enter a password." })
  .min(8, "Use a password of at least 8 characters.")
  .max(128, "Use a password of at most 128 characters.");
const email = z.string({ error: "Enter an email address." }).trim().pipe(z.email("Enter a valid email address."));

// Keeps only the active role's profile field.
const profileOf = (fields: z.output<typeof profile>) =>
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
  const parsed = z.object({ name, email, password }).and(profile).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name: n, email: e, password: p } = parsed.data;

  const failed = await call((api) => api["admin.createUser"]({ name: n, email: e, password: p, profile: profileOf(parsed.data) }));
  if (failed) return failed;
  revalidatePath("/admin");
  redirect("/admin");
}

export async function updateAccount(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ name }).and(profile).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const failed = await call((api) =>
    api["admin.updateUser"]({ userId, name: parsed.data.name, profile: profileOf(parsed.data) }),
  );
  if (failed) return failed;
  revalidatePath("/admin");
  return { saved: "Saved." };
}

export async function setAccountPassword(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = password.safeParse(formData.get("password") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return (await call((api) => api["admin.setPassword"]({ userId, password: parsed.data }))) ?? { saved: "Password changed." };
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
