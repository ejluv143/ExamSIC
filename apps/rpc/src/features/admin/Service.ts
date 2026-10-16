// Account administration: Better Auth's admin API does the account work. Platform accounts only; organizations
// and their members are managed by their owners (features/organization).
import { Forbidden } from "@examinus/contract/errors";
import { type Profile } from "@examinus/domain/user";
import { Context, Effect, Layer } from "effect";
import type { Headers as EffectHeaders } from "effect/http";
import type { StudentItem } from "../../database/schemas/index.ts";
import { BetterAuth, type AuthApi, type AuthApiError } from "../auth/BetterAuth.ts";
import { webHeaders } from "../auth/Session.ts";
import { AdminRepo, type AccountRow } from "./Repo.ts";

// The role and department to store.
const profileColumns = (profile: Profile) => ({ role: profile.role, department: profile.department });

type Failure = AuthApiError | Forbidden;

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
    readonly setPassword: (userId: string, password: string, headers: EffectHeaders.Headers) => Effect.Effect<void, AuthApiError>;
    // Suspending signs the user out everywhere and blocks sign-in until reinstated.
    readonly setSuspended: (userId: string, suspended: boolean, headers: EffectHeaders.Headers) => Effect.Effect<void, AuthApiError>;
    readonly removeUser: (userId: string, headers: EffectHeaders.Headers) => Effect.Effect<void, AuthApiError>;
  }
>()("examinus/api/AdminService") {
  static readonly layer = Layer.effect(
    AdminService,
    Effect.gen(function* () {
      const auth = yield* BetterAuth;
      const repo = yield* AdminRepo;

      // Calls Better Auth's admin API as the requesting admin; it re-checks the caller's session and permissions.
      const callAs = <A>(headers: EffectHeaders.Headers, run: (api: AuthApi, headers: Headers) => Promise<A>) =>
        auth.call((api) => run(api, webHeaders(headers)));

      return AdminService.of({
        listUsers: repo.users,
        getUser: repo.user,
        listRoster: repo.roster,

        createUser: Effect.fn("AdminService.createUser")(function* ({ name, email, password, profile }, headers) {
          const { role, department } = profileColumns(profile);
          yield* callAs(headers, (api, h) =>
            api.createUser({ body: { name, email: email.trim(), password, role, data: { department } }, headers: h }),
          );
        }),

        updateUser: Effect.fn("AdminService.updateUser")(function* (actingAdminId, { userId, name, profile }, headers) {
          const { role, department } = profileColumns(profile);
          // Keeps the acting admin able to manage accounts.
          if (userId === actingAdminId && role !== "admin") {
            return yield* new Forbidden({ message: "You can't change your own role." });
          }
          yield* callAs(headers, (api, h) => api.adminUpdateUser({ body: { userId, data: { name, role, department } }, headers: h }));
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
