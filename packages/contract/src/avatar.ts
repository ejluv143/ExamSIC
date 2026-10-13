// The signed-in player's avatar. The avatar itself (styles, shape, default) is in @examinus/domain/avatar.
import { Rpc, RpcGroup } from "effect/rpc";
import { Avatar } from "@examinus/domain/avatar";
import { Forbidden } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";

export class AvatarRpcs extends RpcGroup.make(
  // The signed-in player's avatar (the default one until they save their own).
  Rpc.make("mine", { success: Avatar, error: Forbidden }),
  // Saves it; a game they're in shows it at once.
  Rpc.make("save", { payload: { avatar: Avatar }, error: Forbidden }),
)
  .prefix("avatar.")
  .middleware(AuthMiddleware) {}
