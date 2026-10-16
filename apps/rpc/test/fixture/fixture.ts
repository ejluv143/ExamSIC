// The data the integration tests and `check:classroom` run against, for CI only: test and demo accounts, classes, the
// demo quizzes and submissions, and the demo Team Relay. `npm run test:fixture -w @examinus/rpc` on a migrated database.
// Re-running leaves existing rows untouched.
import { BunRuntime } from "@effect/platform-bun";
import { manilaDate } from "@examinus/domain/attendance";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { Config, Effect, Layer } from "effect";
import { Database } from "../../src/platform/Database.ts";
import {
  accounts,
  answers,
  attempts,
  bankQuestions,
  bankShares,
  classes,
  classMeetings,
  classMembers,
  classRecords,
  codeResults,
  integrityEvents,
  members,
  organizations,
  questions,
  quizParts,
  quizSessions,
  quizzes,
  sessionStudents,
  students,
  typingEdits,
  users,
  type NewUser,
} from "../../src/database/schemas/index.ts";
import { seedClasses, seedClassRecords, seedMeetings, seedStudents } from "./classes.ts";
import { buildBank, buildDemoQuizzes, demoBankShares, relayDemoSession } from "./quizzes.ts";

const demoPassword = "examinus-demo";
const testPassword = "12341234";

// Two organizations: the school every demo account belongs to, and a second one the test teacher runs (owner) and the
// demo teacher studies at. The organization is what the tests switch between.
export const sicOrganization = { id: "org-sic", name: "SIC", slug: "sic" };
export const otherOrganization = { id: "org-other", name: "Second School", slug: "second-school" };

const seedUsers: (NewUser & { password: string; memberships: { organizationId: string; role: string }[] })[] = [
  // Test accounts.
  {
    id: "a1",
    role: "admin",
    name: "Test Admin",
    email: "admin@sic.edu.ph",
    emailVerified: true,
    password: testPassword,
    memberships: [{ organizationId: sicOrganization.id, role: "owner" }],
  },
  {
    id: "t-test",
    role: "user",
    name: "Test Teacher",
    email: "teacher@sic.edu.ph",
    emailVerified: true,
    department: "School of Information Technology",
    // On Pro, so every feature shows; the demo teacher stays on Free.
    plan: "pro",
    password: testPassword,
    memberships: [
      { organizationId: sicOrganization.id, role: "teacher" },
      { organizationId: otherOrganization.id, role: "owner,teacher" },
    ],
  },
  {
    id: "u-s10",
    role: "user",
    // Roster entry s10 (students.user_id): IT302 and GEA101.
    name: "Test Student",
    email: "student@sic.edu.ph",
    emailVerified: true,
    password: testPassword,
    memberships: [{ organizationId: sicOrganization.id, role: "student" }],
  },
  // Demo accounts.
  {
    id: "t1",
    role: "user",
    name: "Prof. Reyes",
    email: "j.reyes@sic.edu.ph",
    emailVerified: true,
    department: "School of Information Technology",
    password: demoPassword,
    // A teacher at SIC, a student at the second school.
    memberships: [
      { organizationId: sicOrganization.id, role: "teacher" },
      { organizationId: otherOrganization.id, role: "student" },
    ],
  },
  {
    id: "u-s9",
    role: "user",
    // Roster entry s9: enrolled in IT302 and GEA101, so the demo shows open, upcoming and finished work.
    name: "Hannah Ramos",
    email: "hannah.ramos@student.sic.edu.ph",
    emailVerified: true,
    password: demoPassword,
    memberships: [{ organizationId: sicOrganization.id, role: "student" }],
  },
];

// Every roster student signs in too, so the demo submissions have an owner and every class member can take the
// seeded sessions. Accounts above (the test student is s10, the demo student s9) win.
const rosterUsers: typeof seedUsers = seedStudents
  .filter((s) => !seedUsers.some((u) => u.id === s.userId))
  .map((s) => ({
    id: s.userId!,
    role: "user",
    name: `${s.firstName} ${s.lastName}`,
    email: s.email,
    emailVerified: true,
    password: demoPassword,
    memberships: [{ organizationId: sicOrganization.id, role: "student" }],
  }));
seedUsers.push(...rosterUsers);

