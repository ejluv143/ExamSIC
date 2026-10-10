import { AdminRpcs, AuthRejected, Conflict, Forbidden, type Profile } from "@examora/contract";
import { and, asc, eq, isNull, ne, or } from "drizzle-orm";
import { Effect } from "effect";
import type { Headers as EffectHeaders } from "effect/http";
import { BetterAuth, type AuthApi, type AuthApiError } from "../BetterAuth.ts";
import { Database } from "../Database.ts";
import { students, users } from "../database/schemas/index.ts";
import { requirePermission, webHeaders } from "../Session.ts";
import { toRosterStudent } from "./ClassHandlers.ts";

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

// The role and profile column to store, with the other roles' field cleared, and the roster entry to link.
const profileColumns = (profile: Profile) => ({
  role: profile.role,
  department: profile.role === "teacher" ? profile.department : null,
  studentId: profile.role === "student" ? profile.studentId : null,
});

// Better Auth's admin API re-checks the caller's session and permissions; its messages are written for people.
const rejected = (error: AuthApiError) => new AuthRejected({ message: error.message });

export const AdminHandlers = AdminRpcs.toLayer(
  Effect.gen(function* () {
    const auth = yield* BetterAuth;
    const db = yield* Database;

    // Each roster entry belongs to at most one account (students.user_id is unique).
    const ensureRosterEntryFree = Effect.fn("ensureRosterEntryFree")(function* (
      studentId: string | null,
      exceptUserId?: string,
    ) {
      if (!studentId) return;
      const [row] = yield* db.query((d) =>
        d.select({ userId: students.userId }).from(students).where(eq(students.id, studentId)),
      );
      if (!row) return yield* new Conflict({ message: "That roster entry no longer exists." });
      if (row.userId && row.userId !== exceptUserId)
        return yield* new Conflict({ message: "That roster entry already has an account." });
    });

    // Links the account to the roster entry (students.user_id), the one place the link lives, and unlinks any
    // other entry it had. null unlinks all of them, for an account that isn't a student any more.
    const linkRosterEntry = Effect.fn("linkRosterEntry")(function* (userId: string, studentId: string | null) {
      const linked = yield* db.query((d) =>
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
      // Someone else took it since ensureRosterEntryFree.
      if (!linked) return yield* new Conflict({ message: "That roster entry already has an account." });
    });

    // Calls Better Auth's admin API as the requesting admin.
    const callAs = <A>(headers: EffectHeaders.Headers, run: (api: AuthApi, headers: Headers) => Promise<A>) =>
      auth.call((api) => run(api, webHeaders(headers))).pipe(Effect.mapError(rejected));

    return AdminRpcs.of({
      "admin.listUsers": () =>
        requirePermission({ user: ["list"] }).pipe(
          Effect.andThen(
            db.query((d) =>
              d
                .select(columns)
                .from(users)
                .leftJoin(students, eq(students.userId, users.id))
                .orderBy(asc(users.role), asc(users.name)),
            ),
          ),
        ),

      "admin.getUser": ({ userId }) =>
        requirePermission({ user: ["get"] }).pipe(
          Effect.andThen(
            db.query((d) =>
              d.select(columns).from(users).leftJoin(students, eq(students.userId, users.id)).where(eq(users.id, userId)),
            ),
          ),
          Effect.map(([row]) => row ?? null),
        ),

      "admin.createUser": Effect.fn("admin.createUser")(function* ({ name, email, password, profile }, { headers }) {
        yield* requirePermission({ user: ["create", "set-role"] });
        const { role, department, studentId } = profileColumns(profile);
        yield* ensureRosterEntryFree(studentId);
        const { user } = yield* callAs(headers, (api, h) =>
          api.createUser({ body: { name, email: email.trim(), password, role, data: { department } }, headers: h }),
        );
        if (studentId) yield* linkRosterEntry(user.id, studentId);
      }),

      "admin.updateUser": Effect.fn("admin.updateUser")(function* ({ userId, name, profile }, { headers }) {
        const me = yield* requirePermission({ user: ["update", "set-role"] });
        const fields = profileColumns(profile);
        // Keeps the acting admin able to manage accounts.
        if (userId === me.id && fields.role !== "admin") {
          return yield* new Forbidden({ message: "You can't change your own role." });
        }
        const { role, department, studentId } = fields;
        yield* ensureRosterEntryFree(studentId, userId);
        yield* callAs(headers, (api, h) => api.adminUpdateUser({ body: { userId, data: { name, role, department } }, headers: h }));
        yield* linkRosterEntry(userId, studentId);
      }),

      "admin.setPassword": Effect.fn("admin.setPassword")(function* ({ userId, password }, { headers }) {
        yield* requirePermission({ user: ["set-password"] });
        yield* callAs(headers, (api, h) => api.setUserPassword({ body: { userId, newPassword: password }, headers: h }));
      }),

      // Suspending signs the user out everywhere and blocks sign-in until reinstated.
      "admin.setSuspended": Effect.fn("admin.setSuspended")(function* ({ userId, suspended }, { headers }) {
        yield* requirePermission({ user: ["ban"] });
        yield* callAs(headers, (api, h) =>
          suspended ? api.banUser({ body: { userId }, headers: h }) : api.unbanUser({ body: { userId }, headers: h }),
        );
      }),

      "admin.removeUser": Effect.fn("admin.removeUser")(function* ({ userId }, { headers }) {
        yield* requirePermission({ user: ["delete"] });
        yield* callAs(headers, (api, h) => api.removeUser({ body: { userId }, headers: h }));
      }),

      "admin.listRoster": () =>
        requirePermission({ user: ["list"] }).pipe(
          Effect.andThen(
            db.query((d) => d.select().from(students).orderBy(asc(students.lastName), asc(students.firstName))),
          ),
          Effect.map((rows) => rows.map(toRosterStudent)),
        ),
    });
  }),
);
