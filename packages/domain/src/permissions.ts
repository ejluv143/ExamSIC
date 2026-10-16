// Role-based access control: what each role may do. Shared by the API (Better Auth's admin and organization
// plugins, and the RPC handlers) and the web app (page and data-layer checks).
//
// Platform roles (`users.role`) and organization roles (`members.role`) are checked against the same statements.
// An organization's fixed roles are below; an organization may add roles of its own (Better Auth's dynamic access
// control, `organization_roles`), whose statements the API merges into the session's `organization.permissions`.
import { createAccessControl, type RoleAuthorizeRequest, type RoleStatements } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import { defaultStatements as orgDefaultStatements } from "better-auth/plugins/organization/access";
import type { OrgRole, PlatformRole } from "./roles.ts";

export const statements = {
  // Account management, as defined by Better Auth's admin plugin.
  ...defaultStatements,
  // Organization management, as defined by Better Auth's organization plugin (`ac` is its custom roles).
  ...orgDefaultStatements,
  class: ["read", "create", "update", "delete"],
  // The students enrolled in a class.
  roster: ["read", "update"],
  // Class meetings and their roll calls.
  attendance: ["read", "update"],
  // Class records (grade books).
  classRecord: ["read", "update"],
  assessment: ["read", "create", "update", "delete"],
  questionBank: ["read", "create", "update", "delete", "share"],
  submission: ["read", "grade"],
  // A student's own classes and standing, and joining or leaving a class.
  enrollment: ["read", "create", "delete"],
  // A student's own attempts at a session, and their results.
  attempt: ["create", "read", "update"],
  // Running a quiz: creating a session, hosting it live, and reading its progress. Extends Better Auth's
  // admin-plugin `session` statement (list, revoke, delete), which the platform admin uses for login sessions.
  session: [...defaultStatements.session, "create", "host", "read"],
  // Showing students their scores.
  result: ["release"],
  // Images: uploading them and reading their signed URLs.
  asset: ["create", "read"],
  // AI help: `use` drafts questions and suggests essay scores with the organization's API keys; `configure`
  // manages those keys.
  ai: ["use", "configure"],
  // A player's own avatar.
  avatar: ["update"],
} as const;

export type Statements = typeof statements;
export type Permissions = RoleAuthorizeRequest<Statements>;
// A subset of the statements, as stored for a custom role and carried in the session.
export type Grants = RoleStatements<Statements>;

export const ac = createAccessControl(statements);

const teaching = {
  class: ["read", "create", "update", "delete"],
  roster: ["read", "update"],
  attendance: ["read", "update"],
  classRecord: ["read", "update"],
  assessment: ["read", "create", "update", "delete"],
  questionBank: ["read", "create", "update", "delete", "share"],
  submission: ["read", "grade"],
  session: ["create", "host", "read"],
  result: ["release"],
  asset: ["create", "read"],
  ai: ["use"],
} as const satisfies Grants;

const learning = {
  enrollment: ["read", "create", "delete"],
  attempt: ["create", "read", "update"],
  asset: ["create", "read"],
  avatar: ["update"],
} as const satisfies Grants;

// Managing the organization: its members, invite codes, custom roles, settings and AI keys.
const managing = {
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  ac: ["create", "read", "update", "delete"],
  ai: ["use", "configure"],
} as const satisfies Grants;

// The statements each organization role grants. What it can do, it can do with the organization's content only:
// every handler also filters by the active organization.
export const orgGrants: Record<OrgRole, Grants> = {
  // Everything an admin can, plus deleting the organization.
  owner: { ...teaching, ...managing, organization: ["update", "delete"] },
  // Members, settings and AI keys, and the teacher's permissions so the organization's content can be read.
  admin: { ...teaching, ...managing },
  teacher: teaching,
  student: learning,
};

export const orgRoles = {
  owner: ac.newRole(orgGrants.owner),
  admin: ac.newRole(orgGrants.admin),
  teacher: ac.newRole(orgGrants.teacher),
  student: ac.newRole(orgGrants.student),
};

export const platformRoles = {
  // Runs the platform: accounts and login sessions; no teaching or exam-taking access, and no impersonation.
  admin: ac.newRole({
    user: ["create", "list", "get", "update", "set-role", "set-email", "set-password", "ban", "delete"],
    session: ["list", "revoke", "delete"],
  }),
  // A real account; what it may do comes from its roles in the active organization.
  user: ac.newRole({}),
  // Anonymous players: their own attempts, pictures and avatar, nothing about classes.
  guest: ac.newRole({
    attempt: ["create", "read", "update"],
    asset: ["create", "read"],
    avatar: ["update"],
  }),
} satisfies Record<PlatformRole, unknown>;

// The statements a member's roles grant together, fixed roles and the organization's own.
export const grantsOf = (
  roles: readonly string[],
  custom: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {},
): Record<string, readonly string[]> => {
  const merged: Record<string, string[]> = {};
  for (const role of roles) {
    const grants: Readonly<Record<string, readonly string[]>> | undefined =
      role in orgGrants ? orgGrants[role as OrgRole] : custom[role];
    if (!grants) continue;
    for (const [resource, actions] of Object.entries(grants)) {
      merged[resource] = [...new Set([...(merged[resource] ?? []), ...actions])];
    }
  }
  return merged;
};

// Who is asking: their platform role and, if an organization is active, what their roles there grant.
export type Principal = {
  readonly role: PlatformRole;
  readonly organization: { readonly permissions: Readonly<Record<string, readonly string[]>> } | null;
};

// Platform admins and guests are judged by their platform role; everyone else by their active organization.
export const can = (who: Principal, permissions: Permissions) => {
  if (who.role !== "user") return platformRoles[who.role].authorize(permissions).success;
  if (!who.organization) return false;
  return ac.newRole(who.organization.permissions as Grants).authorize(permissions).success;
};