const seed = Effect.gen(function* () {
  const db = yield* Database;
  const created = yield* db.query((d) =>
    d.transaction(async (tx) => {
      await tx.insert(organizations).values([sicOrganization, otherOrganization]).onConflictDoNothing();
      const ids: string[] = [];
      for (const { password: plain, memberships, ...user } of seedUsers) {
        const [row] = await tx.insert(users).values(user).onConflictDoNothing().returning({ id: users.id });
        if (!row) continue;
        // Better Auth's email sign-in reads the password hash from the user's "credential" account.
        const password = await hashPassword(plain);
        await tx
          .insert(accounts)
          .values({ id: `${row.id}-credential`, accountId: row.id, providerId: "credential", userId: row.id, password });
        await tx
          .insert(members)
          .values(memberships.map((m) => ({ id: `mem-${row.id}-${m.organizationId}`, userId: row.id, ...m })));
        ids.push(row.id);
      }
      // Classes and roster entries come after the accounts they refer to.
      await tx.insert(students).values(seedStudents).onConflictDoNothing();
      for (const { studentIds, ...cls } of seedClasses) {
        await tx.insert(classes).values(cls).onConflictDoNothing();
        if (studentIds.length === 0) continue;
        await tx
          .insert(classMembers)
          .values(studentIds.map((studentId) => ({ classId: cls.id, studentId })))
          .onConflictDoNothing();
      }
      const meetings = seedMeetings(manilaDate());
      if (meetings.length) await tx.insert(classMeetings).values(meetings).onConflictDoNothing();
      await tx.insert(classRecords).values(seedClassRecords).onConflictDoNothing();
      return ids;
    }),
  );
  yield* Effect.log(created.length ? `Seeded users: ${created.join(", ")}` : "Seed users already exist.");

  const quiz = buildDemoQuizzes();
  yield* db.query((d) =>
    d.transaction(async (tx) => {
      // Parents first; an empty list is skipped because Drizzle rejects empty inserts.
      if (quiz.quizzes.length) await tx.insert(quizzes).values(quiz.quizzes).onConflictDoNothing();
      if (quiz.parts.length) await tx.insert(quizParts).values(quiz.parts).onConflictDoNothing();
      if (quiz.questions.length) await tx.insert(questions).values(quiz.questions).onConflictDoNothing();
      // Mode and automatic scores are refreshed, so a database seeded before they existed catches up.
      if (quiz.sessions.length)
        await tx
          .insert(quizSessions)
          .values(quiz.sessions)
          .onConflictDoUpdate({ target: quizSessions.id, set: { mode: sql`excluded.mode` } });
      if (quiz.sessionStudents.length) await tx.insert(sessionStudents).values(quiz.sessionStudents).onConflictDoNothing();
      if (quiz.attempts.length) await tx.insert(attempts).values(quiz.attempts).onConflictDoNothing();
      if (quiz.answers.length)
        await tx
          .insert(answers)
          .values(quiz.answers)
          .onConflictDoUpdate({ target: answers.id, set: { autoScore: sql`excluded.auto_score` } });
      if (quiz.integrityEvents.length) await tx.insert(integrityEvents).values(quiz.integrityEvents).onConflictDoNothing();
      if (quiz.codeResults.length) await tx.insert(codeResults).values(quiz.codeResults).onConflictDoNothing();
      if (quiz.typingEdits.length) await tx.insert(typingEdits).values(quiz.typingEdits).onConflictDoNothing();
    }),
  );
  const bank = buildBank();
  yield* db.query((d) => d.insert(bankQuestions).values(bank).onConflictDoNothing());
  yield* db.query((d) => d.insert(bankShares).values(demoBankShares).onConflictDoNothing());
  yield* Effect.log(
    `Question bank: ${bank.length}. Demo quizzes: ${quiz.quizzes.length}, sessions: ${quiz.sessions.length}, attempts: ${quiz.attempts.length}, answers: ${quiz.answers.length}.`,
  );
  yield* Effect.log(`Demo Team Relay: session ${relayDemoSession.id}, join key ${relayDemoSession.joinCode}, password "${relayDemoSession.password}".`);
});

// The scripts run without the server layers, so they read only the database URL.
const databaseLayer = Layer.effect(Database, Config.Redacted("DATABASE_URL").pipe(Effect.flatMap(Database.make)));

seed.pipe(Effect.provide(databaseLayer), BunRuntime.runMain);
