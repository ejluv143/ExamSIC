// Better Auth tables (drizzle adapter with `usePlural: true`). Field names must match Better Auth's;
// column names are snake_case. `role`, `banned`, `banReason`, `banExpires` and `impersonatedBy` belong to
// the admin plugin; `department` and `studentId` are `user.additionalFields` (src/lib/auth/server.ts).
import { sql } from "drizzle-orm";
import { boolean, check, index, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { roleNames } from "../../lib/auth/roles";
import { timestamps, timestamptz } from "./_helpers";

export const userRole = pgEnum("user_role", roleNames);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: userRole("role").notNull(),
    // Teachers: shown under their name on the dashboard.
    department: text("department"),
    // Students: the class-roster id this account signs in as.
    studentId: text("student_id").unique(),
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: timestamptz("ban_expires"),
    ...timestamps,
  },
  (t) => [
    // Each role carries exactly its own profile field.
    check(
      "users_role_profile_check",
      sql`case ${t.role}
        when 'admin' then ${t.department} is null and ${t.studentId} is null
        when 'teacher' then ${t.department} is not null and ${t.studentId} is null
        when 'student' then ${t.studentId} is not null and ${t.department} is null
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
