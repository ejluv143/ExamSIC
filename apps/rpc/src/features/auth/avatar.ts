import { defaultAvatar, type Avatar } from "@examinus/domain/avatar";
import { createHash } from "node:crypto";

// A player's avatar: the one they saved, or the default one drawn from a seed made from their id (other players
// see the seed, so it isn't the id itself).
export const avatarOf = (userId: string, saved: Avatar | null): Avatar =>
  saved ?? defaultAvatar(createHash("sha256").update(userId).digest("hex").slice(0, 16));
