// The account tables as the sign-in flows touch them: guest accounts, and saved avatars.
import type { Avatar } from "@examinus/domain/avatar";
import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database } from "../../platform/Database.ts";
import { students, users } from "../../database/schemas/index.ts";

export class AuthRepo extends Context.Service<
  AuthRepo,
  {
    // A guest joining again keeps their account and takes the new name, on the account and its roster entries.
    readonly renameGuest: (userId: string, name: string) => Effect.Effect<void>;
    // Names a new anonymous account. Its roster entry is made when it joins a game (in that game's organization).
    readonly createGuest: (guest: { userId: string; name: string }) => Effect.Effect<void>;
    // The avatar the user saved, or null.
    readonly avatar: (userId: string) => Effect.Effect<Avatar | null>;
    readonly saveAvatar: (userId: string, avatar: Avatar) => Effect.Effect<void>;
  }
>()("examinus/api/AuthRepo") {
  static readonly layer = Layer.effect(
    AuthRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return AuthRepo.of({
        renameGuest: Effect.fn("AuthRepo.renameGuest")(function* (userId, name) {
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              await tx.update(users).set({ name }).where(eq(users.id, userId));
              await tx.update(students).set({ firstName: name }).where(eq(students.userId, userId));
            }),
          );
        }),
        createGuest: Effect.fn("AuthRepo.createGuest")(function* ({ userId, name }) {
          yield* db.query((d) => d.update(users).set({ name }).where(eq(users.id, userId)));
        }),
        avatar: Effect.fn("AuthRepo.avatar")(function* (userId) {
          const [row] = yield* db.query((d) => d.select({ avatar: users.avatar }).from(users).where(eq(users.id, userId)));
          return row?.avatar ?? null;
        }),
        saveAvatar: Effect.fn("AuthRepo.saveAvatar")(function* (userId, avatar) {
          yield* db.query((d) => d.update(users).set({ avatar }).where(eq(users.id, userId)));
        }),
      });
    }),
  );
}
