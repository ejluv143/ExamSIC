import { meetingDates, type ClassMeeting } from "@examinus/domain/attendance";
import type { ClassItem } from "../../database/schemas/index.ts";
import type { StoredMeeting } from "./Repo.ts";

// The class's meetings so far: every scheduled day from the start of the semester to today, plus any day attendance
// was taken that's no longer on the schedule (it was changed). Newest first.
export function meetingsOf(cls: Pick<ClassItem, "id" | "schedule">, stored: readonly StoredMeeting[], today: string) {
  const byDate = new Map(stored.map((m) => [m.date, m]));
  const dates = new Set([...meetingDates(cls.schedule, today), ...byDate.keys()]);
  return [...dates]
    .sort((a, b) => b.localeCompare(a))
    .map((date): ClassMeeting => {
      const m = byDate.get(date);
      return { id: date, classId: cls.id, date, records: m?.records ?? {}, takenAt: m?.takenAt.toISOString() ?? null };
    });
}
