// A teacher's classes, and the students on their rosters. Students join a class with its code; a roster entry
// can also come from Google Classroom or the demo data without an account behind it.
import type { AttendanceStatus } from "@examora/contract/attendance";
import { sexNames, subjectAreaNames } from "@examora/contract/roles";
import { date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { createdAt, timestamps, timestamptz } from "./_helpers.ts";
import { users } from "./auth.ts";

export const sex = pgEnum("sex", sexNames);
export const subjectArea = pgEnum("subject_area", subjectAreaNames);

export const classes = pgTable(
  "classes",
  {
    id: text("id").primaryKey(),
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
    // What students enter to join.
    joinCode: text("join_code").notNull().unique(),
    // The Google Classroom course this class mirrors, if it was imported.
    classroom: jsonb("classroom").$type<{ courseId: string; link: string; lastSyncedAt: string }>(),
    // Archived classes are hidden from the teacher and their students; nothing is deleted.
    archivedAt: timestamptz("archived_at"),
    ...timestamps,
  },
  (t) => [index("classes_teacher_id_idx").on(t.teacherId)],
);

// A person on class rosters. A student account has at most one, made the first time it joins a class.
export const students = pgTable("students", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .unique()
    .references(() => users.id, { onDelete: "set null" }),
  studentNumber: text("student_number").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  // The grade sheet lists male and female students separately.
  sex: sex("sex").notNull(),
  ...timestamps,
});

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
// (meetingDates in @examora/contract), so only roll calls are stored.
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

export type ClassItem = typeof classes.$inferSelect;
export type StudentItem = typeof students.$inferSelect;
