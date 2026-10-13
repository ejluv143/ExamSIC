import { AttendanceRpcs } from "@examinus/contract/attendance";
import { Forbidden } from "@examinus/contract/errors";
import { Effect } from "effect";
import { requirePermission } from "../auth/Session.ts";
import { AttendanceService } from "./Service.ts";

export const AttendanceHandlers = AttendanceRpcs.toLayer(
  Effect.gen(function* () {
    const attendance = yield* AttendanceService;

    return AttendanceRpcs.of({
      "attendance.meetings": Effect.fn("attendance.meetings")(function* ({ classId }) {
        const me = yield* requirePermission({ attendance: ["read"] });
        return yield* attendance.meetings(me.id, classId);
      }),

      "attendance.today": Effect.fn("attendance.today")(function* () {
        const me = yield* requirePermission({ attendance: ["read"] });
        return yield* attendance.today(me.id);
      }),

      "attendance.save": Effect.fn("attendance.save")(function* (input) {
        const me = yield* requirePermission({ attendance: ["update"] });
        return yield* attendance.save(me.id, input);
      }),

      "attendance.mine": Effect.fn("attendance.mine")(function* ({ classId }) {
        const user = yield* requirePermission({ enrollment: ["read"] });
        if (user.role !== "student")
          return yield* new Forbidden({ message: "Only students have their own attendance." });
        return yield* attendance.mine(user.id, classId);
      }),
    });
  }),
);
