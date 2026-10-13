import { AdminRpcs } from "@examinus/contract";
import { Effect } from "effect";
import { requirePermission } from "../auth/Session.ts";
import { toRosterStudent } from "../classes/mappers.ts";
import { AdminService } from "./Service.ts";

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
        yield* admin.createUser(input, headers);
      }),

      "admin.updateUser": Effect.fn("admin.updateUser")(function* (input, { headers }) {
        const me = yield* requirePermission({ user: ["update", "set-role"] });
        yield* admin.updateUser(me.id, input, headers);
      }),

      "admin.setPassword": Effect.fn("admin.setPassword")(function* ({ userId, password }, { headers }) {
        yield* requirePermission({ user: ["set-password"] });
        yield* admin.setPassword(userId, password, headers);
      }),

      "admin.setSuspended": Effect.fn("admin.setSuspended")(function* ({ userId, suspended }, { headers }) {
        yield* requirePermission({ user: ["ban"] });
        yield* admin.setSuspended(userId, suspended, headers);
      }),

      "admin.removeUser": Effect.fn("admin.removeUser")(function* ({ userId }, { headers }) {
        yield* requirePermission({ user: ["delete"] });
        yield* admin.removeUser(userId, headers);
      }),

      "admin.listRoster": Effect.fn("admin.listRoster")(function* () {
        yield* requirePermission({ user: ["list"] });
        return (yield* admin.listRoster).map(toRosterStudent);
      }),
    });
  }),
);
