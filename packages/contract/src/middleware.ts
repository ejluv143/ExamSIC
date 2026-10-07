import { Context } from "effect";
import { RpcMiddleware } from "effect/rpc";
import type { SessionUser } from "./domain.ts";
import { Unauthorized } from "./errors.ts";

// The signed-in user, provided to handlers by `AuthMiddleware`.
export class CurrentUser extends Context.Service<CurrentUser, SessionUser>()("examora/contract/CurrentUser") {}

// Resolves the session from the request's cookies; fails with `Unauthorized` when there is none.
// The API implements it (apps/rpc/src/Session.ts); clients forward the browser's cookies as headers.
export class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, { provides: CurrentUser }>()(
  "examora/contract/AuthMiddleware",
  { error: Unauthorized },
) {}
