"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { auth } from "@/lib/auth/server";
import { rosterEntryTaken } from "@/lib/data/admin";

export type FormState = { error: string } | { saved: string } | undefined;

// Each role carries exactly its own profile field (users_role_profile_check).
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
const newAccount = z.object({ name, email, password }).and(profile);
const accountChanges = z.object({ name }).and(profile);

// The role and profile columns to store, with the other roles' fields cleared.
function profileColumns(p: z.output<typeof profile>) {
  return {
    role: p.role,
    department: p.role === "teacher" ? p.department : null,
    studentId: p.role === "student" ? p.studentId : null,
  };
}

// Better Auth's admin API checks permissions too; its messages are written for people.
function failure(e: unknown): FormState {
  if (e instanceof APIError) return { error: e.message };
  throw e;
}

export async function createAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ user: ["create", "set-role"] });
  const parsed = newAccount.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { role, department, studentId } = profileColumns(parsed.data);
  if (studentId && (await rosterEntryTaken(studentId))) return { error: "That roster entry already has an account." };

  try {
    await auth.api.createUser({
      body: { name: parsed.data.name, email: parsed.data.email, password: parsed.data.password, role, data: { department, studentId } },
      headers: await headers(),
    });
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/admin");
  redirect("/admin");
}

export async function updateAccount(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requirePermission({ user: ["update", "set-role"] });
  const parsed = accountChanges.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const columns = profileColumns(parsed.data);
  // Keeps the acting admin able to manage accounts.
  if (userId === me.id && columns.role !== "admin") return { error: "You can't change your own role." };
  if (columns.studentId && (await rosterEntryTaken(columns.studentId, userId))) {
    return { error: "That roster entry already has an account." };
  }

  try {
    await auth.api.adminUpdateUser({ body: { userId, data: { name: parsed.data.name, ...columns } }, headers: await headers() });
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/admin");
  return { saved: "Saved." };
}

export async function setAccountPassword(userId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission({ user: ["set-password"] });
  const parsed = password.safeParse(formData.get("password") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await auth.api.setUserPassword({ body: { userId, newPassword: parsed.data }, headers: await headers() });
  } catch (e) {
    return failure(e);
  }
  return { saved: "Password changed." };
}

// Suspending signs the user out everywhere and blocks sign-in until reinstated.
export async function setAccountSuspended(userId: string, suspended: boolean): Promise<FormState> {
  await requirePermission({ user: ["ban"] });
  try {
    if (suspended) await auth.api.banUser({ body: { userId }, headers: await headers() });
    else await auth.api.unbanUser({ body: { userId }, headers: await headers() });
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/admin");
  return { saved: suspended ? "Account suspended." : "Account reinstated." };
}

export async function removeAccount(userId: string): Promise<FormState> {
  await requirePermission({ user: ["delete"] });
  try {
    await auth.api.removeUser({ body: { userId }, headers: await headers() });
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/admin");
  redirect("/admin");
}
