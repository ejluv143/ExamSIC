import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Account, Password, Profile, RegistrationProfile, ResponseCookie, SessionUser } from "./domain.ts";
import {
  AccountPending,
  AccountSuspended,
  AuthRejected,
  Conflict,
  Forbidden,
  InvalidCredentials,
  TooManyRequests,
  Unauthorized,
} from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";

const Cookies = Schema.Array(ResponseCookie);
const UserId = { userId: Schema.String };

// Signing in and out, and reading the session. Session cookies come back in `cookies` for the web app to
// set on the browser; clients forward the browser's cookies as request headers.
export class AuthRpcs extends RpcGroup.make(
  Rpc.make("config", { success: Schema.Struct({ google: Schema.Boolean }) }),
  Rpc.make("signInEmail", {
    payload: { email: Schema.String, password: Schema.String },
    success: Schema.Struct({ user: SessionUser, cookies: Cookies }),
    error: Schema.Union([InvalidCredentials, AccountSuspended, AccountPending, TooManyRequests]),
  }),
  // Self-registration: the account waits for an admin's approval before it can sign in.
  Rpc.make("register", {
    payload: { name: Schema.NonEmptyString, email: Schema.String, password: Password, profile: RegistrationProfile },
    error: Schema.Union([Conflict, AuthRejected]),
  }),
  // Returns Google's authorization URL; the OAuth callback goes to Better Auth's HTTP route.
  Rpc.make("signInGoogle", {
    payload: { callbackURL: Schema.String, errorCallbackURL: Schema.String },
    success: Schema.Struct({ url: Schema.String, cookies: Cookies }),
    error: AuthRejected,
  }),
  // `cookies` carries a refreshed session cookie when Better Auth extends the session.
  Rpc.make("session", { success: Schema.Struct({ user: SessionUser, cookies: Cookies }), error: Unauthorized }),
  Rpc.make("signOut", { success: Schema.Struct({ cookies: Cookies }) }),
).prefix("auth.") {}

// Account management, for roles granted the `user` permissions.
export class AdminRpcs extends RpcGroup.make(
  Rpc.make("listUsers", { success: Schema.Array(Account), error: Forbidden }),
  Rpc.make("getUser", { payload: UserId, success: Schema.NullOr(Account), error: Forbidden }),
  Rpc.make("createUser", {
    payload: { name: Schema.NonEmptyString, email: Schema.String, password: Password, profile: Profile },
    error: Schema.Union([Forbidden, Conflict, AuthRejected]),
  }),
  Rpc.make("updateUser", {
    payload: { ...UserId, name: Schema.NonEmptyString, profile: Profile },
    error: Schema.Union([Forbidden, Conflict, AuthRejected]),
  }),
  Rpc.make("setPassword", { payload: { ...UserId, password: Password }, error: Schema.Union([Forbidden, AuthRejected]) }),
  Rpc.make("setSuspended", {
    payload: { ...UserId, suspended: Schema.Boolean },
    error: Schema.Union([Forbidden, AuthRejected]),
  }),
  Rpc.make("removeUser", { payload: UserId, error: Schema.Union([Forbidden, AuthRejected]) }),
)
  .prefix("admin.")
  .middleware(AuthMiddleware) {}

export class ApiRpcs extends AuthRpcs.merge(AdminRpcs) {}

// Served by the API at this path.
export const rpcPath = "/rpc";
