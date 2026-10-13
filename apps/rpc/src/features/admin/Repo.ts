// Accounts and the roster entries linked to them, as the admin screens read and link them.
import { and, asc, eq, isNull, ne, or } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database } from "../../platform/Database.ts";
import { students, users, type StudentItem, type UserItem } from "../../database/schemas/index.ts";

const columns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  department: users.department,
  // The roster entry linked to the account (students.user_id), if any.
  studentId: students.id,
  banned: users.banned,
};

export type AccountRow = Pick<UserItem, "id" | "name" | "email" | "role" | "department" | "banned"> & {
  studentId: string | null;
};

export class AdminRepo extends Context.Service<
  AdminRepo,
  {
    // Every account, by role and name.
    readonly users: Effect.Effect<AccountRow[]>;
    readonly user: (userId: string) => Effect.Effect<AccountRow | null>;
    // Every roster entry, by surname and first name.
    readonly roster: Effect.Effect<StudentItem[]>;
    // The roster entry's account (userId null when it has none); null when there is no such entry.
    readonly rosterOwner: (studentId: string) => Effect.Effect<{ userId: string | null } | null>;
    // Links the account to the roster entry (students.user_id), the one place the link lives, and unlinks any
    // other entry it had. null unlinks all of them, for an account that isn't a student any more. False when
    // someone else owns the entry.
    readonly link: (userId: string, studentId: string | null) => Effect.Effect<boolean>;
  }
>()("examinus/api/AdminRepo") {
  static readonly layer = Layer.effect(
    AdminRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return AdminRepo.of({
        users: db
          .query((d) =>
            d.select(columns).from(users).leftJoin(students, eq(students.userId, users.id)).orderBy(asc(users.role), asc(users.name)),
          )
          .pipe(Effect.withSpan("AdminRepo.users")),
        user: Effect.fn("AdminRepo.user")(function* (userId) {
          const [row] = yield* db.query((d) =>
            d.select(columns).from(users).leftJoin(students, eq(students.userId, users.id)).where(eq(users.id, userId)),
          );
          return row ?? null;
        }),
        roster: db
          .query((d) => d.select().from(students).orderBy(asc(students.lastName), asc(students.firstName)))
          .pipe(Effect.withSpan("AdminRepo.roster")),
        rosterOwner: Effect.fn("AdminRepo.rosterOwner")(function* (studentId) {
          const [row] = yield* db.query((d) =>
            d.select({ userId: students.userId }).from(students).where(eq(students.id, studentId)),
          );
          return row ?? null;
        }),
        link: Effect.fn("AdminRepo.link")(function* (userId, studentId) {
          return yield* db.query((d) =>
            d.transaction(async (tx) => {
              await tx
                .update(students)
                .set({ userId: null })
                .where(and(eq(students.userId, userId), studentId ? ne(students.id, studentId) : undefined));
              if (!studentId) return true;
              const rows = await tx
                .update(students)
                .set({ userId })
                .where(and(eq(students.id, studentId), or(isNull(students.userId), eq(students.userId, userId))))
                .returning({ id: students.id });
              return rows.length > 0;
            }),
          );
        }),
      });
    }),
  );
}
