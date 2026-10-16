import { Forbidden } from "@examinus/contract/errors";
import { CurrentUser } from "@examinus/contract/middleware";
import { OrganizationRpcs } from "@examinus/contract/organization";
import { Effect } from "effect";
import { requireOrgPermission } from "../auth/Session.ts";
import { OrganizationService, type Caller } from "./Service.ts";

// Guests have no organizations; every other account may create and join them.
const requireAccount = Effect.fn("requireAccount")(function* () {
  const user = yield* CurrentUser;
  if (user.role === "guest") return yield* new Forbidden({ message: "Sign in with an account to use organizations." });
  return user;
});

const callerOf = ({ id, organization }: { id: string; organization: { id: string; roles: readonly string[] } }): Caller => ({
  id,
  organizationId: organization.id,
  roles: organization.roles,
});

export const OrganizationHandlers = OrganizationRpcs.toLayer(
  Effect.gen(function* () {
    const orgs = yield* OrganizationService;

    return OrganizationRpcs.of({
      "org.create": Effect.fn("org.create")(function* ({ name }, { headers }) {
        const user = yield* requireAccount();
        return yield* orgs.create(user.id, name, headers);
      }),

      "org.setActive": Effect.fn("org.setActive")(function* ({ organizationId }, { headers }) {
        const user = yield* CurrentUser;
        return yield* orgs.setActive(user.id, organizationId, headers);
      }),

      "org.update": Effect.fn("org.update")(function* ({ name }) {
        const me = yield* requireOrgPermission({ organization: ["update"] });
        yield* orgs.update(callerOf(me), name);
      }),

      "org.delete": Effect.fn("org.delete")(function* (_, { headers }) {
        const me = yield* requireOrgPermission({ organization: ["delete"] });
        return yield* orgs.remove(callerOf(me), headers);
      }),

      "org.members": Effect.fn("org.members")(function* () {
        const me = yield* requireOrgPermission({ organization: ["update"] });
        return yield* orgs.members(me.actor.organizationId);
      }),

      "org.addMember": Effect.fn("org.addMember")(function* ({ email, roles }) {
        const me = yield* requireOrgPermission({ member: ["create"] });
        return yield* orgs.addMember(callerOf(me), email, roles);
      }),

      "org.setMemberRoles": Effect.fn("org.setMemberRoles")(function* ({ memberId, roles }) {
        const me = yield* requireOrgPermission({ member: ["update"] });
        yield* orgs.setMemberRoles(callerOf(me), memberId, roles);
      }),

      "org.removeMember": Effect.fn("org.removeMember")(function* ({ memberId }) {
        const me = yield* requireOrgPermission({ member: ["delete"] });
        yield* orgs.removeMember(callerOf(me), memberId);
      }),

      "org.invites": Effect.fn("org.invites")(function* () {
        const me = yield* requireOrgPermission({ invitation: ["create"] });
        return yield* orgs.invites(me.actor.organizationId);
      }),

      "org.createInvite": Effect.fn("org.createInvite")(function* ({ roles, expiresInDays }) {
        const me = yield* requireOrgPermission({ invitation: ["create"] });
        return yield* orgs.createInvite(callerOf(me), roles, expiresInDays);
      }),

      "org.revokeInvite": Effect.fn("org.revokeInvite")(function* ({ inviteId }) {
        const me = yield* requireOrgPermission({ invitation: ["cancel"] });
        yield* orgs.revokeInvite(me.actor.organizationId, inviteId);
      }),

      "org.joinWithCode": Effect.fn("org.joinWithCode")(function* ({ code }, { headers }) {
        const user = yield* requireAccount();
        return yield* orgs.joinWithCode(user.id, code, headers);
      }),

      "org.roles": Effect.fn("org.roles")(function* () {
        const me = yield* requireOrgPermission({ ac: ["read"] });
        return yield* orgs.roles(me.actor.organizationId);
      }),

      "org.createRole": Effect.fn("org.createRole")(function* ({ name, permissions }) {
        const me = yield* requireOrgPermission({ ac: ["create"] });
        return yield* orgs.createRole(me.actor.organizationId, name, permissions);
      }),

      "org.updateRole": Effect.fn("org.updateRole")(function* ({ roleId, permissions }) {
        const me = yield* requireOrgPermission({ ac: ["update"] });
        yield* orgs.updateRole(me.actor.organizationId, roleId, permissions);
      }),

      "org.deleteRole": Effect.fn("org.deleteRole")(function* ({ roleId }) {
        const me = yield* requireOrgPermission({ ac: ["delete"] });
        yield* orgs.deleteRole(me.actor.organizationId, roleId);
      }),
    });
  }),
);
