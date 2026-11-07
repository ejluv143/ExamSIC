import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import type { MemberItem, OrganizationInviteItem, OrganizationRoleItem } from "../../database/schemas/index.ts";
import { AppConfig } from "../../platform/AppConfig.ts";
import { harness, stub, testConfig } from "../../testing/config.ts";
import { Membership, type Caller } from "./Membership.ts";
import { OrganizationRepo, type MemberRow } from "./Repo.ts";

const org = "org-1";
const when = new Date("2026-01-01T00:00:00Z");

const owner: Caller = { id: "u-owner", organizationId: org, roles: ["owner", "teacher"] };
const admin: Caller = { id: "u-admin", organizationId: org, roles: ["admin"] };

// The organization's tables in memory: members with their accounts, invites, custom roles.
const setup = (options: { customRoles?: boolean; members?: Array<{ id: string; userId: string; role: string }> } = {}) => {
  const state = {
    members: (options.members ?? [
      { id: "m-owner", userId: "u-owner", role: "owner,teacher" },
      { id: "m-admin", userId: "u-admin", role: "admin" },
      { id: "m-ann", userId: "u-ann", role: "teacher" },
    ]).map((m): MemberRow => ({ ...m, organizationId: org, createdAt: when, name: m.userId, email: `${m.userId}@x.ph` })),
    invites: [] as OrganizationInviteItem[],
    roles: [] as OrganizationRoleItem[],
    accounts: new Map<string, { id: string; role: string }>([
      ["bo@x.ph", { id: "u-bo", role: "user" }],
      ["guest@x.ph", { id: "u-guest", role: "guest" }],
      ["ann@x.ph", { id: "u-ann", role: "user" }],
    ]),
    inviteUses: [] as string[],
    created: [] as Array<{ id: string; name: string; slug: string }>,
  };
  const repo = Layer.succeed(
    OrganizationRepo,
    stub<OrganizationRepo["Service"]>("OrganizationRepo", {
      insert: (row) => Effect.sync(() => void state.created.push(row)),
      members: () => Effect.sync(() => [...state.members]),
      member: (_org, id) => Effect.sync(() => state.members.find((m) => m.id === id) ?? null),
      memberOf: (organizationId, userId) =>
        Effect.sync(() => (state.members.find((m) => m.organizationId === organizationId && m.userId === userId) as MemberItem | undefined) ?? null),
      addMember: (organizationId, userId, roles) =>
        Effect.sync(() => {
          const row: MemberRow = { id: `m-${userId}`, userId, organizationId, role: roles.join(","), createdAt: when, name: userId, email: `${userId}@x.ph` };
          state.members.push(row);
          return row as MemberItem;
        }),
      setMemberRoles: (id, roles) =>
        Effect.sync(() => void (state.members.find((m) => m.id === id)!.role = roles.join(","))),
      removeMember: (id) => Effect.sync(() => void (state.members = state.members.filter((m) => m.id !== id))),
      userByEmail: (email) => Effect.sync(() => state.accounts.get(email) ?? null),
      insertInvite: (row) =>
        Effect.sync(() => {
          const invite: OrganizationInviteItem = {
            id: `inv-${state.invites.length}`,
            organizationId: row.organizationId,
            code: row.code,
            role: row.roles.join(","),
            expiresAt: row.expiresAt,
            uses: 0,
            createdBy: row.createdBy,
            createdAt: when,
          };
          state.invites.push(invite);
          return invite;
        }),
      inviteByCode: (code) => Effect.sync(() => state.invites.find((i) => i.code === code) ?? null),
      countInviteUse: (id) => Effect.sync(() => void state.inviteUses.push(id)),
      removeInvite: (organizationId, id) =>
        Effect.sync(() => {
          const before = state.invites.length;
          state.invites = state.invites.filter((i) => !(i.organizationId === organizationId && i.id === id));
          return state.invites.length < before;
        }),
      customRoles: () => Effect.sync(() => [...state.roles]),
      customRole: (_org, id) => Effect.sync(() => state.roles.find((r) => r.id === id) ?? null),
      insertCustomRole: (row) =>
        Effect.sync(() => {
          const role: OrganizationRoleItem = { id: `role-${state.roles.length}`, ...row, createdAt: when, updatedAt: when };
          state.roles.push(role);
          return role;
        }),
    }),
  );
  const config = Layer.effect(
    AppConfig,
    Effect.map(Effect.service(AppConfig), (base) => AppConfig.of({ ...base, organizations: { customRoles: options.customRoles ?? false } })),
  ).pipe(Layer.provide(testConfig));
  return { ...harness(Membership.layer.pipe(Layer.provide([repo, config]))), state };
};

