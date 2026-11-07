// Rows for the PGlite tests that other rows point to (foreign keys), so a test only states what it is about.
import type { TestDb } from "./postgres.ts";
import { members, organizations, quizParts, users } from "../database/schemas/index.ts";

export const seedOrganizations = (db: TestDb, ...ids: string[]) =>
  db.insert(organizations).values(ids.map((id) => ({ id, name: id, slug: id })));

// Accounts `<id>@test.dev`.
export const seedUsers = (db: TestDb, ...ids: string[]) =>
  db.insert(users).values(ids.map((id) => ({ id, name: id, email: `${id}@test.dev`, role: "user" as const })));

// A guest is an anonymous account.
export const seedGuest = (db: TestDb, id: string) =>
  db.insert(users).values({ id, name: id, email: `${id}@test.dev`, role: "guest", isAnonymous: true });

export const seedMember = (db: TestDb, organizationId: string, userId: string) =>
  db.insert(members).values({ id: `${organizationId}-${userId}`, organizationId, userId, role: "teacher" });

export const seedPart = (db: TestDb, quizId: string, id = `${quizId}-part`) =>
  db.insert(quizParts).values({ id, quizId, position: 0, title: "Part" });
