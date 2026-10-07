// Role-based access control: what each role may do. Better Auth's admin plugin enforces the
// `user` and `session` statements on its own endpoints; the data layer checks the rest with
// `requirePermission` (src/lib/auth/dal.ts).
import { createAccessControl, type RoleAuthorizeRequest } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import type { Role } from "./roles";

export const statements = {
  // Account management, as defined by Better Auth's admin plugin.
  ...defaultStatements,
  class: ["read"],
  // The students enrolled in a class.
  roster: ["read"],
  assessment: ["read", "create", "update"],
  questionBank: ["read"],
  submission: ["read", "grade"],
  // A student's own classes and standing.
  enrollment: ["read"],
  // A student's own attempts at an assessment, and their results.
  attempt: ["create", "read"],
} as const;

export type Permissions = RoleAuthorizeRequest<typeof statements>;

export const ac = createAccessControl(statements);

export const roles = {
  // Runs the system; no teaching or exam-taking access, and no impersonation.
  admin: ac.newRole({
    user: ["create", "list", "get", "update", "set-role", "set-email", "set-password", "ban", "delete"],
    session: ["list", "revoke", "delete"],
  }),
  teacher: ac.newRole({
    class: ["read"],
    roster: ["read"],
    assessment: ["read", "create", "update"],
    questionBank: ["read"],
    submission: ["read", "grade"],
  }),
  student: ac.newRole({
    enrollment: ["read"],
    attempt: ["create", "read"],
  }),
} satisfies Record<Role, unknown>;

export const can = (role: Role, permissions: Permissions) => roles[role].authorize(permissions).success;
