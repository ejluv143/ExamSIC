// Organizations (schools, departments) and who belongs to them. `organizations`, `members`, `invitations` and
// `organization_roles` are Better Auth's organization plugin tables (drizzle adapter with `usePlural: true`; field
// names must match the plugin's). Every root record (class, quiz, bank question, asset, AI key, roster entry) belongs
// to one organization; a request runs in the session's active one (sessions.active_organization_id).
import { index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { newId } from "../../platform/ids.ts";
import { createdAt, timestamps, timestamptz } from "./_helpers.ts";
import { users } from "./auth.ts";

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: createdAt(),
});

// A user's membership. `role` is comma-separated: a member can hold several roles (e.g. "admin,teacher"), fixed
// ones (packages/domain/src/roles.ts) and the organization's own (organization_roles).
export const members = pgTable(
  "members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("members_organization_user_unique").on(t.organizationId, t.userId),
    index("members_user_id_idx").on(t.userId),
  ],
);

// The plugin's email invitations. Not used (there is no email sender; invite codes below are what's used), but
// the plugin expects the table.
export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamptz("expires_at").notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_organization_id_idx").on(t.organizationId), index("invitations_email_idx").on(t.email)],
);

// A role an organization defined itself (Better Auth's dynamic access control, on with ORG_CUSTOM_ROLES).
// `permission` is JSON: statement resource to allowed actions (packages/domain/src/permissions.ts).
export const organizationRoles = pgTable(
  "organization_roles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    permission: text("permission").notNull(),
    ...timestamps,
  },
  (t) => [unique("organization_roles_organization_role_unique").on(t.organizationId, t.role), index("organization_roles_role_idx").on(t.role)],
);

// A code that joins whoever enters it with these roles, until it expires or is revoked. Like class join codes,
// because there is no email sender.
export const organizationInvites = pgTable(
  "organization_invites",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId("oinv")),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    // Comma-separated, like members.role.
    role: text("role").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    uses: integer("uses").notNull().default(0),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("organization_invites_organization_id_idx").on(t.organizationId)],
);

export type OrganizationItem = typeof organizations.$inferSelect;
export type MemberItem = typeof members.$inferSelect;
export type OrganizationRoleItem = typeof organizationRoles.$inferSelect;
export type OrganizationInviteItem = typeof organizationInvites.$inferSelect;
