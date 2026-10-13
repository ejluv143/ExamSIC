import { AttendanceHandlers } from "./Handlers.ts";
import { AttendanceRepo } from "./Repo.ts";
import { AttendanceService } from "./Service.ts";

// Attendance.
export const Repo = AttendanceRepo.layer;
export const Services = AttendanceService.layer;
export const Live = AttendanceHandlers;
