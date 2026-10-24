import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Grants, Membership, SessionUser } from "@examinus/domain/user";
import { Conflict, Forbidden, NotFound, TooManyRequests } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";

// A member's roles: the fixed ones (owner, admin, teacher, student) and the organization's own.
export const MemberRoles = Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1));

export const OrgMember = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  name: Schema.String,
  email: Schema.String,
  roles: Schema.Array(Schema.String),
  joinedAt: Schema.String,
});
export type OrgMember = typeof OrgMember.Type;

// A code that lets whoever has it join with these roles, until it expires or is revoked.
export const InviteCode = Schema.Struct({
  id: Schema.String,
  code: Schema.String,
  roles: Schema.Array(Schema.String),
  expiresAt: Schema.String,
  uses: Schema.Number,
  createdAt: Schema.String,
});
export type InviteCode = typeof InviteCode.Type;

// A role the organization defined itself (Better Auth's dynamic access control). Only when the API has
// ORG_CUSTOM_ROLES on (auth.config says).
export const CustomRole = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  permissions: Grants,
});
export type CustomRole = typeof CustomRole.Type;

const RoleName = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]{1,30}$/));

// Organizations: the ones the signed-in user belongs to and which is active, and managing the active one.
export class OrganizationRpcs extends RpcGroup.make(
  // Makes an organization with the signed-in user as its owner (and a teacher), and makes it active.
  Rpc.make("create", {
    payload: { name: Schema.Trim.check(Schema.isMinLength(2), Schema.isMaxLength(80)) },
    success: SessionUser,
    error: Schema.Union([Forbidden, Conflict]),
  }),
  // Switches the organization the session works in; null: the user's personal space. NotFound unless the user is a
  // member of it.
  Rpc.make("setActive", { payload: { organizationId: Schema.NullOr(Schema.String) }, success: SessionUser, error: NotFound }),
  Rpc.make("update", {
    payload: { name: Schema.Trim.check(Schema.isMinLength(2), Schema.isMaxLength(80)) },
    error: Forbidden,
  }),
  // Owners only. Deletes the organization and everything in it (classes, quizzes, sessions, attempts, roster, keys);
  // sessions that were working in it are left with none. Returns the session user as it is afterwards.
  Rpc.make("delete", { success: SessionUser, error: Forbidden }),
  Rpc.make("members", { success: Schema.Array(OrgMember), error: Forbidden }),
  // Adds an existing account by email. NotFound: no account with that email; Conflict: already a member.
  Rpc.make("addMember", {
    payload: { email: Schema.String, roles: MemberRoles },
    success: OrgMember,
    error: Schema.Union([Forbidden, NotFound, Conflict]),
  }),
  // Conflict: an unknown role, or the change would leave the organization without an owner.
  Rpc.make("setMemberRoles", {
    payload: { memberId: Schema.String, roles: MemberRoles },
    error: Schema.Union([Forbidden, NotFound, Conflict]),
  }),
  Rpc.make("removeMember", { payload: { memberId: Schema.String }, error: Schema.Union([Forbidden, NotFound, Conflict]) }),
  Rpc.make("invites", { success: Schema.Array(InviteCode), error: Forbidden }),
  Rpc.make("createInvite", {
    payload: { roles: MemberRoles, expiresInDays: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 90 })) },
    success: InviteCode,
    error: Schema.Union([Forbidden, Conflict]),
  }),
  Rpc.make("revokeInvite", { payload: { inviteId: Schema.String }, error: Schema.Union([Forbidden, NotFound]) }),
  // Joins the organization an invite code is for, with the code's roles, and makes it active. A member already
  // just switches to it. NotFound: no such code, or it expired. Forbidden: guests.
  Rpc.make("joinWithCode", {
    payload: { code: Schema.String },
    success: SessionUser,
    error: Schema.Union([Forbidden, NotFound, TooManyRequests]),
  }),
  // Custom roles. Forbidden when ORG_CUSTOM_ROLES is off.
  Rpc.make("roles", { success: Schema.Array(CustomRole), error: Forbidden }),
  // Conflict: the name is a fixed role's or already taken.
  Rpc.make("createRole", {
    payload: { name: RoleName, permissions: Grants },
    success: CustomRole,
    error: Schema.Union([Forbidden, Conflict]),
  }),
  Rpc.make("updateRole", { payload: { roleId: Schema.String, permissions: Grants }, error: Schema.Union([Forbidden, NotFound]) }),
  // Members holding the role lose it.
  Rpc.make("deleteRole", { payload: { roleId: Schema.String }, error: Schema.Union([Forbidden, NotFound]) }),
)
  .prefix("org.")
  .middleware(AuthMiddleware) {}

export { Membership };
