// Display text for the roll-call statuses.
import type { AttendanceStatus } from "@examinus/domain/attendance";

export const statusLabel: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};
