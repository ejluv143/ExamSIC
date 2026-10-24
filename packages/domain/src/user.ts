import { Schema } from "effect";
import { statements } from "./permissions.ts";
import { orgRoleNames, personalRoleNames, planNames, platformRoleNames, roleNames } from "./roles.ts";

export const PlatformRoleSchema = Schema.Literals(platformRoleNames);
export const OrgRoleSchema = Schema.Literals(orgRoleNames);
export const PersonalRoleSchema = Schema.Literals(personalRoleNames);
export const RoleSchema = Schema.Literals(roleNames);
export const PlanSchema = Schema.Literals(planNames);

// What roles grant: statement resources to the actions allowed on them (packages/domain/src/permissions.ts).
// Also how an organization's custom roles are stored; only known resources and actions pass.
export const Grants = Schema.Record(Schema.String, Schema.Array(Schema.String)).check(
  Schema.makeFilter(
    (grants) =>
      Object.entries(grants).every(([resource, actions]) => {
        const known: readonly string[] | undefined = statements[resource as keyof typeof statements];
        return known !== undefined && actions.every((a) => known.includes(a));
      }),
    { title: "grants", description: "known resources and actions only" },
  ),
);
export type Grants = typeof Grants.Type;

// An organization the user belongs to, with their roles there (fixed ones and the organization's own).
export const Membership = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  slug: Schema.String,
  roles: Schema.Array(Schema.String),
});
export type Membership = typeof Membership.Type;

// The organization a request runs in, with what the user's roles there grant together.
export const ActiveOrganization = Schema.Struct({
  ...Membership.fields,
  permissions: Grants,
});
export type ActiveOrganization = typeof ActiveOrganization.Type;

const identity = { id: Schema.String, name: Schema.String, email: Schema.String };

// The signed-in user. `role` is the platform role; `organization` the active one (null: their personal space, until
// they pick or join one; signing in picks it for a member of exactly one), `personalRole` what they are there, and
// `memberships` every organization they belong to. `department` and `plan` are the account's teacher profile: the
// department shown under their name, and the plan in effect now. Guests (anonymous players from /join) have no
// organization; `name` is what they typed there and `email` a placeholder.
export const SessionUser = Schema.Struct({
  ...identity,
  role: PlatformRoleSchema,
  personalRole: PersonalRoleSchema,
  department: Schema.NullOr(Schema.String),
  plan: PlanSchema,
  organization: Schema.NullOr(ActiveOrganization),
  memberships: Schema.Array(Membership),
});
export type SessionUser = typeof SessionUser.Type;

// An account as platform admins see it.
export const Account = Schema.Struct({
  ...identity,
  role: PlatformRoleSchema,
  department: Schema.NullOr(Schema.String),
  banned: Schema.Boolean,
  // The organizations they belong to, with their roles there.
  memberships: Schema.Array(Membership),
});
export type Account = typeof Account.Type;

// The platform role and teacher profile, as admins set them.
export const Profile = Schema.Struct({
  role: Schema.Literals(["admin", "user"]),
  department: Schema.NullOr(Schema.NonEmptyString),
});
export type Profile = typeof Profile.Type;

// People who sign up themselves say what they are for: it picks their area of the app in their personal space. Both
// start with no organization; they can make one, join one with an invite code, or join a class with its code.
export const RegistrationProfile = Schema.Struct({ role: PersonalRoleSchema });
export type RegistrationProfile = typeof RegistrationProfile.Type;

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
