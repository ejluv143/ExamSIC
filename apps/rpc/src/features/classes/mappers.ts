import { classColors, type ClassColor, type ClassFields } from "@examinus/domain/classes";
import type { AnnouncementItem, ClassItem, StudentItem } from "../../database/schemas/index.ts";

const classColorOf = (value: string | null): ClassColor | null => (value && value in classColors ? (value as ClassColor) : null);

// The columns a teacher's class form sets, trimmed.
export const classColumns = (fields: ClassFields) => ({
  courseCode: fields.courseCode.trim(),
  title: fields.title.trim(),
  subjectArea: fields.subjectArea,
  section: fields.section.trim(),
  term: fields.term.trim(),
  schedule: fields.schedule.trim(),
  room: fields.room.trim(),
  units: fields.units,
  ...(fields.color !== undefined && { color: fields.color }),
});

export const toClassInfo = (row: ClassItem, studentIds: string[]) => ({
  id: row.id,
  courseCode: row.courseCode,
  title: row.title,
  subjectArea: row.subjectArea,
  section: row.section,
  term: row.term,
  schedule: row.schedule,
  room: row.room,
  units: row.units,
  color: classColorOf(row.color),
  headerImage: row.headerImage,
  classroom: row.classroom ?? null,
  studentIds,
});

export const toTeacherClass = ({ row, studentIds }: { row: ClassItem; studentIds: string[] }) => ({
  ...toClassInfo(row, studentIds),
  joinCode: row.joinCode,
});

export const toRosterStudent = ({ id, studentNumber, firstName, lastName, email, sex }: StudentItem) => ({
  id,
  studentNumber: studentNumber ?? "",
  firstName,
  lastName,
  email,
  sex,
});

export const toAnnouncement = ({ id, kind, title, body, dueAt, createdAt }: AnnouncementItem) => ({
  id,
  kind: (kind === "assignment" || kind === "activity" ? kind : "announcement") as "announcement" | "assignment" | "activity",
  title,
  body,
  dueAt: dueAt ? dueAt.toISOString() : null,
  createdAt: createdAt.toISOString(),
});
