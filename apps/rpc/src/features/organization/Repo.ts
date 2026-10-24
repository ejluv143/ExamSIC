// Organizations, memberships, invite codes and custom roles, as stored.
import { type Membership } from "@examinus/domain/user";
import { joinMemberRoles, parseMemberRoles } from "@examinus/domain/roles";
import { and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { newId } from "../../platform/ids.ts";
import { Database } from "../../platform/Database.ts";
import {
  members,
  organizationInvites,
  organizationRoles,
  organizations,
  sessions,
  users,
  type MemberItem,
  type OrganizationInviteItem,
  type OrganizationItem,
  type OrganizationRoleItem,
} from "../../database/schemas/index.ts";

export type MemberRow = MemberItem & { name: string; email: string };

export class OrganizationRepo extends Context.Service<
  OrganizationRepo,
  {
    // The organizations the user belongs to, with their roles there, by name.
    readonly membershipsOf: (userId: string) => Effect.Effect<Membership[]>;
    // Points the session at this organization (null: the personal space). Better Auth's own endpoint does the same
    // with a session; this is for one known only by its token.
    readonly setActive: (sessionToken: string, organizationId: string | null) => Effect.Effect<void>;
    // The organization the session points at (null: the personal space), for the one just made at sign-in.
    readonly activeOf: (sessionToken: string) => Effect.Effect<string | null>;
    readonly find: (organizationId: string) => Effect.Effect<OrganizationItem | null>;
    readonly insert: (row: { id: string; name: string; slug: string }) => Effect.Effect<void>;
    readonly rename: (organizationId: string, name: string) => Effect.Effect<void>;
    // Deleting cascades to the organization's content; sessions that were working in it are left with none.
    readonly remove: (organizationId: string) => Effect.Effect<void>;
    // The organization's members with their accounts, in joining order.
    readonly members: (organizationId: string) => Effect.Effect<MemberRow[]>;
    readonly member: (organizationId: string, memberId: string) => Effect.Effect<MemberRow | null>;
    readonly memberOf: (organizationId: string, userId: string) => Effect.Effect<MemberItem | null>;
    // Makes the user a member with these roles; a member already gets the roles added. Returns the member.
    readonly addMember: (organizationId: string, userId: string, roles: readonly string[]) => Effect.Effect<MemberItem>;
    readonly setMemberRoles: (memberId: string, roles: readonly string[]) => Effect.Effect<void>;
    readonly removeMember: (memberId: string) => Effect.Effect<void>;
    readonly userByEmail: (lowerEmail: string) => Effect.Effect<{ id: string; role: string } | null>;
    readonly invites: (organizationId: string) => Effect.Effect<OrganizationInviteItem[]>;
    readonly insertInvite: (row: {
      organizationId: string;
      code: string;
      roles: readonly string[];
      expiresAt: Date;
      createdBy: string;
    }) => Effect.Effect<OrganizationInviteItem>;
    readonly removeInvite: (organizationId: string, inviteId: string) => Effect.Effect<boolean>;
    // A code that hasn't expired, with its organization.
    readonly inviteByCode: (code: string) => Effect.Effect<OrganizationInviteItem | null>;
    readonly countInviteUse: (inviteId: string) => Effect.Effect<void>;
    // The organization's own roles (Better Auth's organization_roles).
    readonly customRoles: (organizationId: string) => Effect.Effect<OrganizationRoleItem[]>;
    readonly customRole: (organizationId: string, roleId: string) => Effect.Effect<OrganizationRoleItem | null>;
    readonly insertCustomRole: (row: { organizationId: string; role: string; permission: string }) => Effect.Effect<OrganizationRoleItem>;
    readonly updateCustomRole: (roleId: string, permission: string) => Effect.Effect<void>;
    readonly removeCustomRole: (roleId: string) => Effect.Effect<void>;
  }
>()("examinus/api/OrganizationRepo") {
  static readonly layer = Layer.effect(
    OrganizationRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      const memberColumns = { ...getTableColumns(members), name: users.name, email: users.email };
      return OrganizationRepo.of({
        membershipsOf: Effect.fn("OrganizationRepo.membershipsOf")(function* (userId) {
          const rows = yield* db.query((d) =>
            d
              .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, role: members.role })
              .from(members)
              .innerJoin(organizations, eq(organizations.id, members.organizationId))
              .where(eq(members.userId, userId))
              .orderBy(asc(organizations.name)),
          );
          return rows.map(({ role, ...org }) => ({ ...org, roles: parseMemberRoles(role) }));
        }),
        setActive: Effect.fn("OrganizationRepo.setActive")(function* (sessionToken, organizationId) {
          yield* db.query((d) => d.update(sessions).set({ activeOrganizationId: organizationId }).where(eq(sessions.token, sessionToken)));
        }),
        activeOf: Effect.fn("OrganizationRepo.activeOf")(function* (sessionToken) {
          const [row] = yield* db.query((d) =>
            d.select({ activeOrganizationId: sessions.activeOrganizationId }).from(sessions).where(eq(sessions.token, sessionToken)),
          );
          return row?.activeOrganizationId ?? null;
        }),
        find: Effect.fn("OrganizationRepo.find")(function* (organizationId) {
          const [row] = yield* db.query((d) => d.select().from(organizations).where(eq(organizations.id, organizationId)));
          return row ?? null;
        }),
        insert: Effect.fn("OrganizationRepo.insert")(function* (row) {
          yield* db.query((d) => d.insert(organizations).values(row));
        }),
        rename: Effect.fn("OrganizationRepo.rename")(function* (organizationId, name) {
          yield* db.query((d) => d.update(organizations).set({ name }).where(eq(organizations.id, organizationId)));
        }),
        remove: Effect.fn("OrganizationRepo.remove")(function* (organizationId) {
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              await tx.update(sessions).set({ activeOrganizationId: null }).where(eq(sessions.activeOrganizationId, organizationId));
              await tx.delete(organizations).where(eq(organizations.id, organizationId));
            }),
          );
        }),
        members: Effect.fn("OrganizationRepo.members")(function* (organizationId) {
          return yield* db.query((d) =>
            d
              .select(memberColumns)
              .from(members)
              .innerJoin(users, eq(users.id, members.userId))
              .where(eq(members.organizationId, organizationId))
              .orderBy(asc(members.createdAt)),
          );
        }),
        member: Effect.fn("OrganizationRepo.member")(function* (organizationId, memberId) {
          const [row] = yield* db.query((d) =>
            d
              .select(memberColumns)
              .from(members)
              .innerJoin(users, eq(users.id, members.userId))
              .where(and(eq(members.organizationId, organizationId), eq(members.id, memberId))),
          );
          return row ?? null;
        }),
        memberOf: Effect.fn("OrganizationRepo.memberOf")(function* (organizationId, userId) {
          const [row] = yield* db.query((d) =>
            d
              .select()
              .from(members)
              .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId))),
          );
          return row ?? null;
        }),
        addMember: Effect.fn("OrganizationRepo.addMember")(function* (organizationId, userId, roles) {
          return yield* db.query((d) =>
            d.transaction(async (tx) => {
              const [existing] = await tx
                .select()
                .from(members)
                .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)));
              if (existing) {
                const role = joinMemberRoles([...parseMemberRoles(existing.role), ...roles]);
                if (role === existing.role) return existing;
                const [updated] = await tx.update(members).set({ role }).where(eq(members.id, existing.id)).returning();
                return updated!;
              }
              const [inserted] = await tx
                .insert(members)
                .values({ id: newId("mem"), organizationId, userId, role: joinMemberRoles(roles) })
                .returning();
              return inserted!;
            }),
          );
        }),
        setMemberRoles: Effect.fn("OrganizationRepo.setMemberRoles")(function* (memberId, roles) {
          yield* db.query((d) => d.update(members).set({ role: joinMemberRoles(roles) }).where(eq(members.id, memberId)));
        }),
        removeMember: Effect.fn("OrganizationRepo.removeMember")(function* (memberId) {
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              const [gone] = await tx.delete(members).where(eq(members.id, memberId)).returning();
              if (!gone) return;
              // Their sessions stop working in it.
              await tx
                .update(sessions)
                .set({ activeOrganizationId: null })
                .where(and(eq(sessions.userId, gone.userId), eq(sessions.activeOrganizationId, gone.organizationId)));
            }),
          );
        }),
        userByEmail: Effect.fn("OrganizationRepo.userByEmail")(function* (lowerEmail) {
          const [row] = yield* db.query((d) =>
            d
              .select({ id: users.id, role: users.role })
              .from(users)
              .where(eq(sql`lower(${users.email})`, lowerEmail)),
          );
          return row ?? null;
        }),
        invites: Effect.fn("OrganizationRepo.invites")(function* (organizationId) {
          return yield* db.query((d) =>
            d
              .select()
              .from(organizationInvites)
              .where(eq(organizationInvites.organizationId, organizationId))
              .orderBy(asc(organizationInvites.createdAt)),
          );
        }),
        insertInvite: Effect.fn("OrganizationRepo.insertInvite")(function* ({ roles, ...row }) {
          const [inserted] = yield* db.query((d) =>
            d
              .insert(organizationInvites)
              .values({ ...row, role: joinMemberRoles(roles) })
              .returning(),
          );
          return inserted!;
        }),
        removeInvite: Effect.fn("OrganizationRepo.removeInvite")(function* (organizationId, inviteId) {
          const gone = yield* db.query((d) =>
            d
              .delete(organizationInvites)
              .where(and(eq(organizationInvites.organizationId, organizationId), eq(organizationInvites.id, inviteId)))
              .returning({ id: organizationInvites.id }),
          );
          return gone.length > 0;
        }),
        inviteByCode: Effect.fn("OrganizationRepo.inviteByCode")(function* (code) {
          const [row] = yield* db.query((d) =>
            d
              .select()
              .from(organizationInvites)
              .where(and(eq(organizationInvites.code, code), sql`${organizationInvites.expiresAt} > now()`)),
          );
          return row ?? null;
        }),
        countInviteUse: Effect.fn("OrganizationRepo.countInviteUse")(function* (inviteId) {
          yield* db.query((d) =>
            d
              .update(organizationInvites)
              .set({ uses: sql`${organizationInvites.uses} + 1` })
              .where(eq(organizationInvites.id, inviteId)),
          );
        }),
        customRoles: Effect.fn("OrganizationRepo.customRoles")(function* (organizationId) {
          return yield* db.query((d) =>
            d
              .select()
              .from(organizationRoles)
              .where(eq(organizationRoles.organizationId, organizationId))
              .orderBy(asc(organizationRoles.role)),
          );
        }),
        customRole: Effect.fn("OrganizationRepo.customRole")(function* (organizationId, roleId) {
          const [row] = yield* db.query((d) =>
            d
              .select()
              .from(organizationRoles)
              .where(and(eq(organizationRoles.organizationId, organizationId), eq(organizationRoles.id, roleId))),
          );
          return row ?? null;
        }),
        insertCustomRole: Effect.fn("OrganizationRepo.insertCustomRole")(function* (row) {
          const [inserted] = yield* db.query((d) =>
            d
              .insert(organizationRoles)
              .values({ id: newId("orole"), ...row })
              .returning(),
          );
          return inserted!;
        }),
        updateCustomRole: Effect.fn("OrganizationRepo.updateCustomRole")(function* (roleId, permission) {
          yield* db.query((d) => d.update(organizationRoles).set({ permission }).where(eq(organizationRoles.id, roleId)));
        }),
        removeCustomRole: Effect.fn("OrganizationRepo.removeCustomRole")(function* (roleId) {
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              const [gone] = await tx.delete(organizationRoles).where(eq(organizationRoles.id, roleId)).returning();
              if (!gone) return;
              // Members holding the role lose it.
              const holders = await tx.select().from(members).where(eq(members.organizationId, gone.organizationId));
              for (const holder of holders) {
                const roles = parseMemberRoles(holder.role);
                if (!roles.includes(gone.role)) continue;
                await tx
                  .update(members)
                  .set({ role: joinMemberRoles(roles.filter((r) => r !== gone.role)) })
                  .where(eq(members.id, holder.id));
              }
            }),
          );
        }),
      });
    }),
  );
}
