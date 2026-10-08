"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result } from "effect";
import { z } from "zod";
import { homeFor, passwordProblem } from "@examora/contract";
import { applyCookies, callApi, forwardedHeaders } from "@/lib/api/client";

// On an error the typed values come back (never the passwords), since React resets the form after an action.
export type RegisterValues = { name: string; email: string };
export type RegisterState = { error: string; values: RegisterValues } | undefined;

// Form fields with messages for people; the API checks the same rules again.
const profileFields = z.object({
  role: z.enum(["student", "teacher"], { error: "Choose whether you're a student or a teacher." }),
});
const agreement = z.object({
  acceptTerms: z.literal("yes", { error: "Agree to the Terms of Service and Privacy Policy to create an account." }),
});

const toProfile = (f: z.infer<typeof profileFields>) => ({ role: f.role });

const fields = z
  .object({
    name: z.string().trim().min(1, "Enter your full name.").max(100, "Use a name of at most 100 characters."),
    email: z.string().trim().min(1, "Enter your email address.").pipe(z.email("Enter a valid email address.")),
    password: z
      .string()
      .max(128, "Use a password of at most 128 characters.")
      .superRefine((p, ctx) => {
        const weak = passwordProblem(p);
        if (weak) ctx.addIssue({ code: "custom", message: `Your password needs: ${weak.toLowerCase()}.` });
      }),
    confirm: z.string(),
  })
  .refine((f) => f.password === f.confirm, { message: "The passwords don't match." })
  .and(profileFields)
  .and(agreement);

function typedValues(formData: FormData): RegisterValues {
  const text = (key: string) => String(formData.get(key) ?? "");
  return { name: text("name"), email: text("email") };
}

export async function register(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const values = typedValues(formData);
  const parsed = fields.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const f = parsed.data;
  const profile = toProfile(f);
  const result = await callApi(
    (api) => api["auth.register"]({ name: f.name, email: f.email, password: f.password, profile, acceptTerms: true }),
    forwardedHeaders(await headers()),
  );
  if (Result.isFailure(result)) return { error: result.failure.message, values };
  // Signed in to the new account: straight to their dashboard.
  applyCookies(await cookies(), result.success.cookies);
  redirect(homeFor(result.success.user.role));
}

// Google gives the name and email; the role comes from this form.
// Google signs them in to the new account and sends them to their dashboard.
export async function registerWithGoogle(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const values = typedValues(formData);
  const parsed = profileFields.and(agreement).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const result = await callApi(
    (api) =>
      api["auth.signUpGoogle"]({
        profile: toProfile(parsed.data),
        acceptTerms: true,
        callbackURL: homeFor(parsed.data.role),
        errorCallbackURL: "/register?google=failed",
      }),
    forwardedHeaders(await headers()),
  );
  if (Result.isFailure(result)) return { error: result.failure.message, values };
  // Better Auth's OAuth state cookie; the callback comes back through /api/auth/* (next.config.ts).
  applyCookies(await cookies(), result.success.cookies);
  redirect(result.success.url);
}
