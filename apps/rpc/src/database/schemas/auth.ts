// Better Auth tables (drizzle adapter with `usePlural: true`). Field names must match Better Auth's;
// column names are snake_case. `role`, `banned`, `banReason`, `banExpires` and `impersonatedBy` belong to
// the admin plugin, `isAnonymous` to the anonymous plugin, `activeOrganizationId` to the organization plugin;
// `department`, `plan`, `planExpiresAt`, `termsAcceptedAt` and `personalRole` are `user.additionalFields`
// (features/auth/BetterAuth.ts).
import type { Avatar } from "@examinus/domain/avatar";
import { personalRoleNames, planNames, platformRoleNames } from "@examinus/domain/roles";
import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps, timestamptz } from "./_helpers.ts";

// The platform role. Teaching and learning roles are organization memberships (organizations.ts).
export const userRole = pgEnum("user_role", platformRoleNames);
export const personalRole = pgEnum("personal_role", personalRoleNames);
export const plan = pgEnum("plan", planNames);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // Students and guests: the avatar they made (avatar.save); none draws the default one from their id.
    avatar: jsonb("avatar").$type<Avatar>(),
    role: userRole("role").notNull(),
    // What they are in their personal space (no active organization): chosen on sign-up; accounts admins make teach.
    personalRole: personalRole("personal_role").notNull().default("teacher"),
    // Teachers, optionally: shown under their name on the dashboard.
    department: text("department"),
    // Teachers: what they pay for. No end date means it doesn't end; after it, they're on the free plan.
    plan: plan("plan").notNull().default("free"),
    planExpiresAt: timestamptz("plan_expires_at"),
    // When they agreed to the Terms of Service and Privacy Policy on sign-up; none for accounts admins make.
    termsAcceptedAt: timestamptz("terms_accepted_at"),
    // Guests: an account made on /join with only a name (the anonymous plugin).
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: timestamptz("ban_expires"),
    ...timestamps,
  },
  (t) => [
    // Guests are anonymous accounts and nothing else; `role::text`: a migration that adds a role can't use the new
    // enum value in the same transaction (Postgres), but can compare its text.
    check(
      "users_role_profile_check",
      sql`case ${t.role}::text
        when 'guest' then ${t.department} is null and ${t.isAnonymous}
        else not ${t.isAnonymous}
      end`,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    expiresAt: timestamptz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    // Admin plugin: set while an admin impersonates the user (the admin role doesn't grant it).
    impersonatedBy: text("impersonated_by"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Organization plugin: the organization the session works in; none until the user picks or joins one. No
    // foreign key (organizations.ts imports this file); deleting an organization clears it.
    activeOrganizationId: text("active_organization_id"),
    ...timestamps,
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    // Password hash, for the "credential" provider only.
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    ...timestamps,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export type UserItem = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
