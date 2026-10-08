// Attendance rules and math, shared by the teacher's and students' pages. The rules, the calendar and the meeting
// dates live in @examora/contract, so the API works out the same meetings.
import type { AttendanceStatus } from "./types";

export {
  academicCalendar,
  attendancePolicy,
  attendanceStanding,
  meetingDays,
  tally,
  termOf,
  type AttendanceTally,
} from "@examora/contract";

export const statusLabel: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};
