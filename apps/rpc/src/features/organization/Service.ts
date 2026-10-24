// Organizations: creating and switching, members, invite codes and custom roles.
import type { CustomRole, InviteCode, OrgMember } from "@examinus/contract/organization";
import { Conflict, Forbidden, NotFound } from "@examinus/contract/errors";
import { isOrgRole, parseMemberRoles } from "@examinus/domain/roles";
import type { Grants } from "@examinus/domain/user";
import { randomInt } from "node:crypto";
import { Context, Effect, Layer, Option } from "effect";
import type { Headers as EffectHeaders } from "effect/http";
import type { OrganizationInviteItem, OrganizationRoleItem } from "../../database/schemas/index.ts";
import { AppConfig } from "../../platform/AppConfig.ts";
import { newId } from "../../platform/ids.ts";
import { limits, RateLimiter } from "../../platform/RateLimiter.ts";
import { BetterAuth } from "../auth/BetterAuth.ts";
import { readSession, webHeaders } from "../auth/Session.ts";
import { OrganizationRepo, type MemberRow } from "./Repo.ts";

// The signed-in user making a change in their active organization, with their roles there.
export type Caller = { readonly id: string; readonly organizationId: string; readonly roles: readonly string[] };

const inviteAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newInviteCode = () => Array.from({ length: 8 }, () => inviteAlphabet[randomInt(inviteAlphabet.length)]).join("");

const day = 86_400_000;

const toMember = (row: MemberRow): OrgMember => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  email: row.email,
  roles: parseMemberRoles(row.role),
  joinedAt: row.createdAt.toISOString(),
});

const toInvite = (row: OrganizationInviteItem): InviteCode => ({
  id: row.id,
  code: row.code,
  roles: parseMemberRoles(row.role),
  expiresAt: row.expiresAt.toISOString(),
  uses: row.uses,
  createdAt: row.createdAt.toISOString(),
});

const toRole = (row: OrganizationRoleItem): CustomRole => ({
  id: row.id,
  name: row.role,
  permissions: JSON.parse(row.permission) as Grants,
});

