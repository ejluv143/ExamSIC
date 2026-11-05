// Who belongs to an organization and what they may do there: members and their roles, invite codes, custom roles.
// The rules live here (an organization keeps an owner, only owners hand out ownership, roles must exist, a code is
// good until it expires); the session side of joining and switching is OrganizationService's.
import type { CustomRole, InviteCode, OrgMember } from "@examinus/contract/organization";
import { Conflict, Forbidden, NotFound } from "@examinus/contract/errors";
import { isOrgRole, parseMemberRoles } from "@examinus/domain/roles";
import type { Grants } from "@examinus/domain/user";
import { randomInt } from "node:crypto";
import { Context, Effect, Layer } from "effect";
import { AppConfig } from "../../platform/AppConfig.ts";
import { newId } from "../../platform/ids.ts";
import { toInvite, toMember, toRole } from "./mappers.ts";
import { OrganizationRepo } from "./Repo.ts";

// The signed-in user making a change in their active organization, with their roles there.
export type Caller = { readonly id: string; readonly organizationId: string; readonly roles: readonly string[] };

const inviteAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newInviteCode = () => Array.from({ length: 8 }, () => inviteAlphabet[randomInt(inviteAlphabet.length)]).join("");

const day = 86_400_000;

const lastOwner = () => new Conflict({ message: "An organization needs at least one owner." });

export class Membership extends Context.Service<
  Membership,
  {
    // A new organization, with the user as its owner (and teacher). Returns its id.
    readonly create: (userId: string, name: string) => Effect.Effect<string>;
    readonly rename: (caller: Caller, name: string) => Effect.Effect<void>;
    // Deleting removes everything in it.
    readonly remove: (caller: Caller) => Effect.Effect<void>;
    readonly members: (organizationId: string) => Effect.Effect<OrgMember[]>;
    // Adds the account with this email. NotFound for no account or a guest, Conflict when already a member.
    readonly addMember: (caller: Caller, email: string, roles: readonly string[]) => Effect.Effect<OrgMember, NotFound | Conflict | Forbidden>;
    readonly setMemberRoles: (caller: Caller, memberId: string, roles: readonly string[]) => Effect.Effect<void, NotFound | Conflict | Forbidden>;
    readonly removeMember: (caller: Caller, memberId: string) => Effect.Effect<void, NotFound | Conflict | Forbidden>;
    readonly invites: (organizationId: string) => Effect.Effect<InviteCode[]>;
    readonly createInvite: (caller: Caller, roles: readonly string[], expiresInDays: number) => Effect.Effect<InviteCode, Conflict | Forbidden>;
    readonly revokeInvite: (organizationId: string, inviteId: string) => Effect.Effect<void, NotFound>;
    // Uses a code for the user: they become a member with the code's roles (a member already in keeps theirs, and the
    // use isn't counted). Returns the organization. NotFound for a code that doesn't exist or has expired.
    readonly redeemInvite: (userId: string, code: string) => Effect.Effect<string, NotFound>;
    readonly roles: (organizationId: string) => Effect.Effect<CustomRole[], Forbidden>;
    readonly createRole: (organizationId: string, name: string, permissions: Grants) => Effect.Effect<CustomRole, Conflict | Forbidden>;
    readonly updateRole: (organizationId: string, roleId: string, permissions: Grants) => Effect.Effect<void, NotFound | Forbidden>;
    readonly deleteRole: (organizationId: string, roleId: string) => Effect.Effect<void, NotFound | Forbidden>;
  }
