import { Schema } from "effect";
import { roleNames } from "./roles.ts";

export const RoleSchema = Schema.Literals(roleNames);

const identity = { id: Schema.String, name: Schema.String, email: Schema.String };

// The signed-in user. Each role carries exactly its own profile field.
export const SessionUser = Schema.Union([
  Schema.Struct({ ...identity, role: Schema.Literal("admin") }),
  Schema.Struct({ ...identity, role: Schema.Literal("teacher"), department: Schema.String }),
  Schema.Struct({ ...identity, role: Schema.Literal("student"), studentId: Schema.String }),
]);
export type SessionUser = typeof SessionUser.Type;

// An account as admins see it.
export const Account = Schema.Struct({
  ...identity,
  role: RoleSchema,
  department: Schema.NullOr(Schema.String),
  studentId: Schema.NullOr(Schema.String),
  banned: Schema.Boolean,
});
export type Account = typeof Account.Type;

// The role and its profile field, as admins set them.
export const Profile = Schema.Union([
  Schema.Struct({ role: Schema.Literal("admin") }),
  Schema.Struct({ role: Schema.Literal("teacher"), department: Schema.NonEmptyString }),
  Schema.Struct({ role: Schema.Literal("student"), studentId: Schema.NonEmptyString }),
]);
export type Profile = typeof Profile.Type;

export const Password = Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(128));

// A cookie the API asks the web app to set or clear on the browser (Better Auth's session cookies).
export const ResponseCookie = Schema.Struct({
  name: Schema.String,
  value: Schema.String,
  maxAge: Schema.optional(Schema.Number),
  path: Schema.optional(Schema.String),
  domain: Schema.optional(Schema.String),
  secure: Schema.optional(Schema.Boolean),
  httpOnly: Schema.optional(Schema.Boolean),
  sameSite: Schema.optional(Schema.Literals(["strict", "lax", "none"])),
});
export type ResponseCookie = typeof ResponseCookie.Type;
