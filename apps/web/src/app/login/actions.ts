"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { homeFor, isRole, roleNames, type Role } from "@/lib/auth/roles";
import { auth } from "@/lib/auth/server";

export type LoginState = { error: string; email: string } | undefined;

const missing = "Enter your email and password.";
const credentials = z.object({
  email: z.string().trim().min(1, missing).pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, missing),
});

// Only send people back to pages in their own part of the app, never to another site.
function destination(role: Role, next: FormDataEntryValue | null) {
  const home = homeFor(role);
  return typeof next === "string" && (next === home || next.startsWith(`${home}/`)) ? next : home;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = credentials.safeParse({ email, password: formData.get("password") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  let role: unknown;
  try {
    const { user } = await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
    role = user.role;
  } catch (e) {
    if (e instanceof APIError && e.status === "UNAUTHORIZED") {
      return { error: "That email and password don't match an account.", email };
    }
    // The admin plugin refuses banned users.
    if (e instanceof APIError && e.status === "FORBIDDEN") {
      return { error: "This account is suspended. Ask your Examora administrator.", email };
    }
    if (e instanceof APIError && e.status === "TOO_MANY_REQUESTS") {
      return { error: "Too many sign-in attempts. Wait a minute and try again.", email };
    }
    throw e;
  }
  if (!isRole(role)) throw new Error(`Signed-in user has an unknown role: ${String(role)}`);
  redirect(destination(role, formData.get("next")));
}

export async function loginWithGoogle(formData: FormData) {
  // The role isn't known until Google answers, so only area paths are passed on; the proxy fixes a wrong area.
  const next = formData.get("next");
  const callbackURL =
    typeof next === "string" && roleNames.some((r) => next === `/${r}` || next.startsWith(`/${r}/`)) ? next : "/";
  const { url } = await auth.api.signInSocial({
    body: { provider: "google", callbackURL, errorCallbackURL: "/login?error=google" },
    headers: await headers(),
  });
  if (!url) throw new Error("Better Auth returned no Google authorization URL.");
  redirect(url);
}

export async function logout() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
