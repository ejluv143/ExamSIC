"use server";

import { redirect } from "next/navigation";
import { createSession, deleteSession } from "@/lib/auth/session";
import { demoGoogleUser, homeFor, verifyCredentials, type Role } from "@/lib/data/auth";

export type LoginState = { error: string; email: string } | undefined;

// Only send people back to pages in their own part of the app, never to another site.
function destination(role: Role, next: FormDataEntryValue | null) {
  const home = homeFor(role);
  return typeof next === "string" && (next === home || next.startsWith(`${home}/`)) ? next : home;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  const user = await verifyCredentials(email, password);
  if (!user) return { error: "That email and password don't match an account.", email };

  await createSession({ userId: user.id, role: user.role });
  redirect(destination(user.role, formData.get("next")));
}

export async function loginWithGoogle(formData: FormData) {
  // TODO: start Google OAuth through apps/api (same Google account as Classroom). Demo signs in the demo teacher.
  const user = await demoGoogleUser();
  await createSession({ userId: user.id, role: user.role });
  redirect(destination(user.role, formData.get("next")));
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
