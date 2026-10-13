import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { ClassInfo, RosterStudent, SexSchema } from "@examinus/domain/classes";
import { Conflict, Forbidden, NotFound, TooManyRequests } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";
import { ClassId } from "./shared.ts";

// A student's own classes.
export class EnrollmentRpcs extends RpcGroup.make(
  // Their roster entry (none before they first join a class) and the classes they're in.
  Rpc.make("mine", {
    success: Schema.Struct({ student: Schema.NullOr(RosterStudent), classes: Schema.Array(ClassInfo) }),
    error: Forbidden,
  }),
  // `sex` and `studentNumber` are needed the first time, for the teacher's grade sheet.
  Rpc.make("join", {
    payload: {
      code: Schema.String,
      sex: Schema.NullOr(SexSchema),
      studentNumber: Schema.NullOr(Schema.String.check(Schema.isMaxLength(40))),
    },
    success: Schema.Struct({ classId: Schema.String }),
    error: Schema.Union([Forbidden, NotFound, Conflict, TooManyRequests]),
  }),
  Rpc.make("leave", { payload: ClassId, error: Schema.Union([Forbidden, NotFound]) }),
)
  .prefix("enrollment.")
  .middleware(AuthMiddleware) {}