const make = Effect.gen(function* () {
  const repo = yield* OrganizationRepo;
  const auth = yield* BetterAuth;
  const config = yield* AppConfig;
  const limiter = yield* RateLimiter;
  const withContext = <A, E>(effect: Effect.Effect<A, E, BetterAuth | OrganizationRepo | AppConfig>) =>
    effect.pipe(
      Effect.provideService(BetterAuth, auth),
      Effect.provideService(OrganizationRepo, repo),
      Effect.provideService(AppConfig, config),
    );

  // Makes the organization the session's active one (Better Auth checks the membership too; null: the personal
  // space), and returns the user as the session now sees them.
  const activate = Effect.fn("OrganizationService.activate")(function* (organizationId: string | null, headers: EffectHeaders.Headers) {
    yield* auth
      .call((api) => api.setActiveOrganization({ headers: webHeaders(headers), body: { organizationId } }))
      .pipe(Effect.orDie);
    return yield* sessionUser(headers);
  });

  const sessionUser = Effect.fn("OrganizationService.sessionUser")(function* (headers: EffectHeaders.Headers) {
    const session = yield* withContext(readSession(headers));
    if (Option.isNone(session)) return yield* Effect.die("The session disappeared while changing organizations.");
    return session.value.user;
  });

  // The fixed roles and, when custom roles are on, the organization's own.
  const checkRoles = Effect.fn("OrganizationService.checkRoles")(function* (organizationId: string, roles: readonly string[]) {
    const custom = config.organizations.customRoles ? new Set((yield* repo.customRoles(organizationId)).map((r) => r.role)) : new Set<string>();
    const unknown = roles.find((r) => !isOrgRole(r) && !custom.has(r));
    if (unknown) return yield* new Conflict({ message: `"${unknown}" isn't a role in this organization.` });
  });

  const mayGrant = (caller: Caller, roles: readonly string[]) =>
    !roles.includes("owner") || caller.roles.includes("owner")
      ? Effect.void
      : Effect.fail(new Forbidden({ message: "Only an owner can give or take the owner role." }));

  const ownerCount = (organizationId: string) =>
    repo.members(organizationId).pipe(Effect.map((rows) => rows.filter((m) => parseMemberRoles(m.role).includes("owner")).length));

  const ensureCustomRoles = config.organizations.customRoles
    ? Effect.void
    : Effect.fail(new Forbidden({ message: "Custom roles are off on this server." }));

  const roleByName = Effect.fn("OrganizationService.checkRoleName")(function* (organizationId: string, name: string) {
    if (isOrgRole(name)) return yield* new Conflict({ message: `"${name}" is a built-in role.` });
    if ((yield* repo.customRoles(organizationId)).some((r) => r.role === name))
      return yield* new Conflict({ message: `A role named "${name}" already exists.` });
  });

  return {
    create: Effect.fn("OrganizationService.create")(function* (userId: string, name: string, headers: EffectHeaders.Headers) {
      const id = newId("org");
      yield* repo.insert({ id, name, slug: id });
      yield* repo.addMember(id, userId, ["owner", "teacher"]);
      return yield* activate(id, headers);
    }),

    setActive: Effect.fn("OrganizationService.setActive")(function* (userId: string, organizationId: string | null, headers: EffectHeaders.Headers) {
      if (organizationId !== null && !(yield* repo.memberOf(organizationId, userId)))
        return yield* new NotFound({ message: "You're not a member of that organization." });
      return yield* activate(organizationId, headers);
    }),

    update: (caller: Caller, name: string) => repo.rename(caller.organizationId, name),

    // Deleting removes everything in it; the deleter's session is left with no active organization.
    remove: Effect.fn("OrganizationService.remove")(function* (caller: Caller, headers: EffectHeaders.Headers) {
      yield* repo.remove(caller.organizationId);
      return yield* sessionUser(headers);
    }),

    members: (organizationId: string) => repo.members(organizationId).pipe(Effect.map((rows) => rows.map(toMember))),

    addMember: Effect.fn("OrganizationService.addMember")(function* (caller: Caller, email: string, roles: readonly string[]) {
      yield* mayGrant(caller, roles);
      yield* checkRoles(caller.organizationId, roles);
      const account = yield* repo.userByEmail(email.trim().toLowerCase());
      if (!account || account.role === "guest") return yield* new NotFound({ message: "No account uses that email." });
      if (yield* repo.memberOf(caller.organizationId, account.id)) return yield* new Conflict({ message: "That account is already a member." });
      const added = yield* repo.addMember(caller.organizationId, account.id, roles);
      const row = yield* repo.member(caller.organizationId, added.id);
      return toMember(row!);
    }),

    setMemberRoles: Effect.fn("OrganizationService.setMemberRoles")(function* (caller: Caller, memberId: string, roles: readonly string[]) {
      const target = yield* repo.member(caller.organizationId, memberId);
      if (!target) return yield* new NotFound({ message: "That member isn't in this organization." });
      const before = parseMemberRoles(target.role);
      const wasOwner = before.includes("owner");
      const becomesOwner = roles.includes("owner");
      if (wasOwner !== becomesOwner) yield* mayGrant(caller, ["owner"]);
      yield* checkRoles(caller.organizationId, roles);
      if (wasOwner && !becomesOwner && (yield* ownerCount(caller.organizationId)) <= 1)
        return yield* new Conflict({ message: "An organization needs at least one owner." });
      yield* repo.setMemberRoles(memberId, roles);
    }),

    removeMember: Effect.fn("OrganizationService.removeMember")(function* (caller: Caller, memberId: string) {
      const target = yield* repo.member(caller.organizationId, memberId);
      if (!target) return yield* new NotFound({ message: "That member isn't in this organization." });
      if (parseMemberRoles(target.role).includes("owner")) {
        yield* mayGrant(caller, ["owner"]);
        if ((yield* ownerCount(caller.organizationId)) <= 1) return yield* new Conflict({ message: "An organization needs at least one owner." });
      }
      yield* repo.removeMember(memberId);
    }),

    invites: (organizationId: string) => repo.invites(organizationId).pipe(Effect.map((rows) => rows.map(toInvite))),

    createInvite: Effect.fn("OrganizationService.createInvite")(function* (caller: Caller, roles: readonly string[], expiresInDays: number) {
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

    revokeInvite: Effect.fn("OrganizationService.revokeInvite")(function* (organizationId: string, inviteId: string) {
      if (!(yield* repo.removeInvite(organizationId, inviteId))) return yield* new NotFound({ message: "That invite code doesn't exist." });
    }),

    // Only wrong codes count, to slow guessing.
    joinWithCode: Effect.fn("OrganizationService.joinWithCode")(function* (userId: string, code: string, headers: EffectHeaders.Headers) {
      yield* limiter.check(limits.joinCode, userId);
      const invite = yield* repo.inviteByCode(code.trim().toUpperCase());
      if (!invite) {
        yield* limiter.count(limits.joinCode, userId);
        return yield* new NotFound({ message: "No invite uses that code, or it has expired." });
      }
      const alreadyIn = yield* repo.memberOf(invite.organizationId, userId);
      if (!alreadyIn) {
        yield* repo.addMember(invite.organizationId, userId, parseMemberRoles(invite.role));
        yield* repo.countInviteUse(invite.id);
      }
      return yield* activate(invite.organizationId, headers);
    }),

    roles: Effect.fn("OrganizationService.roles")(function* (organizationId: string) {
      yield* ensureCustomRoles;
      return (yield* repo.customRoles(organizationId)).map(toRole);
    }),

    createRole: Effect.fn("OrganizationService.createRole")(function* (organizationId: string, name: string, permissions: Grants) {
      yield* ensureCustomRoles;
      yield* roleByName(organizationId, name);
      return toRole(yield* repo.insertCustomRole({ organizationId, role: name, permission: JSON.stringify(permissions) }));
    }),

    updateRole: Effect.fn("OrganizationService.updateRole")(function* (organizationId: string, roleId: string, permissions: Grants) {
      yield* ensureCustomRoles;
      if (!(yield* repo.customRole(organizationId, roleId))) return yield* new NotFound({ message: "That role doesn't exist." });
      yield* repo.updateCustomRole(roleId, JSON.stringify(permissions));
    }),

    deleteRole: Effect.fn("OrganizationService.deleteRole")(function* (organizationId: string, roleId: string) {
      yield* ensureCustomRoles;
      if (!(yield* repo.customRole(organizationId, roleId))) return yield* new NotFound({ message: "That role doesn't exist." });
      yield* repo.removeCustomRole(roleId);
    }),
  };
});

export class OrganizationService extends Context.Service<OrganizationService, Effect.Success<typeof make>>()(
  "examinus/api/OrganizationService",
) {
  static readonly layer = Layer.effect(OrganizationService, make);
}
