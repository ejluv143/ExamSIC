import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getUser, homeFor, type Role, type User } from "../data/auth";
import { readSession } from "./session";

// Every data read goes through here, so pages stay protected even if the proxy redirect is skipped.
export const verifySession = cache(async () => {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
});

export const getCurrentUser = cache(async () => {
  const session = await verifySession();
  const user = await getUser(session.userId);
  if (!user) redirect("/login");
  return user;
});

// Signed in with the wrong role? Send them to their own home instead.
async function requireRole<R extends Role>(role: R): Promise<Extract<User, { role: R }>> {
  const user = await getCurrentUser();
  if (user.role !== role) redirect(homeFor(user.role));
  return user as Extract<User, { role: R }>;
}

export const requireTeacher = cache(() => requireRole("teacher"));
export const requireStudent = cache(() => requireRole("student"));
