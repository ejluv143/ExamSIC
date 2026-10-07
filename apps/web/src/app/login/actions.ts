"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result } from "effect";
import { z } from "zod";
import { homeFor, roleNames, type Role } from "@examora/contract";
import { applyCookies, callApi, forwardedHeaders } from "@/lib/api/client";

export type LoginState = { error: string; email: string } | undefined;

const missing = "Enter your email and password.";
const credentials = z.object({
  email: z.string().trim().min(1, missing).pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, missing),
});

const signInErrors = {
  InvalidCredentials: "That email and password don't match an account.",
  AccountSuspended: "This account is suspended. Ask your Examora administrator.",
  AccountPending: "Your account is waiting for an administrator to approve it. Try again once it's approved.",
  TooManyRequests: "Too many sign-in attempts. Wait a minute and try again.",
};

// Only send people back to pages in their own part of the app, never to another site.
function destination(role: Role, next: FormDataEntryValue | null) {
  const home = homeFor(role);
  return typeof next === "string" && (next === home || next.startsWith(`${home}/`)) ? next : home;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = credentials.safeParse({ email, password: formData.get("password") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const result = await callApi((api) => api["auth.signInEmail"](parsed.data), forwardedHeaders(await headers()));
  if (Result.isFailure(result)) return { error: signInErrors[result.failure._tag], email };
  applyCookies(await cookies(), result.success.cookies);
  redirect(destination(result.success.user.role, formData.get("next")));
}

export async function loginWithGoogle(formData: FormData) {
  // The role isn't known until Google answers, so only area paths are passed on; the proxy fixes a wrong area.
  const next = formData.get("next");
  const callbackURL =
    typeof next === "string" && roleNames.some((r) => next === `/${r}` || next.startsWith(`/${r}/`)) ? next : "/";
  const result = await callApi(
    (api) => api["auth.signInGoogle"]({ callbackURL, errorCallbackURL: "/login?error=google" }),
    forwardedHeaders(await headers()),
  );
  if (Result.isFailure(result)) redirect("/login?error=google");
  // Better Auth's OAuth state cookie; the callback comes back through /api/auth/* (next.config.ts).
  applyCookies(await cookies(), result.success.cookies);
  redirect(result.success.url);
}

export async function logout() {
  const result = await callApi((api) => api["auth.signOut"](), forwardedHeaders(await headers()));
  if (Result.isSuccess(result)) applyCookies(await cookies(), result.success.cookies);
  redirect("/login");
}
