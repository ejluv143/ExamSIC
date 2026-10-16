// Accounts with their organizations, and the roster entries, as the admin screens read them.
import { parseMemberRoles } from "@examinus/domain/roles";
import type { Membership } from "@examinus/domain/user";
import { asc, eq, inArray } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database } from "../../platform/Database.ts";
import { members, organizations, students, users, type StudentItem, type UserItem } from "../../database/schemas/index.ts";

const columns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  department: users.department,
  banned: users.banned,
};

export type AccountRow = Pick<UserItem, "id" | "name" | "email" | "role" | "department" | "banned"> & {
  memberships: Membership[];
};

export class AdminRepo extends Context.Service<
  AdminRepo,
  {
    // Every account, by role and name.
    readonly users: Effect.Effect<AccountRow[]>;
    readonly user: (userId: string) => Effect.Effect<AccountRow | null>;
    // Every roster entry, in every organization, by surname and first name.
    readonly roster: Effect.Effect<StudentItem[]>;
  }
>()("examinus/api/AdminRepo") {
  static readonly layer = Layer.effect(
    AdminRepo,
    Effect.gen(function* () {
      const db = yield* Database;

      // The organizations of these accounts (all of them when `userIds` is omitted), by account.
      const membershipsOf = Effect.fn("AdminRepo.membershipsOf")(function* (userIds?: readonly string[]) {
        const rows = yield* db.query((d) =>
          d
            .select({ userId: members.userId, id: organizations.id, name: organizations.name, slug: organizations.slug, role: members.role })
            .from(members)
            .innerJoin(organizations, eq(organizations.id, members.organizationId))
            .where(userIds ? inArray(members.userId, [...userIds]) : undefined)
            .orderBy(asc(organizations.name)),
        );
        const byUser = new Map<string, Membership[]>();
        for (const { userId, role, ...org } of rows) {
          const list = byUser.get(userId) ?? [];
          list.push({ ...org, roles: parseMemberRoles(role) });
          byUser.set(userId, list);
        }
        return byUser;
      });

      return AdminRepo.of({
        users: Effect.gen(function* () {
          const rows = yield* db.query((d) => d.select(columns).from(users).orderBy(asc(users.role), asc(users.name)));
          const memberships = yield* membershipsOf();
          return rows.map((row) => ({ ...row, memberships: memberships.get(row.id) ?? [] }));
        }).pipe(Effect.withSpan("AdminRepo.users")),
        user: Effect.fn("AdminRepo.user")(function* (userId) {
          const [row] = yield* db.query((d) => d.select(columns).from(users).where(eq(users.id, userId)));
          if (!row) return null;
          return { ...row, memberships: (yield* membershipsOf([userId])).get(userId) ?? [] };
        }),
        roster: db
          .query((d) => d.select().from(students).orderBy(asc(students.lastName), asc(students.firstName)))
          .pipe(Effect.withSpan("AdminRepo.roster")),
      });
    }),
  );
}
