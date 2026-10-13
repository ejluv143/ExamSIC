import { AccountRejected, AdminRpcs } from "@examinus/contract/admin";
import { Effect } from "effect";
import { requirePermission } from "../auth/Session.ts";
import { toRosterStudent } from "../classes/mappers.ts";
import type { AuthApiError } from "../auth/BetterAuth.ts";
import { AdminService } from "./Service.ts";

// Better Auth's admin API words its refusals for people.
const rejected = (error: AuthApiError) => new AccountRejected({ message: error.message });

export const AdminHandlers = AdminRpcs.toLayer(
  Effect.gen(function* () {
    const admin = yield* AdminService;

    return AdminRpcs.of({
      "admin.listUsers": Effect.fn("admin.listUsers")(function* () {
        yield* requirePermission({ user: ["list"] });
        return yield* admin.listUsers;
      }),

      "admin.getUser": Effect.fn("admin.getUser")(function* ({ userId }) {
        yield* requirePermission({ user: ["get"] });
        return yield* admin.getUser(userId);
      }),

      "admin.createUser": Effect.fn("admin.createUser")(function* (input, { headers }) {
        yield* requirePermission({ user: ["create", "set-role"] });
        yield* admin.createUser(input, headers).pipe(Effect.catchTag("AuthApiError", (e) => Effect.fail(rejected(e))));
      }),

      "admin.updateUser": Effect.fn("admin.updateUser")(function* (input, { headers }) {
        const me = yield* requirePermission({ user: ["update", "set-role"] });
        yield* admin.updateUser(me.id, input, headers).pipe(Effect.catchTag("AuthApiError", (e) => Effect.fail(rejected(e))));
      }),

      "admin.setPassword": Effect.fn("admin.setPassword")(function* ({ userId, password }, { headers }) {
        yield* requirePermission({ user: ["set-password"] });
        yield* admin.setPassword(userId, password, headers).pipe(Effect.catchTag("AuthApiError", (e) => Effect.fail(rejected(e))));
      }),

      "admin.setSuspended": Effect.fn("admin.setSuspended")(function* ({ userId, suspended }, { headers }) {
        yield* requirePermission({ user: ["ban"] });
        yield* admin.setSuspended(userId, suspended, headers).pipe(Effect.catchTag("AuthApiError", (e) => Effect.fail(rejected(e))));
      }),

      "admin.removeUser": Effect.fn("admin.removeUser")(function* ({ userId }, { headers }) {
        yield* requirePermission({ user: ["delete"] });
        yield* admin.removeUser(userId, headers).pipe(Effect.catchTag("AuthApiError", (e) => Effect.fail(rejected(e))));
      }),

      "admin.listRoster": Effect.fn("admin.listRoster")(function* () {
        yield* requirePermission({ user: ["list"] });
        return (yield* admin.listRoster).map(toRosterStudent);
      }),
    });
  }),
);