const membership = Effect.service(Membership);
const rolesOf = (state: ReturnType<typeof setup>["state"], id: string) => state.members.find((m) => m.id === id)?.role;

describe("Membership owners", () => {
  test("the last owner can't be demoted or removed, even by themselves", async () => {
    const { fail, state } = setup();
    const demote = await fail(Effect.flatMap(membership, (m) => m.setMemberRoles(owner, "m-owner", ["teacher"])));
    expect(demote).toMatchObject({ _tag: "Conflict", message: "An organization needs at least one owner." });
    const remove = await fail(Effect.flatMap(membership, (m) => m.removeMember(owner, "m-owner")));
    expect(remove._tag).toBe("Conflict");
    expect(rolesOf(state, "m-owner")).toBe("owner,teacher");
  });

  test("with a second owner either can step down, and then the remaining one is protected", async () => {
    const { run, fail, state } = setup();
    await run(Effect.flatMap(membership, (m) => m.setMemberRoles(owner, "m-ann", ["owner"])));
    await run(Effect.flatMap(membership, (m) => m.setMemberRoles(owner, "m-owner", ["teacher"])));
    expect(rolesOf(state, "m-owner")).toBe("teacher");
    const ann: Caller = { id: "u-ann", organizationId: org, roles: ["owner"] };
    expect((await fail(Effect.flatMap(membership, (m) => m.removeMember(ann, "m-ann"))))._tag).toBe("Conflict");
  });

  test("only an owner gives, takes or removes the owner role", async () => {
    const { fail, state } = setup();
    expect((await fail(Effect.flatMap(membership, (m) => m.setMemberRoles(admin, "m-ann", ["owner"]))))._tag).toBe("Forbidden");
    expect((await fail(Effect.flatMap(membership, (m) => m.removeMember(admin, "m-owner"))))._tag).toBe("Forbidden");
    expect((await fail(Effect.flatMap(membership, (m) => m.addMember(admin, "bo@x.ph", ["owner"]))))._tag).toBe("Forbidden");
    expect((await fail(Effect.flatMap(membership, (m) => m.createInvite(admin, ["owner"], 7))))._tag).toBe("Forbidden");
    expect(rolesOf(state, "m-ann")).toBe("teacher");
  });

  test("an admin may change other roles, and keeping the owner role as it is needs no owner", async () => {
    const { run, state } = setup();
    await run(Effect.flatMap(membership, (m) => m.setMemberRoles(admin, "m-ann", ["student"])));
    await run(Effect.flatMap(membership, (m) => m.setMemberRoles(admin, "m-owner", ["owner", "admin"])));
    expect(rolesOf(state, "m-ann")).toBe("student");
    expect(rolesOf(state, "m-owner")).toBe("owner,admin");
  });

  test("a member who isn't in the organization is NotFound", async () => {
    const { fail } = setup();
    expect((await fail(Effect.flatMap(membership, (m) => m.removeMember(owner, "m-none"))))._tag).toBe("NotFound");
    expect((await fail(Effect.flatMap(membership, (m) => m.setMemberRoles(owner, "m-none", ["teacher"]))))._tag).toBe("NotFound");
  });

  test("a new organization starts with its maker as owner and teacher", async () => {
    const { run, state } = setup({ members: [] });
    const id = await run(Effect.flatMap(membership, (m) => m.create("u-new", "Acme")));
    expect(state.created).toEqual([{ id, name: "Acme", slug: id }]);
    expect(state.members).toHaveLength(1);
    expect(state.members[0]).toMatchObject({ userId: "u-new", role: "owner,teacher" });
  });
});

