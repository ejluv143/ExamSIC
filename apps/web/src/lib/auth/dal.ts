import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result } from "effect";
import { can, homeFor, type Permissions, type Role, type SessionUser } from "@examora/contract";
import { callApi, forwardedHeaders } from "../api/client";

export type User = SessionUser;

// Every data read goes through here, so pages stay protected even if the proxy redirect is skipped.
// The API reads the session from the database each time, so bans, removals and role changes apply on the next request.
export const getCurrentUser = cache(async (): Promise<User> => {
  const user = await readCurrentUser();
  if (!user) redirect("/login");
  return user;
});

// For open pages that behave differently when someone is signed in: the user, or null.
export const readCurrentUser = cache(async (): Promise<User | null> => {
  const result = await callApi((api) => api["auth.session"](), forwardedHeaders(await headers()));
  return Result.isFailure(result) ? null : result.success.user;
});

// Signed in with the wrong role? Send them to their own home instead.
async function requireRole<R extends Role>(role: R): Promise<Extract<User, { role: R }>> {
  const user = await getCurrentUser();
  if (user.role !== role) redirect(homeFor(user.role));
  return user as Extract<User, { role: R }>;
}

export const requireAdmin = cache(() => requireRole("admin"));
export const requireTeacher = cache(() => requireRole("teacher"));
export const requireStudent = cache(() => requireRole("student"));

// Guests (anonymous players from /join). Without a session, /join is where to get one.
export const requireGuest = cache(async () => {
  const user = await readCurrentUser();
  if (!user) redirect("/join");
  if (user.role !== "guest") redirect(homeFor(user.role));
  return user;
});

// For operations: the role must grant every listed permission (packages/contract/src/permissions.ts).
export async function requirePermission(permissions: Permissions): Promise<User> {
  const user = await getCurrentUser();
  if (!can(user.role, permissions)) redirect(homeFor(user.role));
  return user;
}
