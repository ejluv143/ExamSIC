// Demo and test accounts, plus the demo quizzes and submissions, for development and CI: `pnpm db:seed`.
// Re-running leaves existing rows untouched.
import "../load-env.ts";
import { NodeRuntime } from "@effect/platform-node";
import { manilaDate } from "@examora/contract";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { Database } from "../Database.ts";
import {
  accounts,
  answers,
  attempts,
  bankQuestions,
  classes,
  classMeetings,
  classMembers,
  codeResults,
  integrityEvents,
  questions,
  quizParts,
  quizSessions,
  quizzes,
  sessionStudents,
  students,
  typingEdits,
  users,
  type NewUser,
} from "./schemas/index.ts";
import { seedClasses, seedMeetings, seedStudents } from "./seed-classes.ts";
import { buildBank, buildDemoQuizzes } from "./seed-quizzes.ts";

const demoPassword = "examora-demo";
const testPassword = "12341234";

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

// Every roster student signs in too, so the demo submissions have an owner and every class member can take the
// seeded sessions. Accounts above (the test student is s10, the demo student s9) win.
const rosterUsers: (NewUser & { password: string })[] = seedStudents
  .filter((s) => !seedUsers.some((u) => u.id === s.userId))
  .map((s) => ({
    id: s.userId!,
    role: "student",
    studentId: s.id,
    name: `${s.firstName} ${s.lastName}`,
    email: s.email,
    emailVerified: true,
    password: demoPassword,
  }));
seedUsers.push(...rosterUsers);

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
        await tx.insert(classes).values(cls).onConflictDoNothing();
        await tx
          .insert(classMembers)
          .values(studentIds.map((studentId) => ({ classId: cls.id, studentId })))
          .onConflictDoNothing();
      }
      const meetings = seedMeetings(manilaDate());
      if (meetings.length) await tx.insert(classMeetings).values(meetings).onConflictDoNothing();
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
  yield* Effect.log(
    `Question bank: ${bank.length}. Demo quizzes: ${quiz.quizzes.length}, sessions: ${quiz.sessions.length}, attempts: ${quiz.attempts.length}, answers: ${quiz.answers.length}.`,
  );
});

seed.pipe(Effect.provide(Database.layer), NodeRuntime.runMain);
