import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { RosterStudent } from "@examinus/domain/classes";
import { Account, Password, Profile } from "@examinus/domain/user";
import { AuthRejected, Conflict, Forbidden } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";

const UserId = { userId: Schema.String };

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
  // Every class-roster entry, for linking a student account to one.
  Rpc.make("listRoster", { success: Schema.Array(RosterStudent), error: Forbidden }),
)
  .prefix("admin.")
  .middleware(AuthMiddleware) {}
