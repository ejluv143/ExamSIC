import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { AttendanceStatus, ClassMeeting, MeetingDate } from "@examinus/domain/attendance";
import { Conflict, Forbidden, NotFound } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";
import { ClassId } from "./shared.ts";

const ClassMeetings = Schema.Array(ClassMeeting);

// Class meetings, worked out from each class's schedule, and the roll calls teachers take.
export class AttendanceRpcs extends RpcGroup.make(
  // A teacher's class: its meetings so far, newest first.
  Rpc.make("meetings", { payload: ClassId, success: ClassMeetings, error: Schema.Union([Forbidden, NotFound]) }),
  // Today's meetings across the teacher's classes.
  Rpc.make("today", { success: ClassMeetings, error: Forbidden }),
  // Takes (or retakes) attendance. `records` lists students who weren't present; anyone else on the roster was.
  Rpc.make("save", {
    payload: { ...ClassId, date: MeetingDate, records: Schema.Record(Schema.String, AttendanceStatus) },
    success: ClassMeeting,
    error: Schema.Union([Forbidden, NotFound, Conflict]),
  }),
  // A student's own attendance in one of their classes: the same meetings, with only their own record.
  Rpc.make("mine", { payload: ClassId, success: ClassMeetings, error: Schema.Union([Forbidden, NotFound]) }),
)
  .prefix("attendance.")
  .middleware(AuthMiddleware) {}
