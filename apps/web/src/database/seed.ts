// Demo and test accounts for development and CI: `pnpm db:seed`. Re-running leaves existing accounts untouched.
import "./load-env";
import { hashPassword } from "better-auth/crypto";
import { db } from "./client";
import { accounts, users, type NewUser } from "./schemas";

const demoPassword = "examora-demo";
const testPassword = "12341234";

// Ids and roster entries match the mock data in src/lib/data/mock.ts.
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

async function main() {
  const created = await db.transaction(async (tx) => {
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
    return ids;
  });
  console.log(created.length ? `Seeded users: ${created.join(", ")}` : "Seed users already exist.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
