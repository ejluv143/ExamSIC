// Account administration: Better Auth's admin API does the account work, and this links accounts to roster entries.
import { AuthRejected, Conflict, Forbidden, type Profile } from "@examinus/contract";
import { Context, Effect, Layer } from "effect";
import type { Headers as EffectHeaders } from "effect/http";
import type { StudentItem } from "../../database/schemas/index.ts";
import { BetterAuth, type AuthApi, type AuthApiError } from "../auth/BetterAuth.ts";
import { webHeaders } from "../auth/Session.ts";
import { AdminRepo, type AccountRow } from "./Repo.ts";

// The role and profile column to store, with the other roles' field cleared, and the roster entry to link.
const profileColumns = (profile: Profile) => ({
  role: profile.role,
  department: profile.role === "teacher" ? profile.department : null,
  studentId: profile.role === "student" ? profile.studentId : null,
});

// Better Auth's admin API re-checks the caller's session and permissions; its messages are written for people.
const rejected = (error: AuthApiError) => new AuthRejected({ message: error.message });

type Failure = AuthRejected | Conflict | Forbidden;

export class AdminService extends Context.Service<
  AdminService,
  {
    readonly listUsers: Effect.Effect<AccountRow[]>;
    readonly getUser: (userId: string) => Effect.Effect<AccountRow | null>;
    readonly listRoster: Effect.Effect<StudentItem[]>;
    readonly createUser: (
      input: { name: string; email: string; password: string; profile: Profile },
      headers: EffectHeaders.Headers,
    ) => Effect.Effect<void, Failure>;
    // `actingAdminId` is the admin making the change, who can't take their own admin role away.
    readonly updateUser: (
      actingAdminId: string,
      input: { userId: string; name: string; profile: Profile },
      headers: EffectHeaders.Headers,
    ) => Effect.Effect<void, Failure>;
    readonly setPassword: (userId: string, password: string, headers: EffectHeaders.Headers) => Effect.Effect<void, AuthRejected>;
    // Suspending signs the user out everywhere and blocks sign-in until reinstated.
    readonly setSuspended: (userId: string, suspended: boolean, headers: EffectHeaders.Headers) => Effect.Effect<void, AuthRejected>;
    readonly removeUser: (userId: string, headers: EffectHeaders.Headers) => Effect.Effect<void, AuthRejected>;
  }
>()("examinus/api/AdminService") {
  static readonly layer = Layer.effect(
    AdminService,
    Effect.gen(function* () {
      const auth = yield* BetterAuth;
      const repo = yield* AdminRepo;

      // Each roster entry belongs to at most one account (students.user_id is unique).
      const ensureRosterEntryFree = Effect.fn("AdminService.ensureRosterEntryFree")(function* (
        studentId: string | null,
        exceptUserId?: string,
      ) {
        if (!studentId) return;
        const row = yield* repo.rosterOwner(studentId);
        if (!row) return yield* new Conflict({ message: "That roster entry no longer exists." });
        if (row.userId && row.userId !== exceptUserId)
          return yield* new Conflict({ message: "That roster entry already has an account." });
      });

      const linkRosterEntry = Effect.fn("AdminService.linkRosterEntry")(function* (userId: string, studentId: string | null) {
        // Someone else took it since ensureRosterEntryFree.
        if (!(yield* repo.link(userId, studentId)))
          return yield* new Conflict({ message: "That roster entry already has an account." });
      });

      // Calls Better Auth's admin API as the requesting admin.
      const callAs = <A>(headers: EffectHeaders.Headers, run: (api: AuthApi, headers: Headers) => Promise<A>) =>
        auth.call((api) => run(api, webHeaders(headers))).pipe(Effect.mapError(rejected));

      return AdminService.of({
        listUsers: repo.users,
        getUser: repo.user,
        listRoster: repo.roster,

        createUser: Effect.fn("AdminService.createUser")(function* ({ name, email, password, profile }, headers) {
          const { role, department, studentId } = profileColumns(profile);
          yield* ensureRosterEntryFree(studentId);
          const { user } = yield* callAs(headers, (api, h) =>
            api.createUser({ body: { name, email: email.trim(), password, role, data: { department } }, headers: h }),
          );
          if (studentId) yield* linkRosterEntry(user.id, studentId);
        }),

        updateUser: Effect.fn("AdminService.updateUser")(function* (actingAdminId, { userId, name, profile }, headers) {
          const fields = profileColumns(profile);
          // Keeps the acting admin able to manage accounts.
          if (userId === actingAdminId && fields.role !== "admin") {
            return yield* new Forbidden({ message: "You can't change your own role." });
          }
          const { role, department, studentId } = fields;
          yield* ensureRosterEntryFree(studentId, userId);
          yield* callAs(headers, (api, h) => api.adminUpdateUser({ body: { userId, data: { name, role, department } }, headers: h }));
          yield* linkRosterEntry(userId, studentId);
        }),

        setPassword: Effect.fn("AdminService.setPassword")(function* (userId, password, headers) {
          yield* callAs(headers, (api, h) => api.setUserPassword({ body: { userId, newPassword: password }, headers: h }));
        }),

        setSuspended: Effect.fn("AdminService.setSuspended")(function* (userId, suspended, headers) {
          yield* callAs(headers, (api, h) =>
            suspended ? api.banUser({ body: { userId }, headers: h }) : api.unbanUser({ body: { userId }, headers: h }),
          );
        }),

        removeUser: Effect.fn("AdminService.removeUser")(function* (userId, headers) {
          yield* callAs(headers, (api, h) => api.removeUser({ body: { userId }, headers: h }));
        }),
      });
    }),
  );
}