describe("Membership roles and adding", () => {
  test("unknown roles are refused; the fixed ones are always known", async () => {
    const { run, fail } = setup();
    const err = await fail(Effect.flatMap(membership, (m) => m.setMemberRoles(owner, "m-ann", ["wizard"])));
    expect(err).toMatchObject({ _tag: "Conflict", message: '"wizard" isn\'t a role in this organization.' });
    await run(Effect.flatMap(membership, (m) => m.setMemberRoles(owner, "m-ann", ["student", "admin"])));
  });

  test("a custom role counts as known only while custom roles are on", async () => {
    const on = setup({ customRoles: true });
    await on.run(Effect.flatMap(membership, (m) => m.createRole(org, "grader", {})));
    await on.run(Effect.flatMap(membership, (m) => m.setMemberRoles(owner, "m-ann", ["grader"])));
    expect(rolesOf(on.state, "m-ann")).toBe("grader");
    const off = setup({ customRoles: false });
    off.state.roles.push({ id: "r", organizationId: org, role: "grader", permission: "{}", createdAt: when, updatedAt: when });
    expect((await off.fail(Effect.flatMap(membership, (m) => m.setMemberRoles(owner, "m-ann", ["grader"]))))._tag).toBe("Conflict");
  });

  test("custom roles are Forbidden when off; names can't repeat a built-in or an existing role", async () => {
    const off = setup();
    expect((await off.fail(Effect.flatMap(membership, (m) => m.roles(org))))._tag).toBe("Forbidden");
    expect((await off.fail(Effect.flatMap(membership, (m) => m.createRole(org, "x", {}))))._tag).toBe("Forbidden");
    const on = setup({ customRoles: true });
    expect((await on.fail(Effect.flatMap(membership, (m) => m.createRole(org, "admin", {}))))._tag).toBe("Conflict");
    await on.run(Effect.flatMap(membership, (m) => m.createRole(org, "grader", {})));
    expect((await on.fail(Effect.flatMap(membership, (m) => m.createRole(org, "grader", {}))))._tag).toBe("Conflict");
    expect((await on.fail(Effect.flatMap(membership, (m) => m.updateRole(org, "missing", {}))))._tag).toBe("NotFound");
    expect((await on.fail(Effect.flatMap(membership, (m) => m.deleteRole(org, "missing", ))))._tag).toBe("NotFound");
  });

  test("adding by email trims and lowercases; no account, a guest or an existing member are refused", async () => {
    const { run, fail, state } = setup();
    const added = await run(Effect.flatMap(membership, (m) => m.addMember(owner, "  Bo@X.ph ", ["student"])));
    expect(added).toMatchObject({ userId: "u-bo", roles: ["student"] });
    expect(rolesOf(state, "m-u-bo")).toBe("student");
    expect((await fail(Effect.flatMap(membership, (m) => m.addMember(owner, "nobody@x.ph", ["student"]))))._tag).toBe("NotFound");
    expect((await fail(Effect.flatMap(membership, (m) => m.addMember(owner, "guest@x.ph", ["student"]))))._tag).toBe("NotFound");
    expect((await fail(Effect.flatMap(membership, (m) => m.addMember(owner, "ann@x.ph", ["student"]))))._tag).toBe("Conflict");
  });
});

describe("Membership invites", () => {
  test("an invite code expires after the days asked for and carries its roles", async () => {
    const { run } = setup();
    const before = Date.now();
    const invite = await run(Effect.flatMap(membership, (m) => m.createInvite(owner, ["student"], 3)));
    expect(invite.roles).toEqual(["student"]);
    expect(invite.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const expires = Date.parse(invite.expiresAt);
    expect(expires - before).toBeGreaterThanOrEqual(3 * 86_400_000);
    expect(expires - Date.now()).toBeLessThanOrEqual(3 * 86_400_000);
  });

  test("redeeming a code (any case, padded) joins with the code's roles and counts one use", async () => {
    const { run, state } = setup();
    const invite = await run(Effect.flatMap(membership, (m) => m.createInvite(owner, ["student"], 3)));
    const joined = await run(Effect.flatMap(membership, (m) => m.redeemInvite("u-bo", ` ${invite.code.toLowerCase()} `)));
    expect(joined).toBe(org);
    expect(rolesOf(state, "m-u-bo")).toBe("student");
    expect(state.inviteUses).toEqual([state.invites[0]!.id]);
  });

  test("a member using a code keeps their roles and the use isn't counted", async () => {
    const { run, state } = setup();
    const invite = await run(Effect.flatMap(membership, (m) => m.createInvite(owner, ["student"], 3)));
    await run(Effect.flatMap(membership, (m) => m.redeemInvite("u-ann", invite.code)));
    expect(rolesOf(state, "m-ann")).toBe("teacher");
    expect(state.inviteUses).toEqual([]);
  });

  test("an unknown or expired code is NotFound and adds nobody", async () => {
    const { fail, state } = setup();
    const before = state.members.length;
    expect((await fail(Effect.flatMap(membership, (m) => m.redeemInvite("u-bo", "NOPE2222"))))._tag).toBe("NotFound");
    expect(state.members).toHaveLength(before);
  });

  test("revoking an invite of another organization or a missing one is NotFound", async () => {
    const { run, fail, state } = setup();
    const invite = await run(Effect.flatMap(membership, (m) => m.createInvite(owner, ["student"], 3)));
    expect((await fail(Effect.flatMap(membership, (m) => m.revokeInvite("org-2", invite.id))))._tag).toBe("NotFound");
    await run(Effect.flatMap(membership, (m) => m.revokeInvite(org, invite.id)));
    expect(state.invites).toEqual([]);
  });
});
