"use server";

import { headers } from "next/headers";
import { Result } from "effect";
import { z } from "zod";
import { callApi, forwardedHeaders } from "@/lib/api/client";

// On an error the typed values come back (never the passwords), since React resets the form after an action.
export type RegisterValues = { name: string; email: string; studentId: string; department: string };
export type RegisterState = { error: string; values: RegisterValues } | { registered: string } | undefined;

// Form fields with messages for people; the API checks the same rules again.
const fields = z
  .object({
    name: z.string().trim().min(1, "Enter your full name.").max(100, "Use a name of at most 100 characters."),
    email: z.string().trim().min(1, "Enter your email address.").pipe(z.email("Enter a valid email address.")),
    password: z.string().min(8, "Use a password of at least 8 characters.").max(128, "Use a password of at most 128 characters."),
    confirm: z.string(),
  })
  .refine((f) => f.password === f.confirm, { message: "The passwords don't match." })
  .and(
    z.discriminatedUnion(
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
    ),
  );

export async function register(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const text = (key: string) => String(formData.get(key) ?? "");
  const values = { name: text("name"), email: text("email"), studentId: text("studentId"), department: text("department") };
  const parsed = fields.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const f = parsed.data;
  const profile = f.role === "student" ? { role: f.role, studentId: f.studentId } : { role: f.role, department: f.department };
  const result = await callApi(
    (api) => api["auth.register"]({ name: f.name, email: f.email, password: f.password, profile }),
    forwardedHeaders(await headers()),
  );
  if (Result.isFailure(result)) return { error: result.failure.message, values };
  return { registered: f.email };
}
