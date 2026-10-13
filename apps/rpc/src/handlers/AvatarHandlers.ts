import { AvatarRpcs } from "@examinus/contract";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { avatarOf } from "../avatar.ts";
import { Database } from "../platform/Database.ts";
import { users } from "../database/schemas/index.ts";
import { Game } from "../modes/game.ts";
import { requirePermission } from "../Session.ts";

export const AvatarHandlers = AvatarRpcs.toLayer(
  Effect.gen(function* () {
    const db = yield* Database;
    const game = yield* Game;

    return AvatarRpcs.of({
      "avatar.mine": Effect.fn("avatar.mine")(function* () {
        const user = yield* requirePermission({ avatar: ["update"] });
        const [row] = yield* db.query((d) => d.select({ avatar: users.avatar }).from(users).where(eq(users.id, user.id)));
        return avatarOf(user.id, row?.avatar ?? null);
      }),
      "avatar.save": Effect.fn("avatar.save")(function* ({ avatar }) {
        const user = yield* requirePermission({ avatar: ["update"] });
        yield* db.query((d) => d.update(users).set({ avatar }).where(eq(users.id, user.id)));
        yield* game.avatarChanged(user.id, avatar);
      }),
    });
  }),
);
