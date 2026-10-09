import { Schema } from "effect";
import { sexNames, subjectAreaNames } from "./roles.ts";

export const SubjectAreaSchema = Schema.Literals(subjectAreaNames);
export const SexSchema = Schema.Literals(sexNames);

// The Google Classroom course a class mirrors.
export const ClassroomLink = Schema.Struct({ courseId: Schema.String, link: Schema.String, lastSyncedAt: Schema.String });

// A class as its students see it.
export const ClassInfo = Schema.Struct({
  id: Schema.String,
  courseCode: Schema.String,
  title: Schema.String,
  subjectArea: Schema.NullOr(SubjectAreaSchema),
  section: Schema.String,
  term: Schema.String,
  schedule: Schema.String,
  room: Schema.String,
  units: Schema.Number,
  classroom: Schema.NullOr(ClassroomLink),
  // Roster entries (RosterStudent ids).
  studentIds: Schema.Array(Schema.String),
});
export type ClassInfo = typeof ClassInfo.Type;

// A class as its teacher sees it: with the code students join with.
export const TeacherClass = Schema.Struct({ ...ClassInfo.fields, joinCode: Schema.String });
export type TeacherClass = typeof TeacherClass.Type;

const Text = (max: number) => Schema.String.check(Schema.isMaxLength(max));
const Required = (max: number) => Schema.NonEmptyString.check(Schema.isMaxLength(max));

// What a teacher fills in to create or edit a class.
export const ClassFields = Schema.Struct({
  courseCode: Required(40),
  title: Required(120),
  subjectArea: Schema.NullOr(SubjectAreaSchema),
  section: Text(60),
  term: Text(60),
  schedule: Text(80),
  room: Text(60),
  units: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 12 })),
});
export type ClassFields = typeof ClassFields.Type;

// A person on a class roster. One imported from Google Classroom has no student number ("") or sex (null) until the
// student signs in and fills them in.
export const RosterStudent = Schema.Struct({
  id: Schema.String,
  studentNumber: Schema.String,
  firstName: Schema.String,
  lastName: Schema.String,
  email: Schema.String,
  sex: Schema.NullOr(SexSchema),
});
export type RosterStudent = typeof RosterStudent.Type;
