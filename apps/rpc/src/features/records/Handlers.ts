import { ClassRecordRpcs } from "@examinus/contract/class-record";
import { Forbidden } from "@examinus/contract/errors";
import { roleOf } from "@examinus/domain/roles";
import { Effect } from "effect";
import { requireOrgPermission } from "../auth/Session.ts";
import { RecordsService } from "./Service.ts";

export const ClassRecordHandlers = ClassRecordRpcs.toLayer(
  Effect.gen(function* () {
    const records = yield* RecordsService;

    return ClassRecordRpcs.of({
      "classRecord.get": Effect.fn("classRecord.get")(function* ({ classId }) {
        const me = yield* requireOrgPermission({ classRecord: ["read"] });
        return yield* records.get(me.actor, classId);
      }),

      "classRecord.save": Effect.fn("classRecord.save")(function* ({ record }) {
        const me = yield* requireOrgPermission({ classRecord: ["update"] });
        return yield* records.save(me.actor, record);
      }),

      "classRecord.mine": Effect.fn("classRecord.mine")(function* ({ classId }) {
        const me = yield* requireOrgPermission({ enrollment: ["read"] });
        if (roleOf(me) !== "student") return yield* new Forbidden({ message: "Only students have their own record." });
        return yield* records.mine(me.actor, classId);
      }),
    });
  }),
);
