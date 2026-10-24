import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Password, RegistrationProfile, ResponseCookie, SessionUser } from "@examinus/domain/user";
import { Conflict, NotFound, TooManyRequests, Unauthorized } from "./errors.ts";
import { GameFound } from "./game.ts";

export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()("InvalidCredentials", {}) {}

export class AccountSuspended extends Schema.TaggedError<AccountSuspended>()("AccountSuspended", {}) {}

// Better Auth refused the request; `message` is written for people (e.g. "User already exists").
export class AuthRejected extends Schema.TaggedError<AuthRejected>()("AuthRejected", { message: Schema.String }) {}

const Cookies = Schema.Array(ResponseCookie);

export const AuthConfig = Schema.Struct({
  google: Schema.Boolean,
  customRoles: Schema.Boolean,
  api: Schema.Struct({ version: Schema.String }),
  desktop: Schema.Struct({ minVersion: Schema.String, releases: Schema.String }),
});
export type AuthConfig = typeof AuthConfig.Type;

// Signing in and out, and reading the session. Session cookies come back in `cookies` for the web app to
// set on the browser; clients forward the browser's cookies as request headers.
export class AuthRpcs extends RpcGroup.make(
  // What the API has on: Google sign-in, organizations' custom roles (ORG_CUSTOM_ROLES), the API's own version and
  // what it requires of the desktop app (DESKTOP_MIN_VERSION) plus the GitHub repository its releases are published on.
  Rpc.make("config", { success: AuthConfig }),
  Rpc.make("signInEmail", {
    payload: { email: Schema.String, password: Schema.String },
    success: Schema.Struct({ user: SessionUser, cookies: Cookies }),
    error: Schema.Union([InvalidCredentials, AccountSuspended, TooManyRequests]),
  }),
  // Signing up: creates the account and signs in to it. `acceptTerms`: they agreed to the Terms of Service and
  // Privacy Policy, recorded with the time.
  Rpc.make("register", {
    payload: {
      name: Schema.NonEmptyString,
      email: Schema.String,
      password: Password,
      profile: RegistrationProfile,
      acceptTerms: Schema.Literal(true),
    },
    success: Schema.Struct({ user: SessionUser, cookies: Cookies }),
    error: Schema.Union([Conflict, AuthRejected, TooManyRequests]),
  }),
  // Returns Google's authorization URL; the OAuth callback goes to Better Auth's HTTP route.
  Rpc.make("signInGoogle", {
    payload: { callbackURL: Schema.String, errorCallbackURL: Schema.String },
    success: Schema.Struct({ url: Schema.String, cookies: Cookies }),
    error: Schema.Union([AuthRejected, TooManyRequests]),
  }),
  // Like signInGoogle, but creates the account with the profile from /register.
  Rpc.make("signUpGoogle", {
    payload: {
      profile: RegistrationProfile,
      acceptTerms: Schema.Literal(true),
      callbackURL: Schema.String,
      errorCallbackURL: Schema.String,
    },
    success: Schema.Struct({ url: Schema.String, cookies: Cookies }),
    error: Schema.Union([Conflict, AuthRejected, TooManyRequests]),
  }),
  // Joins as a guest: makes an anonymous account named `name`, signs in to it, and puts it on the roster of the
  // session the key opens. Only classless games, quizzes and exams whose teacher allowed guests; NotFound
  // otherwise, as for a wrong key. `found.mode` says where the web app sends them.
  Rpc.make("joinAsGuest", {
    payload: { name: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(40)), code: Schema.String },
    success: Schema.Struct({ user: SessionUser, cookies: Cookies, found: GameFound }),
    error: Schema.Union([NotFound, Conflict, TooManyRequests]),
  }),
  // `cookies` carries a refreshed session cookie when Better Auth extends the session.
  Rpc.make("session", { success: Schema.Struct({ user: SessionUser, cookies: Cookies }), error: Unauthorized }),
  Rpc.make("signOut", { success: Schema.Struct({ cookies: Cookies }) }),
).prefix("auth.") {}
