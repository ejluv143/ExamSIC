// Google Classroom: a teacher connects their Google account (read-only Classroom access), imports courses as classes,
// and syncs their rosters.
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { ResponseCookie } from "./domain.ts";
import { Conflict, Forbidden, NotFound } from "./errors.ts";
import { AuthMiddleware } from "./middleware.ts";

// What Examinus asks Google for: the teacher's courses and rosters, with students' emails so they match accounts.
export const classroomScopes = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.rosters.readonly",
  "https://www.googleapis.com/auth/classroom.profile.emails",
] as const;

// Google or Classroom refused or failed; `message` is written for people.
export class ClassroomUnavailable extends Schema.TaggedError<ClassroomUnavailable>()("ClassroomUnavailable", {
  message: Schema.String,
}) {}

export const ClassroomStatus = Schema.Struct({
  // GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set on the API.
  configured: Schema.Boolean,
  // The teacher's Google account is linked with Classroom access.
  connected: Schema.Boolean,
});

// A course the teacher teaches in Classroom. `classId` is the Examinus class it was imported as, if any.
export const ClassroomCourse = Schema.Struct({
  courseId: Schema.String,
  name: Schema.String,
  section: Schema.String,
  room: Schema.String,
  link: Schema.String,
  classId: Schema.NullOr(Schema.String),
});
export type ClassroomCourse = typeof ClassroomCourse.Type;

const Cookies = Schema.Array(ResponseCookie);

const RosterChange = Schema.Struct({ added: Schema.Number, total: Schema.Number });

export class ClassroomRpcs extends RpcGroup.make(
  Rpc.make("status", { success: ClassroomStatus, error: Forbidden }),
  // Google's consent URL for linking the teacher's Google account with Classroom access, plus Better Auth's OAuth
  // state cookie. Google comes back to Better Auth's callback, then to `callbackURL`.
  Rpc.make("connect", {
    payload: { callbackURL: Schema.String, errorCallbackURL: Schema.String },
    success: Schema.Struct({ url: Schema.String, cookies: Cookies }),
    error: Schema.Union([Forbidden, ClassroomUnavailable]),
  }),
  // The teacher's active Classroom courses.
  Rpc.make("courses", {
    success: Schema.Array(ClassroomCourse),
    error: Schema.Union([Forbidden, Conflict, ClassroomUnavailable]),
  }),
  // Imports courses as classes (skipping ones already imported) with their rosters.
  Rpc.make("import", {
    payload: { courseIds: Schema.Array(Schema.String) },
    success: Schema.Struct({ classIds: Schema.Array(Schema.String) }),
    error: Schema.Union([Forbidden, Conflict, ClassroomUnavailable]),
  }),
  // Adds students who joined the class's Classroom course since the last sync. Nobody is removed.
  Rpc.make("sync", {
    payload: { classId: Schema.String },
    success: RosterChange,
    error: Schema.Union([Forbidden, NotFound, Conflict, ClassroomUnavailable]),
  }),
)
  .prefix("classroom.")
  .middleware(AuthMiddleware) {}
