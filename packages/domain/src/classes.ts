import { Schema } from "effect";
import { sexNames, subjectAreaNames } from "./roles.ts";

export const SubjectAreaSchema = Schema.Literals(subjectAreaNames);
export const SexSchema = Schema.Literals(sexNames);

// The colour a teacher gives a class: its banner, and its tile in the lists. Null: the theme's own colour.
export const classColors = {
  blue: { label: "Blue", from: "#2563eb", to: "#1e40af" },
  teal: { label: "Teal", from: "#0d9488", to: "#115e59" },
  green: { label: "Green", from: "#16a34a", to: "#166534" },
  orange: { label: "Orange", from: "#ea580c", to: "#9a3412" },
  red: { label: "Red", from: "#dc2626", to: "#991b1b" },
  pink: { label: "Pink", from: "#db2777", to: "#9d174d" },
  purple: { label: "Purple", from: "#7c3aed", to: "#5b21b6" },
  slate: { label: "Slate", from: "#475569", to: "#1e293b" },
} as const;
export const classColorNames = Object.keys(classColors) as [ClassColor, ...ClassColor[]];
export type ClassColor = keyof typeof classColors;
export const ClassColorSchema = Schema.Literals(["blue", "teal", "green", "orange", "red", "pink", "purple", "slate"]);

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
  color: Schema.NullOr(ClassColorSchema),
  headerImage: Schema.NullOr(Schema.String),
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

// What "Customize" on the class banner sets.
export const ClassAppearance = Schema.Struct({
  color: Schema.NullOr(ClassColorSchema),
  headerImage: Schema.NullOr(Schema.String),
});
export type ClassAppearance = typeof ClassAppearance.Type;

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
  color: Schema.NullOr(ClassColorSchema),
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

// A post a teacher makes to a class's stream.
export const PostKind = Schema.Literals(["announcement", "assignment", "activity"]);
export type PostKind = typeof PostKind.Type;

export const Announcement = Schema.Struct({
  id: Schema.String,
  kind: PostKind,
  // Assignments and activities have one; an announcement doesn't ("").
  title: Schema.String,
  body: Schema.String,
  // When an assignment or activity is due (ISO), if it has a deadline.
  dueAt: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
});
export type Announcement = typeof Announcement.Type;

export const AnnouncementBody = Schema.String.check(Schema.isMaxLength(5000));
export const PostTitle = Schema.String.check(Schema.isMaxLength(150));

// What a teacher fills in to post to the stream: an announcement needs text, an assignment or activity a title.
export const PostFields = Schema.Struct({
  kind: PostKind,
  title: PostTitle,
  body: AnnouncementBody,
  dueAt: Schema.NullOr(Schema.String),
});
export type PostFields = typeof PostFields.Type;
