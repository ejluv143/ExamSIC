"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result, Schema } from "effect";
import { homeFor, passwordProblem } from "@examora/contract";
import { applyCookies, callApi, forwardedHeaders } from "@/lib/api/client";
import { emailPattern, parseForm } from "@/lib/validate";

// On an error the typed values come back (never the passwords), since React resets the form after an action.
export type RegisterValues = { name: string; email: string };
export type RegisterState = { error: string; values: RegisterValues } | undefined;

// Form fields with messages for people; the API checks the same rules again.
const required =
  (message: string) =>
  <S extends Schema.Top>(self: S) =>
    self.pipe(Schema.annotateKey({ messageMissingKey: message }));
const profileFields = {
  role: Schema.Literals(["student", "teacher"])
    .annotate({ message: "Choose whether you're a student or a teacher." })
    .pipe(required("Choose whether you're a student or a teacher.")),
};
const agreementMessage = "Agree to the Terms of Service and Privacy Policy to create an account.";
const agreement = {
  acceptTerms: Schema.Literal("yes").annotate({ message: agreementMessage }).pipe(required(agreementMessage)),
};

const toProfile = (f: { role: "student" | "teacher" }) => ({ role: f.role });

const fields = Schema.Struct({
  name: Schema.Trim.check(
    Schema.isMinLength(1, { message: "Enter your full name." }),
    Schema.isMaxLength(100, { message: "Use a name of at most 100 characters." }),
  ).pipe(required("Enter your full name.")),
  email: Schema.Trim.check(
    Schema.isMinLength(1, { message: "Enter your email address." }),
    Schema.isPattern(emailPattern, { message: "Enter a valid email address." }),
  ).pipe(required("Enter your email address.")),
  password: Schema.String.check(
    Schema.isMaxLength(128, { message: "Use a password of at most 128 characters." }),
    Schema.makeFilter((p: string) => {
      const weak = passwordProblem(p);
      return weak ? `Your password needs: ${weak.toLowerCase()}.` : undefined;
    }),
  ).pipe(required("Enter a password.")),
  confirm: Schema.String.pipe(required("Repeat your password.")),
  ...profileFields,
  ...agreement,
});
const googleFields = Schema.Struct({ ...profileFields, ...agreement });

function typedValues(formData: FormData): RegisterValues {
  const text = (key: string) => String(formData.get(key) ?? "");
  return { name: text("name"), email: text("email") };
}

export async function register(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const values = typedValues(formData);
  const parsed = parseForm(fields, Object.fromEntries(formData));
  if (Result.isFailure(parsed)) return { error: parsed.failure, values };
  const f = parsed.success;
  if (f.password !== f.confirm) return { error: "The passwords don't match.", values };
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
  const parsed = parseForm(googleFields, Object.fromEntries(formData));
  if (Result.isFailure(parsed)) return { error: parsed.failure, values };
  const result = await callApi(
    (api) =>
      api["auth.signUpGoogle"]({
        profile: toProfile(parsed.success),
        acceptTerms: true,
        callbackURL: homeFor(parsed.success.role),
        errorCallbackURL: "/register?google=failed",
      }),
    forwardedHeaders(await headers()),
  );
  if (Result.isFailure(result)) return { error: result.failure.message, values };
  // Better Auth's OAuth state cookie; the callback comes back through /api/auth/* (next.config.ts).
  applyCookies(await cookies(), result.success.cookies);
  redirect(result.success.url);
}
