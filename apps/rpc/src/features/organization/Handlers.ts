import { Forbidden } from "@examinus/contract/errors";
import { CurrentUser } from "@examinus/contract/middleware";
import { OrganizationRpcs } from "@examinus/contract/organization";
import { Effect } from "effect";
import { requireOrganization } from "../auth/Session.ts";
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
        const me = yield* requireOrganization({ organization: ["update"] });
        yield* orgs.update(callerOf(me), name);
      }),

      "org.delete": Effect.fn("org.delete")(function* (_, { headers }) {
        const me = yield* requireOrganization({ organization: ["delete"] });
        return yield* orgs.remove(callerOf(me), headers);
      }),

      "org.members": Effect.fn("org.members")(function* () {
        const me = yield* requireOrganization({ organization: ["update"] });
        return yield* orgs.members(me.organization.id);
      }),

      "org.addMember": Effect.fn("org.addMember")(function* ({ email, roles }) {
        const me = yield* requireOrganization({ member: ["create"] });
        return yield* orgs.addMember(callerOf(me), email, roles);
      }),

      "org.setMemberRoles": Effect.fn("org.setMemberRoles")(function* ({ memberId, roles }) {
        const me = yield* requireOrganization({ member: ["update"] });
        yield* orgs.setMemberRoles(callerOf(me), memberId, roles);
      }),

      "org.removeMember": Effect.fn("org.removeMember")(function* ({ memberId }) {
        const me = yield* requireOrganization({ member: ["delete"] });
        yield* orgs.removeMember(callerOf(me), memberId);
      }),

      "org.invites": Effect.fn("org.invites")(function* () {
        const me = yield* requireOrganization({ invitation: ["create"] });
        return yield* orgs.invites(me.organization.id);
      }),

      "org.createInvite": Effect.fn("org.createInvite")(function* ({ roles, expiresInDays }) {
        const me = yield* requireOrganization({ invitation: ["create"] });
        return yield* orgs.createInvite(callerOf(me), roles, expiresInDays);
      }),

      "org.revokeInvite": Effect.fn("org.revokeInvite")(function* ({ inviteId }) {
        const me = yield* requireOrganization({ invitation: ["cancel"] });
        yield* orgs.revokeInvite(me.organization.id, inviteId);
      }),

      "org.joinWithCode": Effect.fn("org.joinWithCode")(function* ({ code }, { headers }) {
        const user = yield* requireAccount();
        return yield* orgs.joinWithCode(user.id, code, headers);
      }),

      "org.roles": Effect.fn("org.roles")(function* () {
        const me = yield* requireOrganization({ ac: ["read"] });
        return yield* orgs.roles(me.organization.id);
      }),

      "org.createRole": Effect.fn("org.createRole")(function* ({ name, permissions }) {
        const me = yield* requireOrganization({ ac: ["create"] });
        return yield* orgs.createRole(me.organization.id, name, permissions);
      }),

      "org.updateRole": Effect.fn("org.updateRole")(function* ({ roleId, permissions }) {
        const me = yield* requireOrganization({ ac: ["update"] });
        yield* orgs.updateRole(me.organization.id, roleId, permissions);
      }),

      "org.deleteRole": Effect.fn("org.deleteRole")(function* ({ roleId }) {
        const me = yield* requireOrganization({ ac: ["delete"] });
        yield* orgs.deleteRole(me.organization.id, roleId);
      }),
    });
  }),
);
