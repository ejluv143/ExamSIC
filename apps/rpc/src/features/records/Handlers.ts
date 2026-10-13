import { ClassRecordRpcs, Forbidden } from "@examinus/contract";
import { Effect } from "effect";
import { requirePermission } from "../auth/Session.ts";
import { RecordsService } from "./Service.ts";

export const ClassRecordHandlers = ClassRecordRpcs.toLayer(
  Effect.gen(function* () {
    const records = yield* RecordsService;

    return ClassRecordRpcs.of({
      "classRecord.get": Effect.fn("classRecord.get")(function* ({ classId }) {
        const me = yield* requirePermission({ classRecord: ["read"] });
        return yield* records.get(me.id, classId);
      }),

      "classRecord.save": Effect.fn("classRecord.save")(function* ({ record }) {
        const me = yield* requirePermission({ classRecord: ["update"] });
        return yield* records.save(me.id, record);
      }),

      "classRecord.mine": Effect.fn("classRecord.mine")(function* ({ classId }) {
        const user = yield* requirePermission({ enrollment: ["read"] });
        if (user.role !== "student") return yield* new Forbidden({ message: "Only students have their own record." });
        return yield* records.mine(user.id, classId);
      }),
    });
  }),
);