>()("examinus/api/Membership") {
  static readonly layer = Layer.effect(
    Membership,
    Effect.gen(function* () {
      const repo = yield* OrganizationRepo;
      const { organizations } = yield* AppConfig;

      // The fixed roles and, when custom roles are on, the organization's own.
      const checkRoles = Effect.fn("Membership.checkRoles")(function* (organizationId: string, roles: readonly string[]) {
        const custom = organizations.customRoles ? new Set((yield* repo.customRoles(organizationId)).map((r) => r.role)) : new Set<string>();
        const unknown = roles.find((r) => !isOrgRole(r) && !custom.has(r));
        if (unknown) return yield* new Conflict({ message: `"${unknown}" isn't a role in this organization.` });
      });

      // Only an owner can give or take the owner role.
      const mayGrant = (caller: Caller, roles: readonly string[]) =>
        !roles.includes("owner") || caller.roles.includes("owner")
          ? Effect.void
          : Effect.fail(new Forbidden({ message: "Only an owner can give or take the owner role." }));

      const ownerCount = (organizationId: string) =>
        repo.members(organizationId).pipe(Effect.map((rows) => rows.filter((m) => parseMemberRoles(m.role).includes("owner")).length));

      const ensureCustomRoles = organizations.customRoles
        ? Effect.void
        : Effect.fail(new Forbidden({ message: "Custom roles are off on this server." }));

      const checkRoleName = Effect.fn("Membership.checkRoleName")(function* (organizationId: string, name: string) {
        if (isOrgRole(name)) return yield* new Conflict({ message: `"${name}" is a built-in role.` });
        if ((yield* repo.customRoles(organizationId)).some((r) => r.role === name))
          return yield* new Conflict({ message: `A role named "${name}" already exists.` });
      });

      return Membership.of({
        create: Effect.fn("Membership.create")(function* (userId, name) {
          const id = newId("org");
          yield* repo.insert({ id, name, slug: id });
          yield* repo.addMember(id, userId, ["owner", "teacher"]);
          return id;
        }),

        rename: (caller, name) => repo.rename(caller.organizationId, name),

        remove: (caller) => repo.remove(caller.organizationId),

        members: (organizationId) => repo.members(organizationId).pipe(Effect.map((rows) => rows.map(toMember))),

        addMember: Effect.fn("Membership.addMember")(function* (caller, email, roles) {
          yield* mayGrant(caller, roles);
          yield* checkRoles(caller.organizationId, roles);
          const account = yield* repo.userByEmail(email.trim().toLowerCase());
          if (!account || account.role === "guest") return yield* new NotFound({ message: "No account uses that email." });
          if (yield* repo.memberOf(caller.organizationId, account.id)) return yield* new Conflict({ message: "That account is already a member." });
          const added = yield* repo.addMember(caller.organizationId, account.id, roles);
          const row = yield* repo.member(caller.organizationId, added.id);
          return toMember(row!);
        }),

        setMemberRoles: Effect.fn("Membership.setMemberRoles")(function* (caller, memberId, roles) {
          const target = yield* repo.member(caller.organizationId, memberId);
          if (!target) return yield* new NotFound({ message: "That member isn't in this organization." });
          const wasOwner = parseMemberRoles(target.role).includes("owner");
          const becomesOwner = roles.includes("owner");
          if (wasOwner !== becomesOwner) yield* mayGrant(caller, ["owner"]);
          yield* checkRoles(caller.organizationId, roles);
          if (wasOwner && !becomesOwner && (yield* ownerCount(caller.organizationId)) <= 1) return yield* lastOwner();
          yield* repo.setMemberRoles(memberId, roles);
        }),

        removeMember: Effect.fn("Membership.removeMember")(function* (caller, memberId) {
          const target = yield* repo.member(caller.organizationId, memberId);
          if (!target) return yield* new NotFound({ message: "That member isn't in this organization." });
          if (parseMemberRoles(target.role).includes("owner")) {
            yield* mayGrant(caller, ["owner"]);
            if ((yield* ownerCount(caller.organizationId)) <= 1) return yield* lastOwner();
          }
          yield* repo.removeMember(memberId);
        }),

        invites: (organizationId) => repo.invites(organizationId).pipe(Effect.map((rows) => rows.map(toInvite))),

        createInvite: Effect.fn("Membership.createInvite")(function* (caller, roles, expiresInDays) {
          yield* mayGrant(caller, roles);
          yield* checkRoles(caller.organizationId, roles);
          const row = yield* repo.insertInvite({
            organizationId: caller.organizationId,
            code: newInviteCode(),
            roles,
            expiresAt: new Date(Date.now() + expiresInDays * day),
            createdBy: caller.id,
          });
          return toInvite(row);
        }),

        revokeInvite: Effect.fn("Membership.revokeInvite")(function* (organizationId, inviteId) {
          if (!(yield* repo.removeInvite(organizationId, inviteId))) return yield* new NotFound({ message: "That invite code doesn't exist." });
        }),

        redeemInvite: Effect.fn("Membership.redeemInvite")(function* (userId, code) {
          const invite = yield* repo.inviteByCode(code.trim().toUpperCase());
          if (!invite) return yield* new NotFound({ message: "No invite uses that code, or it has expired." });
          if (!(yield* repo.memberOf(invite.organizationId, userId))) {
            yield* repo.addMember(invite.organizationId, userId, parseMemberRoles(invite.role));
            yield* repo.countInviteUse(invite.id);
          }
          return invite.organizationId;
        }),

        roles: Effect.fn("Membership.roles")(function* (organizationId) {
          yield* ensureCustomRoles;
          return (yield* repo.customRoles(organizationId)).map(toRole);
        }),

        createRole: Effect.fn("Membership.createRole")(function* (organizationId, name, permissions) {
          yield* ensureCustomRoles;
          yield* checkRoleName(organizationId, name);
          return toRole(yield* repo.insertCustomRole({ organizationId, role: name, permission: JSON.stringify(permissions) }));
        }),

        updateRole: Effect.fn("Membership.updateRole")(function* (organizationId, roleId, permissions) {
          yield* ensureCustomRoles;
          if (!(yield* repo.customRole(organizationId, roleId))) return yield* new NotFound({ message: "That role doesn't exist." });
          yield* repo.updateCustomRole(roleId, JSON.stringify(permissions));
        }),

        deleteRole: Effect.fn("Membership.deleteRole")(function* (organizationId, roleId) {
          yield* ensureCustomRoles;
          if (!(yield* repo.customRole(organizationId, roleId))) return yield* new NotFound({ message: "That role doesn't exist." });
          yield* repo.removeCustomRole(roleId);
        }),
      });
    }),
  );
}
