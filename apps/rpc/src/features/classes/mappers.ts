import type { ClassFields } from "@examinus/contract";
import type { ClassItem, StudentItem } from "../../database/schemas/index.ts";

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
