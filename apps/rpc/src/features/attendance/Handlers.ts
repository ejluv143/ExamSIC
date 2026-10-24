import { AttendanceRpcs } from "@examinus/contract/attendance";
import { Forbidden } from "@examinus/contract/errors";
import { roleOf } from "@examinus/domain/roles";
import { Effect } from "effect";
import { requireActor } from "../auth/Session.ts";
import { AttendanceService } from "./Service.ts";

export const AttendanceHandlers = AttendanceRpcs.toLayer(
  Effect.gen(function* () {
    const attendance = yield* AttendanceService;

    return AttendanceRpcs.of({
      "attendance.meetings": Effect.fn("attendance.meetings")(function* ({ classId }) {
        const me = yield* requireActor({ attendance: ["read"] });
        return yield* attendance.meetings(me.actor, classId);
      }),

      "attendance.today": Effect.fn("attendance.today")(function* () {
        const me = yield* requireActor({ attendance: ["read"] });
        return yield* attendance.today(me.actor);
      }),

      "attendance.save": Effect.fn("attendance.save")(function* (input) {
        const me = yield* requireActor({ attendance: ["update"] });
        return yield* attendance.save(me.actor, input);
      }),

      "attendance.mine": Effect.fn("attendance.mine")(function* ({ classId }) {
        const me = yield* requireActor({ enrollment: ["read"] });
        if (roleOf(me) !== "student")
          return yield* new Forbidden({ message: "Only students have their own attendance." });
        return yield* attendance.mine(me.actor, classId);
      }),
    });
  }),
);
