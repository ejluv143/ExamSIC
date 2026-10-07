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
  const result = await callApi((api) => api["auth.session"](), forwardedHeaders(await headers()));
  if (Result.isFailure(result)) redirect("/login");
  return result.success.user;
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

// For operations: the role must grant every listed permission (packages/contract/src/permissions.ts).
export async function requirePermission(permissions: Permissions): Promise<User> {
  const user = await getCurrentUser();
  if (!can(user.role, permissions)) redirect(homeFor(user.role));
  return user;
}
