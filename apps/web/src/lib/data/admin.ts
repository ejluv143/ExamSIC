// Account management for admins. Reads the auth tables directly; changes go through Better Auth's
// admin API (src/app/admin/actions.ts), which enforces the same permissions.
import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/database/client";
import { users, type UserItem } from "@/database/schemas";
import { requirePermission } from "../auth/dal";
import { students } from "./mock";

const columns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  department: users.department,
  studentId: users.studentId,
  banned: users.banned,
  createdAt: users.createdAt,
};

export type AccountRow = Pick<UserItem, keyof typeof columns>;

export async function listUsers(): Promise<AccountRow[]> {
  await requirePermission({ user: ["list"] });
  return db.select(columns).from(users).orderBy(asc(users.role), asc(users.name));
}

export async function getAccount(id: string): Promise<AccountRow | null> {
  await requirePermission({ user: ["get"] });
  const [user] = await db.select(columns).from(users).where(eq(users.id, id));
  return user ?? null;
}

// Class-roster entries a student account can sign in as.
export async function getRoster() {
  await requirePermission({ user: ["list"] });
  return students
    .map((s) => ({ id: s.id, label: `${s.lastName}, ${s.firstName} · ${s.studentNumber}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Each roster entry belongs to at most one account (users.student_id is unique).
export async function rosterEntryTaken(studentId: string, exceptUserId?: string) {
  await requirePermission({ user: ["list"] });
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.studentId, studentId), exceptUserId ? ne(users.id, exceptUserId) : undefined));
  return Boolean(row);
}
