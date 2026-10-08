// Demo and test accounts for development and CI: `pnpm db:seed`. Re-running leaves existing accounts untouched.
import "../load-env.ts";
import { NodeRuntime } from "@effect/platform-node";
import { hashPassword } from "better-auth/crypto";
import { Effect } from "effect";
import { Database } from "../Database.ts";
import {
  accounts,
  classes,
  classMembers,
  students,
  users,
  type ClassItem,
  type NewUser,
  type StudentItem,
} from "./schemas/index.ts";

const demoPassword = "examora-demo";
const testPassword = "12341234";

// Ids and roster entries match the web app's mock data (apps/web/src/lib/data/mock.ts).
const seedUsers: (NewUser & { password: string })[] = [
  // Test accounts, one per role.
  {
    id: "a1",
    role: "admin",
    name: "Test Admin",
    email: "admin@sic.edu.ph",
    emailVerified: true,
    password: testPassword,
  },
  {
    id: "t-test",
    role: "teacher",
    name: "Test Teacher",
    email: "teacher@sic.edu.ph",
    emailVerified: true,
    department: "School of Information Technology",
    // On Pro, so every feature shows; the demo teacher stays on Free.
    plan: "pro",
    password: testPassword,
  },
  {
    id: "u-s10",
    role: "student",
    // Same classes as the demo student (IT302 and GEA101).
    studentId: "s10",
    name: "Test Student",
    email: "student@sic.edu.ph",
    emailVerified: true,
    password: testPassword,
  },
  // Demo accounts.
  {
    id: "t1",
    role: "teacher",
    name: "Prof. Reyes",
    email: "j.reyes@sic.edu.ph",
    emailVerified: true,
    department: "School of Information Technology",
    password: demoPassword,
  },
  {
    id: "u-s9",
    role: "student",
    // Enrolled in IT302 and GEA101, so the demo shows open, upcoming and finished work.
    studentId: "s9",
    name: "Hannah Ramos",
    email: "hannah.ramos@student.sic.edu.ph",
    emailVerified: true,
    password: demoPassword,
  },
];

// The demo roster and classes, with the same ids as the web app's mock data (apps/web/src/lib/data/mock.ts), whose
// quizzes, submissions, class records and attendance refer to them. The test teacher owns the classes.
const firstNames = [
  "Andrea", "Miguel", "Bea", "Carlo", "Denise", "Enzo", "Francine", "Gabriel",
  "Hannah", "Ivan", "Jasmine", "Kyle", "Lara", "Marco", "Nicole", "Paolo",
  "Rica", "Sean", "Trisha", "Vince", "Yna", "Zach", "Alyssa", "Bryan",
];
const lastNames = [
  "Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Mendoza", "Torres", "Flores",
  "Ramos", "Villanueva", "Aquino", "Castillo", "Navarro", "Domingo", "Lopez", "Rivera",
  "Morales", "Pascual", "Salazar", "Dela Cruz", "Gonzales", "Fernandez", "Soriano", "Valdez",
];
// The seeded student accounts and the roster entries they are.
const rosterAccounts: Record<string, string> = { s9: "u-s9", s10: "u-s10" };
const seedStudents: Omit<StudentItem, "createdAt" | "updatedAt">[] = firstNames.map((first, i) => {
  const last = lastNames[i]!;
  return {
    id: `s${i + 1}`,
    userId: rosterAccounts[`s${i + 1}`] ?? null,
    studentNumber: `2023-${String(10241 + i * 37).padStart(5, "0")}`,
    firstName: first,
    lastName: last,
    email: `${first}.${last.replace(" ", "")}@student.sic.edu.ph`.toLowerCase(),
    // The demo first names alternate female and male.
    sex: i % 2 === 0 ? "F" : "M",
  };
});
const roster = (from: number, to: number) => seedStudents.slice(from, to).map((s) => s.id);

const term = "1st Sem 2026–2027";
const lastSyncedAt = "2026-10-06T07:30:00+08:00";
const classroom = (courseId: string) => ({ courseId, link: `https://classroom.google.com/c/${courseId}`, lastSyncedAt });
const seedClasses: (Omit<ClassItem, "createdAt" | "updatedAt" | "archivedAt"> & { studentIds: string[] })[] = [
  {
    id: "c1",
    teacherId: "t-test",
    courseCode: "IT302",
    subjectArea: "programming",
    title: "Database Management Systems",
    section: "BSIT 3-A",
    term,
    schedule: "MWF 9:00–10:30 AM",
    room: "Lab 204",
    units: 3,
    joinCode: "DBMS3AX",
    classroom: classroom("683920114527"),
    studentIds: roster(0, 14),
  },
  {
    id: "c2",
    teacherId: "t-test",
    courseCode: "GEA101",
    subjectArea: "math",
    title: "Business Logic",
    section: "BSIT 1-B",
    term,
    schedule: "TTh 1:00–2:30 PM",
    room: "Room 312",
    units: 3,
    joinCode: "LOGIC1B",
    classroom: classroom("683920118841"),
    studentIds: roster(8, 24),
  },
  {
    id: "c3",
    teacherId: "t-test",
    courseCode: "ITPROF EL1",
    subjectArea: "programming",
    title: "Professional Elective 1",
    section: "BSIT 4-A",
    term,
    schedule: "Sat 8:00–11:00 AM",
    room: "Lab 101",
    units: 3,
    joinCode: "ELECT4A",
    classroom: classroom("683920120365"),
    studentIds: roster(16, 24),
  },
];

const seed = Effect.gen(function* () {
  const db = yield* Database;
  const created = yield* db.query((d) =>
    d.transaction(async (tx) => {
      const ids: string[] = [];
      for (const { password: plain, ...user } of seedUsers) {
        const [row] = await tx.insert(users).values(user).onConflictDoNothing().returning({ id: users.id });
        if (!row) continue;
        // Better Auth's email sign-in reads the password hash from the user's "credential" account.
        const password = await hashPassword(plain);
        await tx
          .insert(accounts)
          .values({ id: `${row.id}-credential`, accountId: row.id, providerId: "credential", userId: row.id, password });
        ids.push(row.id);
      }
      // Classes and roster entries come after the accounts they refer to.
      await tx.insert(students).values(seedStudents).onConflictDoNothing();
      for (const { studentIds, ...cls } of seedClasses) {
        const [row] = await tx.insert(classes).values(cls).onConflictDoNothing().returning({ id: classes.id });
        if (row) await tx.insert(classMembers).values(studentIds.map((studentId) => ({ classId: row.id, studentId })));
      }
      return ids;
    }),
  );
  yield* Effect.log(created.length ? `Seeded users: ${created.join(", ")}` : "Seed users already exist.");
});

seed.pipe(Effect.provide(Database.layer), NodeRuntime.runMain);
