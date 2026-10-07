import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { db } from "@/database/client";
import * as schema from "@/database/schemas";
import { authEnv } from "@/env";
import { ac, roles } from "./permissions";

const env = authEnv();

export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  // No self sign-up: admins create accounts at /admin (`pnpm db:seed` adds demo ones in development).
  emailAndPassword: { enabled: true, disableSignUp: true },
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, disableSignUp: true } }
      : {},
  // Google sign-in attaches to the existing account with the same school email.
  account: { accountLinking: { trustedProviders: ["google"] } },
  user: {
    // `role` comes from the admin plugin.
    additionalFields: {
      department: { type: "string", required: false, input: false },
      studentId: { type: "string", required: false, input: false },
    },
  },
  plugins: [
    admin({ ac, roles, adminRoles: ["admin"], defaultRole: "student" }),
    // Must stay last: lets server actions set Better Auth's cookies.
    nextCookies(),
  ],
});
