// An organization's classes, and the students on their rosters. Students join a class with its code; a roster entry
// can also come from Google Classroom or the demo data without an account behind it.
import type { AttendanceStatus } from "@examinus/domain/attendance";
import type { ClassRecord } from "@examinus/contract/class-record";
import { sexNames, subjectAreaNames } from "@examinus/domain/roles";
import { sql } from "drizzle-orm";
import { date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, timestamps, timestamptz } from "./_helpers.ts";
import { users } from "./auth.ts";
import { organizations } from "./organizations.ts";

export const sex = pgEnum("sex", sexNames);
export const subjectArea = pgEnum("subject_area", subjectAreaNames);

export const classes = pgTable(
  "classes",
  {
    id: text("id").primaryKey(),
    // Null: a class in its teacher's personal space.
    organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseCode: text("course_code").notNull(),
    title: text("title").notNull(),
    // No subject: guessed from the course code and title.
    subjectArea: subjectArea("subject_area"),
    section: text("section").notNull().default(""),
    term: text("term").notNull().default(""),
    schedule: text("schedule").notNull().default(""),
    room: text("room").notNull().default(""),
    units: integer("units").notNull().default(3),
    // What students enter to join. Unique across organizations: the code says which one the class is in.
    joinCode: text("join_code").notNull().unique(),
    // The Google Classroom course this class mirrors, if it was imported.
    classroom: jsonb("classroom").$type<{ courseId: string; link: string; lastSyncedAt: string }>(),
    // Archived classes are hidden from the teacher and their students; nothing is deleted.
    archivedAt: timestamptz("archived_at"),
    ...timestamps,
  },
  (t) => [index("classes_teacher_id_idx").on(t.teacherId), index("classes_organization_id_idx").on(t.organizationId)],
);

// A person on an organization's class rosters, or (organization null) on those of personal-space classes. A student
// account has at most one per organization and one personal one, made the first time it joins a class there.
// Student numbers are the organization's, so they're unique within it; personal-space ones aren't checked, as they
// come from any number of schools.
export const students = pgTable(
  "students",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    // Null for a roster entry imported from Google Classroom, until the student signs in and fills it in.
    studentNumber: text("student_number"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    // The grade sheet lists male and female students separately. Null until known (see studentNumber).
    sex: sex("sex"),
    ...timestamps,
  },
  (t) => [
    // NULLS NOT DISTINCT: one personal-space entry per user too.
    unique("students_organization_user_unique").on(t.organizationId, t.userId).nullsNotDistinct(),
    uniqueIndex("students_organization_number_unique")
      .on(t.organizationId, t.studentNumber)
      .where(sql`${t.organizationId} is not null and ${t.studentNumber} is not null`),
    index("students_organization_id_idx").on(t.organizationId),
  ],
);

export const classMembers = pgTable(
  "class_members",
  {
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.studentId] }), index("class_members_student_id_idx").on(t.studentId)],
);

// A class meeting whose attendance was taken. Meetings themselves come from the class's schedule
// (meetingDates in @examinus/domain/attendance), so only roll calls are stored.
export const classMeetings = pgTable(
  "class_meetings",
  {
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    // Manila date, YYYY-MM-DD.
    date: date("date", { mode: "string" }).notNull(),
    // Students who weren't present, by roster id; everyone else on the roster was.
    records: jsonb("records").$type<Record<string, AttendanceStatus>>().notNull().default({}),
    takenAt: timestamptz("taken_at").notNull(),
    takenBy: text("taken_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.classId, t.date] })],
);

// A class's grade book, saved whole by the teacher. Categories and items are kept per term; scores and absences are
// by roster id. Scores linked to quiz sessions and attendance aren't stored: they're worked out when it's shown.
export const classRecords = pgTable("class_records", {
  classId: text("class_id")
    .primaryKey()
    .references(() => classes.id, { onDelete: "cascade" }),
  terms: jsonb("terms").$type<ClassRecord["terms"]>().notNull(),
  scores: jsonb("scores").$type<ClassRecord["scores"]>().notNull().default({}),
  absences: jsonb("absences").$type<ClassRecord["absences"]>().notNull(),
  dropped: jsonb("dropped").$type<readonly string[]>().notNull().default([]),
  unlinked: jsonb("unlinked").$type<readonly string[]>().notNull().default([]),
  signatories: jsonb("signatories").$type<ClassRecord["signatories"]>().notNull(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export type ClassItem = typeof classes.$inferSelect;
export type StudentItem = typeof students.$inferSelect;
