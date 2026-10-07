"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result } from "effect";
import { z } from "zod";
import { applyCookies, callApi, forwardedHeaders } from "@/lib/api/client";

// On an error the typed values come back (never the passwords), since React resets the form after an action.
export type RegisterValues = { name: string; email: string; studentId: string; department: string };
export type RegisterState = { error: string; values: RegisterValues } | { registered: string } | undefined;

// Form fields with messages for people; the API checks the same rules again.
const profileFields = z.discriminatedUnion(
  "role",
  [
    z.object({
      role: z.literal("student"),
      studentId: z.string().trim().min(1, "Enter your student number.").max(40, "That student number is too long."),
    }),
    z.object({
      role: z.literal("teacher"),
      department: z.string().trim().min(1, "Enter your department.").max(100, "That department name is too long."),
    }),
  ],
  { error: "Choose whether you're a student or a teacher." },
);
const toProfile = (f: z.infer<typeof profileFields>) =>
  f.role === "student" ? { role: f.role, studentId: f.studentId } : { role: f.role, department: f.department };

const fields = z
  .object({
    name: z.string().trim().min(1, "Enter your full name.").max(100, "Use a name of at most 100 characters."),
    email: z.string().trim().min(1, "Enter your email address.").pipe(z.email("Enter a valid email address.")),
    password: z.string().min(8, "Use a password of at least 8 characters.").max(128, "Use a password of at most 128 characters."),
    confirm: z.string(),
  })
  .refine((f) => f.password === f.confirm, { message: "The passwords don't match." })
  .and(profileFields);

function typedValues(formData: FormData): RegisterValues {
  const text = (key: string) => String(formData.get(key) ?? "");
  return { name: text("name"), email: text("email"), studentId: text("studentId"), department: text("department") };
}

export async function register(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const values = typedValues(formData);
  const parsed = fields.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const f = parsed.data;
  const profile = toProfile(f);
  const result = await callApi(
    (api) => api["auth.register"]({ name: f.name, email: f.email, password: f.password, profile }),
    forwardedHeaders(await headers()),
  );
  if (Result.isFailure(result)) return { error: result.failure.message, values };
  return { registered: f.email };
}

// Google gives the name and email; the role and student number or department come from this form.
// Google sends people back to /register?google=failed&error=BANNED_USER once the pending account exists.
export async function registerWithGoogle(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const values = typedValues(formData);
  const parsed = profileFields.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const result = await callApi(
    (api) =>
      api["auth.signUpGoogle"]({ profile: toProfile(parsed.data), callbackURL: "/", errorCallbackURL: "/register?google=failed" }),
    forwardedHeaders(await headers()),
  );
  if (Result.isFailure(result)) return { error: result.failure.message, values };
  // Better Auth's OAuth state cookie; the callback comes back through /api/auth/* (next.config.ts).
  applyCookies(await cookies(), result.success.cookies);
  redirect(result.success.url);
}
