// Better Auth tables (drizzle adapter with `usePlural: true`). Field names must match Better Auth's;
// column names are snake_case. `role`, `banned`, `banReason`, `banExpires` and `impersonatedBy` belong to
// the admin plugin; `department`, `studentId`, `plan`, `planExpiresAt` and `termsAcceptedAt` are `user.additionalFields`
// (src/BetterAuth.ts).
import { planNames, roleNames } from "@examora/contract/roles";
import { sql } from "drizzle-orm";
import { boolean, check, index, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps, timestamptz } from "./_helpers.ts";

export const userRole = pgEnum("user_role", roleNames);
export const plan = pgEnum("plan", planNames);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: userRole("role").notNull(),
    // Teachers, optionally: shown under their name on the dashboard.
    department: text("department"),
    // Students: a roster entry an admin linked the account to. Students who sign up themselves get theirs
    // (students.user_id) the first time they join a class.
    studentId: text("student_id").unique(),
    // Teachers: what they pay for. No end date means it doesn't end; after it, they're on the free plan.
    plan: plan("plan").notNull().default("free"),
    planExpiresAt: timestamptz("plan_expires_at"),
    // When they agreed to the Terms of Service and Privacy Policy on sign-up; none for accounts admins make.
    termsAcceptedAt: timestamptz("terms_accepted_at"),
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: timestamptz("ban_expires"),
    ...timestamps,
  },
  (t) => [
    // Each role carries only its own profile field.
    check(
      "users_role_profile_check",
      sql`case ${t.role}
        when 'admin' then ${t.department} is null and ${t.studentId} is null
        when 'teacher' then ${t.studentId} is null
        when 'student' then ${t.department} is null
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
