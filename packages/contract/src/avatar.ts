// Players' avatars (students and guests), drawn in the browser with DiceBear from these choices. The API stores
// them and checks their shape; which parts and colours a style has is the web app's business
// (apps/web/src/lib/avatar.ts), and DiceBear ignores a choice its style doesn't know.
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { Forbidden } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";

// Styles that need no attribution (CC0, or free for personal and commercial use). The first is the default.
export const avatarStyles = ["lorelei", "notionists", "open-peeps", "avataaars", "bottts", "pixel-art", "thumbs"] as const;
export const AvatarStyle = Schema.Literals(avatarStyles);
export type AvatarStyle = typeof AvatarStyle.Type;

// A part's variant in place of the seed's pick; `avatarNone` hides an optional part (glasses, beard…).
export const avatarNone = "none";
const Name = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9]{1,40}$/));
const Hex = Schema.String.check(Schema.isPattern(/^#[0-9a-f]{6}$/));

export const Avatar = Schema.Struct({
  style: AvatarStyle,
  // Picks every part and colour the player didn't choose.
  seed: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  // Component name (`hair`, `eyes`…) → variant name or `avatarNone`.
  parts: Schema.Record(Name, Name).check(Schema.isMaxProperties(30)),
  // Colour group (`skin`, `hair`, `background`…) → lowercase #rrggbb.
  colors: Schema.Record(Name, Hex).check(Schema.isMaxProperties(30)),
});
export type Avatar = typeof Avatar.Type;

// The avatar of someone who hasn't made one: the default style, drawn from their seed.
export const defaultAvatar = (seed: string): Avatar => ({ style: avatarStyles[0], seed, parts: {}, colors: {} });

export class AvatarRpcs extends RpcGroup.make(
  // The signed-in player's avatar (the default one until they save their own).
  Rpc.make("mine", { success: Avatar, error: Forbidden }),
  // Saves it; a game they're in shows it at once.
  Rpc.make("save", { payload: { avatar: Avatar }, error: Forbidden }),
)
  .prefix("avatar.")
  .middleware(AuthMiddleware) {}
