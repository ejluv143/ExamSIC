"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result, Schema } from "effect";
import { homeFor, roleNames, type Role } from "@examinus/domain/roles";
import { applyCookies, callApi, forwardedHeaders } from "@/lib/api/client";
import { emailPattern, parseForm } from "@/lib/validate";
import { passwordProblem } from "@examinus/domain/password";
import { joinAsGuest, getMyAvatar, saveAvatar } from "@/features/auth/data";

export type LoginState = { error: string; email: string } | undefined;

const missing = "Enter your email and password.";
const credentials = Schema.Struct({
  email: Schema.Trim.check(
    Schema.isMinLength(1, { message: missing }),
    Schema.isPattern(emailPattern, { message: "Enter a valid email address." }),
  ),
  password: Schema.String.check(Schema.isMinLength(1, { message: missing })),
});

const signInErrors = {
  InvalidCredentials: "That email and password don't match an account.",
  AccountSuspended: "This account is suspended. Ask your Examinus administrator.",
};

// Only send people back to pages in their own part of the app, never to another site.
function destination(role: Role, next: FormDataEntryValue | null) {
  const home = homeFor(role);
  return typeof next === "string" && (next === home || next.startsWith(`${home}/`)) ? next : home;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = parseForm(credentials, { email, password: formData.get("password") ?? "" });
  if (Result.isFailure(parsed)) return { error: parsed.failure, email };

  const result = await callApi((api) => api["auth.signInEmail"](parsed.success), forwardedHeaders(await headers()));
  if (Result.isFailure(result)) {
    const failure = result.failure;
    // The rate limit's message says how long to wait.
    return { error: failure._tag === "TooManyRequests" ? failure.message : signInErrors[failure._tag], email };
  }
  applyCookies(await cookies(), result.success.cookies);
  redirect(destination(result.success.user.role, formData.get("next")));
}

export async function loginWithGoogle(formData: FormData) {
  // The role isn't known until Google answers, so only area paths are passed on; the proxy fixes a wrong area.
  const next = formData.get("next");
  const callbackURL =
    typeof next === "string" && roleNames.some((r) => next === `/${r}` || next.startsWith(`/${r}/`)) ? next : "/";
  const result = await callApi(
    // Better Auth adds its own `error` code to the error URL.
    (api) => api["auth.signInGoogle"]({ callbackURL, errorCallbackURL: "/login?google=failed" }),
    forwardedHeaders(await headers()),
  );
  if (Result.isFailure(result)) {
    redirect(`/login?google=failed${result.failure._tag === "TooManyRequests" ? "&error=too_many_requests" : ""}`);
  }
  // Better Auth's OAuth state cookie; the callback comes back through /api/auth/* (next.config.ts).
  applyCookies(await cookies(), result.success.cookies);
  redirect(result.success.url);
}

export async function logout() {
  const result = await callApi((api) => api["auth.signOut"](), forwardedHeaders(await headers()));
  if (Result.isSuccess(result)) applyCookies(await cookies(), result.success.cookies);
  redirect("/login");
}

// Whether the browser's session is still valid, for open pages to notice a session that ended (expired, signed
// out in another tab, suspended or removed). Passes on Better Auth's refreshed cookie.
export async function sessionActive(): Promise<boolean> {
  const result = await callApi((api) => api["auth.session"](), forwardedHeaders(await headers()));
  if (Result.isFailure(result)) return false;
  applyCookies(await cookies(), result.success.cookies);
  return true;
}

// Signs out after too long without activity (components/session-watch.tsx).
export async function signOutIdle(next: string) {
  const result = await callApi((api) => api["auth.signOut"](), forwardedHeaders(await headers()));
  if (Result.isSuccess(result)) applyCookies(await cookies(), result.success.cookies);
  redirect(`/login?signedOut=idle${next.startsWith("/") ? `&next=${encodeURIComponent(next)}` : ""}`);
}

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

export const joinAsGuestAction = joinAsGuest;

// A guest signing out: back to /join, where another key (and name) can be entered.
export async function leaveAsGuest() {
  const result = await callApi((api) => api["auth.signOut"](), forwardedHeaders(await headers()));
  if (Result.isSuccess(result)) applyCookies(await cookies(), result.success.cookies);
  redirect("/join");
}

// What the avatar editor calls. Each one re-checks the role on the server.
export const getMyAvatarAction = getMyAvatar;
export const saveAvatarAction = saveAvatar;
