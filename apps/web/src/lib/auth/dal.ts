import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { can, type Permissions } from "./permissions";
import { homeFor, type Role, type User } from "./roles";
import { auth } from "./server";

// Every data read goes through here, so pages stay protected even if the proxy redirect is skipped.
// There's no session cookie cache, so bans, removals and role changes apply on the next request.
export const getCurrentUser = cache(async (): Promise<User> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const { id, name, email, role, department, studentId } = session.user;
  // The users_role_profile_check constraint guarantees these; the checks narrow the type.
  if (role === "admin") return { id, role, name, email };
  if (role === "teacher" && department) return { id, role, name, email, department };
  if (role === "student" && studentId) return { id, role, name, email, studentId };
  throw new Error(`User ${id} has an invalid role or profile (${role}).`);
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

// For operations: the role must grant every listed permission (src/lib/auth/permissions.ts).
export async function requirePermission(permissions: Permissions): Promise<User> {
  const user = await getCurrentUser();
  if (!can(user.role, permissions)) redirect(homeFor(user.role));
  return user;
}

