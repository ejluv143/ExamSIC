import { AdminRpcs, AuthRejected, Conflict, Forbidden, type Profile } from "@examora/contract";
import { and, asc, eq, ne } from "drizzle-orm";
import { Effect } from "effect";
import type { Headers as EffectHeaders } from "effect/http";
import { BetterAuth, type AuthApi, type AuthApiError } from "../BetterAuth.ts";
import { Database } from "../Database.ts";
import { users } from "../database/schemas/index.ts";
import { requirePermission, webHeaders } from "../Session.ts";

const columns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  department: users.department,
  studentId: users.studentId,
  banned: users.banned,
};

// The role and profile columns to store, with the other roles' fields cleared.
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

    // Each roster entry belongs to at most one account (users.student_id is unique).
    const ensureRosterEntryFree = Effect.fn("ensureRosterEntryFree")(function* (
      studentId: string | null,
      exceptUserId?: string,
    ) {
      if (!studentId) return;
      const [row] = yield* db.query((d) =>
        d
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.studentId, studentId), exceptUserId ? ne(users.id, exceptUserId) : undefined)),
      );
      if (row) return yield* new Conflict({ message: "That roster entry already has an account." });
    });

    // Calls Better Auth's admin API as the requesting admin.
    const callAs = <A>(headers: EffectHeaders.Headers, run: (api: AuthApi, headers: Headers) => Promise<A>) =>
      auth.call((api) => run(api, webHeaders(headers))).pipe(Effect.mapError(rejected));

    return AdminRpcs.of({
      "admin.listUsers": () =>
        requirePermission({ user: ["list"] }).pipe(
          Effect.andThen(db.query((d) => d.select(columns).from(users).orderBy(asc(users.role), asc(users.name)))),
        ),

      "admin.getUser": ({ userId }) =>
        requirePermission({ user: ["get"] }).pipe(
          Effect.andThen(db.query((d) => d.select(columns).from(users).where(eq(users.id, userId)))),
          Effect.map(([row]) => row ?? null),
        ),

      "admin.createUser": Effect.fn("admin.createUser")(function* ({ name, email, password, profile }, { headers }) {
        yield* requirePermission({ user: ["create", "set-role"] });
        const { role, department, studentId } = profileColumns(profile);
        yield* ensureRosterEntryFree(studentId);
        yield* callAs(headers, (api, h) =>
          api.createUser({ body: { name, email: email.trim(), password, role, data: { department, studentId } }, headers: h }),
        );
      }),

      "admin.updateUser": Effect.fn("admin.updateUser")(function* ({ userId, name, profile }, { headers }) {
        const me = yield* requirePermission({ user: ["update", "set-role"] });
        const fields = profileColumns(profile);
        // Keeps the acting admin able to manage accounts.
        if (userId === me.id && fields.role !== "admin") {
          return yield* new Forbidden({ message: "You can't change your own role." });
        }
        yield* ensureRosterEntryFree(fields.studentId, userId);
        yield* callAs(headers, (api, h) => api.adminUpdateUser({ body: { userId, data: { name, ...fields } }, headers: h }));
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
    });
  }),
);
