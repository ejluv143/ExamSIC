import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { ClassFields, RosterStudent, TeacherClass } from "@examinus/domain/classes";
import { Forbidden, NotFound } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";
import { ClassId } from "./shared.ts";

// A teacher's own classes and their rosters.
export class ClassRpcs extends RpcGroup.make(
  // Classes that aren't archived.
  Rpc.make("list", { success: Schema.Array(TeacherClass), error: Forbidden }),
  Rpc.make("get", { payload: ClassId, success: Schema.NullOr(TeacherClass), error: Forbidden }),
  Rpc.make("create", { payload: ClassFields, success: Schema.Struct({ id: Schema.String }), error: Forbidden }),
  Rpc.make("update", { payload: { ...ClassId, fields: ClassFields }, error: Schema.Union([Forbidden, NotFound]) }),
  Rpc.make("archive", { payload: ClassId, error: Schema.Union([Forbidden, NotFound]) }),
  // A new code; the old one stops working.
  Rpc.make("newJoinCode", {
    payload: ClassId,
    success: Schema.Struct({ joinCode: Schema.String }),
    error: Schema.Union([Forbidden, NotFound]),
  }),
  Rpc.make("removeStudent", { payload: { ...ClassId, studentId: Schema.String }, error: Schema.Union([Forbidden, NotFound]) }),
  // Roster entries in any of the teacher's classes; other ids are left out.
  Rpc.make("students", {
    payload: { studentIds: Schema.Array(Schema.String) },
    success: Schema.Array(RosterStudent),
    error: Forbidden,
  }),
)
  .prefix("class.")
  .middleware(AuthMiddleware) {}
