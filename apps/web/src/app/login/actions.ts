"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result, Schema } from "effect";
import { homeFor, roleNames, type Role } from "@examora/contract";
import { applyCookies, callApi, forwardedHeaders } from "@/lib/api/client";
import { emailPattern, parseForm } from "@/lib/validate";

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
