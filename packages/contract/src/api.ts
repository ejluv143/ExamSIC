import { AdminRpcs } from "./admin.ts";
import { AiRpcs } from "./ai.ts";
import { AssetRpcs } from "./asset.ts";
import { AttendanceRpcs } from "./attendance.ts";
import { AttemptRpcs } from "./attempt.ts";
import { AuthRpcs } from "./auth.ts";
import { AvatarRpcs } from "./avatar.ts";
import { BankRpcs } from "./bank.ts";
import { ClassRpcs } from "./class.ts";
import { ClassRecordRpcs } from "./class-record.ts";
import { ClassroomRpcs } from "./classroom.ts";
import { EnrollmentRpcs } from "./enrollment.ts";
import { GameRpcs } from "./game.ts";
import { LiveTicketRpcs } from "./live.ts";
import { OrganizationRpcs } from "./organization.ts";
import { QuizRpcs } from "./quiz.ts";
import { SessionRpcs } from "./session.ts";

export class ApiRpcs extends AuthRpcs.merge(
  AdminRpcs,
  OrganizationRpcs,
  ClassRpcs,
  EnrollmentRpcs,
  AttendanceRpcs,
  ClassRecordRpcs,
  ClassroomRpcs,
  QuizRpcs,
  BankRpcs,
  SessionRpcs,
  AttemptRpcs,
  LiveTicketRpcs,
  AssetRpcs,
  GameRpcs,
  AiRpcs,
  AvatarRpcs,
) {}

// Served by the API at this path.
export const rpcPath = "/rpc";
