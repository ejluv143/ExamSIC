import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import { AiRpcs } from "./ai.ts";
import { AssetRpcs } from "./asset.ts";
import { AttendanceStatus, ClassMeeting, MeetingDate } from "./attendance.ts";
import { ClassRecordRpcs } from "./class-record.ts";
import { ClassFields, ClassInfo, RosterStudent, SexSchema, TeacherClass } from "./classes.ts";
import { ClassroomRpcs } from "./classroom.ts";
import { Account, Password, Profile, RegistrationProfile, ResponseCookie, SessionUser } from "./domain.ts";
import {
  AccountSuspended,
  AuthRejected,
  Conflict,
  Forbidden,
  InvalidCredentials,
  NotFound,
  TooManyRequests,
  Unauthorized,
} from "./errors.ts";
import { GameFound, GameRpcs } from "./game.ts";
import { LiveTicketRpcs } from "./live.ts";
import { AuthMiddleware } from "./middleware.ts";
import { AttemptRpcs, QuizRpcs, SessionRpcs } from "./quiz-rpc.ts";

const Cookies = Schema.Array(ResponseCookie);
const UserId = { userId: Schema.String };

// Signing in and out, and reading the session. Session cookies come back in `cookies` for the web app to
// set on the browser; clients forward the browser's cookies as request headers.
export class AuthRpcs extends RpcGroup.make(
  Rpc.make("config", { success: Schema.Struct({ google: Schema.Boolean }) }),
  Rpc.make("signInEmail", {
    payload: { email: Schema.String, password: Schema.String },
    success: Schema.Struct({ user: SessionUser, cookies: Cookies }),
    error: Schema.Union([InvalidCredentials, AccountSuspended, TooManyRequests]),
  }),
  // Signing up: creates the account and signs in to it. `acceptTerms`: they agreed to the Terms of Service and
  // Privacy Policy, recorded with the time.
  Rpc.make("register", {
    payload: {
      name: Schema.NonEmptyString,
      email: Schema.String,
      password: Password,
      profile: RegistrationProfile,
      acceptTerms: Schema.Literal(true),
    },
    success: Schema.Struct({ user: SessionUser, cookies: Cookies }),
    error: Schema.Union([Conflict, AuthRejected, TooManyRequests]),
  }),
  // Returns Google's authorization URL; the OAuth callback goes to Better Auth's HTTP route.
  Rpc.make("signInGoogle", {
    payload: { callbackURL: Schema.String, errorCallbackURL: Schema.String },
    success: Schema.Struct({ url: Schema.String, cookies: Cookies }),
    error: Schema.Union([AuthRejected, TooManyRequests]),
  }),
  // Like signInGoogle, but creates the account with the profile from /register.
  Rpc.make("signUpGoogle", {
    payload: {
      profile: RegistrationProfile,
      acceptTerms: Schema.Literal(true),
      callbackURL: Schema.String,
      errorCallbackURL: Schema.String,
    },
    success: Schema.Struct({ url: Schema.String, cookies: Cookies }),
    error: Schema.Union([Conflict, AuthRejected, TooManyRequests]),
  }),
  // Plays a game as a guest: makes an anonymous account named `name`, signs in to it, and puts it on the roster
  // of the game the key opens. Only games whose teacher allowed guests; NotFound otherwise, as for a wrong key.
  Rpc.make("joinAsGuest", {
    payload: { name: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(40)), code: Schema.String },
    success: Schema.Struct({ user: SessionUser, cookies: Cookies, found: GameFound }),
    error: Schema.Union([NotFound, Conflict, TooManyRequests]),
  }),
  // `cookies` carries a refreshed session cookie when Better Auth extends the session.
  Rpc.make("session", { success: Schema.Struct({ user: SessionUser, cookies: Cookies }), error: Unauthorized }),
  Rpc.make("signOut", { success: Schema.Struct({ cookies: Cookies }) }),
).prefix("auth.") {}

// Account management, for roles granted the `user` permissions.
export class AdminRpcs extends RpcGroup.make(
  Rpc.make("listUsers", { success: Schema.Array(Account), error: Forbidden }),
  Rpc.make("getUser", { payload: UserId, success: Schema.NullOr(Account), error: Forbidden }),
  Rpc.make("createUser", {
    payload: { name: Schema.NonEmptyString, email: Schema.String, password: Password, profile: Profile },
    error: Schema.Union([Forbidden, Conflict, AuthRejected]),
  }),
  Rpc.make("updateUser", {
    payload: { ...UserId, name: Schema.NonEmptyString, profile: Profile },
    error: Schema.Union([Forbidden, Conflict, AuthRejected]),
  }),
  Rpc.make("setPassword", { payload: { ...UserId, password: Password }, error: Schema.Union([Forbidden, AuthRejected]) }),
  Rpc.make("setSuspended", {
    payload: { ...UserId, suspended: Schema.Boolean },
    error: Schema.Union([Forbidden, AuthRejected]),
  }),
  Rpc.make("removeUser", { payload: UserId, error: Schema.Union([Forbidden, AuthRejected]) }),
)
  .prefix("admin.")
  .middleware(AuthMiddleware) {}

const ClassId = { classId: Schema.String };

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

export class ApiRpcs extends AuthRpcs.merge(
  AdminRpcs,
  ClassRpcs,
  EnrollmentRpcs,
  AttendanceRpcs,
  ClassRecordRpcs,
  ClassroomRpcs,
  QuizRpcs,
  SessionRpcs,
  AttemptRpcs,
  LiveTicketRpcs,
  AssetRpcs,
  GameRpcs,
  AiRpcs,
) {}

// Served by the API at this path.
export const rpcPath = "/rpc";
