// Role-based access control: what each role may do. Shared by the API (Better Auth's admin plugin and
// the RPC handlers) and the web app (page and data-layer checks).
import { createAccessControl, type RoleAuthorizeRequest } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import type { Role } from "./roles.ts";

export const statements = {
  // Account management, as defined by Better Auth's admin plugin.
  ...defaultStatements,
  class: ["read"],
  // The students enrolled in a class.
  roster: ["read"],
  assessment: ["read", "create", "update", "delete"],
  questionBank: ["read"],
  submission: ["read", "grade"],
  // A student's own classes and standing.
  enrollment: ["read"],
  // A student's own attempts at a session, and their results.
  attempt: ["create", "read", "update"],
  // Running a quiz: creating a session, hosting it live, and reading its progress. Extends Better Auth's
  // admin-plugin `session` statement (list, revoke, delete), which the admin role uses for login sessions.
  session: [...defaultStatements.session, "create", "host", "read"],
  // Showing students their scores.
  result: ["release"],
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
    assessment: ["read", "create", "update", "delete"],
    questionBank: ["read"],
    submission: ["read", "grade"],
    session: ["create", "host", "read"],
    result: ["release"],
  }),
  student: ac.newRole({
    enrollment: ["read"],
    attempt: ["create", "read", "update"],
  }),
} satisfies Record<Role, unknown>;

export const can = (role: Role, permissions: Permissions) => roles[role].authorize(permissions).success;
