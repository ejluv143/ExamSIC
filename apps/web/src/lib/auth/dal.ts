import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Result } from "effect";
import { can, type Permissions } from "@examinus/domain/permissions";
import { homeFor, roleOf, type Role } from "@examinus/domain/roles";
import { type ActiveOrganization, type SessionUser } from "@examinus/domain/user";
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

// Signed in with the wrong role? Send them to their own home instead (the organization picker without an
// active organization).
async function requireRole(role: Role): Promise<User> {
  const user = await getCurrentUser();
  const actual = roleOf(user);
  if (actual !== role) redirect(homeFor(actual));
  return user;
}

export const requireAdmin = cache(() => requireRole("admin"));
export const requireTeacher = cache(() => requireRole("teacher"));
export const requireStudent = cache(() => requireRole("student"));

// For pages that need the active organization itself (its id or name): a member with one.
export const requireOrg = cache(async (): Promise<{ user: User; organization: ActiveOrganization }> => {
  const user = await getCurrentUser();
  if (!user.organization) redirect(homeFor(roleOf(user)));
  return { user, organization: user.organization };
});

// Guests (anonymous players from /join). Without a session, /join is where to get one.
export const requireGuest = cache(async () => {
  const user = await readCurrentUser();
  if (!user) redirect("/join");
  if (user.role !== "guest") redirect(homeFor(roleOf(user)));
  return user;
});

// For operations: the user's roles must grant every listed permission (packages/domain/src/permissions.ts).
export async function requirePermission(permissions: Permissions): Promise<User> {
  const user = await getCurrentUser();
  if (user.role === "user" && !user.organization) redirect("/organizations");
  if (!can(user, permissions)) redirect(homeFor(roleOf(user)));
  return user;
}
