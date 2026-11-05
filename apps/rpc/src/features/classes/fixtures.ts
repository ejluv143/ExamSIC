// Fixtures for the class tests: row builders and an in-memory ClassRepo with the rules the real one has (an archived
// class is invisible, a claim goes to an unclaimed entry only), and a ClassRoster that keeps the members and records what
// the real one does to the sessions (its rules are tested against Postgres in Roster.test.ts).
import { Effect, Layer } from "effect";
import type { ClassItem, StudentItem } from "../../database/schemas/index.ts";
import { stub } from "../../testing/config.ts";
import type { Actor } from "../auth/Session.ts";
import { ClassRepo, type LinkedAccount } from "./Repo.ts";
import { ClassRoster } from "./Roster.ts";

const epoch = new Date("2026-01-01T00:00:00Z");

export const classItem = (overrides: Partial<ClassItem> = {}): ClassItem => ({
  id: "c1",
  organizationId: "org1",
  teacherId: "t1",
  courseCode: "IT101",
  title: "Intro",
  subjectArea: null,
  section: "A",
  term: "1st",
  schedule: "",
  room: "",
  units: 3,
  joinCode: "ABCDEFG",
  classroom: null,
  archivedAt: null,
  createdAt: epoch,
  updatedAt: epoch,
  ...overrides,
});

export const studentItem = (overrides: Partial<StudentItem> = {}): StudentItem => ({
  id: "s1",
  organizationId: "org1",
  userId: null,
  studentNumber: "2024-001",
  firstName: "Ann",
  lastName: "Cruz",
  email: "ann@x.ph",
  sex: "F",
  createdAt: epoch,
  updatedAt: epoch,
  ...overrides,
});

export const googleAccount = (overrides: Partial<LinkedAccount> = {}): LinkedAccount => ({
  id: "acc1",
  accountId: "google-1",
  providerId: "google",
  userId: "t1",
  accessToken: "token",
  refreshToken: "refresh",
  idToken: null,
  accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
  refreshTokenExpiresAt: null,
  scope:
    "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.profile.emails",
  password: null,
  createdAt: epoch,
  updatedAt: epoch,
  ...overrides,
});

export type ClassWorld = {
  classes?: ClassItem[];
  students?: StudentItem[];
  // [classId, studentId] pairs, in the order they joined.
  members?: Array<[string, string]>;
  // What Better Auth knows about each account's email, by user id.
  emails?: Record<string, { email: string; verified: boolean }>;
  accounts?: LinkedAccount[];
};

export const fakeClassRepo = (world: ClassWorld = {}) => {
  // Copies, so a test changing a row doesn't leak into the shared world.
  const classes = (world.classes ?? []).map((c) => ({ ...c }));
  const students = (world.students ?? []).map((s) => ({ ...s }));
  const members = (world.members ?? []).map(([classId, studentId]) => ({ classId, studentId }));
  const accounts = (world.accounts ?? []).map((a) => ({ ...a }));
  // What the roster did to sessions, recorded as "joined c1 s1", "left c1 s1", "claimed s1", "filled sess1 c1", "moved sess1 c1".
  const sessionChanges: string[] = [];
  const savedTokens: Array<{ accountId: string; accessToken: string }> = [];
  const visible = (c: ClassItem) => c.archivedAt === null;
  const isTheirs = (c: ClassItem, actor: Actor) =>
    c.teacherId === actor.id && c.organizationId === actor.organizationId && visible(c);
  const studentById = (id: string) => students.find((s) => s.id === id);
  const memberOf = (classId: string, studentId: string) =>
    members.some((m) => m.classId === classId && m.studentId === studentId);

  const repo = stub<ClassRepo["Service"]>("ClassRepo", {
    findOwn: (actor, classId) => Effect.sync(() => classes.find((c) => c.id === classId && isTheirs(c, actor)) ?? null),
    ofTeacher: (actor) => Effect.sync(() => classes.filter((c) => isTheirs(c, actor))),
    members: (classIds) => Effect.sync(() => members.filter((m) => classIds.includes(m.classId))),
    memberIds: (classId) => Effect.sync(() => members.filter((m) => m.classId === classId).map((m) => m.studentId)),
    membership: (userId, classId) =>
      Effect.sync(() => {
        const cls = classes.find((c) => c.id === classId && visible(c));
        const student = students.find((s) => s.userId === userId && s.organizationId === cls?.organizationId);
        return student && cls && memberOf(classId, student.id) ? { cls, studentId: student.id } : null;
      }),
    insert: (row) => Effect.sync(() => void classes.push(Object.assign(classItem(), row))),
    update: (classId, set) =>
      Effect.sync(() => {
        const found = classes.find((c) => c.id === classId);
        if (found) Object.assign(found, set);
      }),
    studentOf: (organizationId, userId) =>
      Effect.sync(() => students.find((s) => s.organizationId === organizationId && s.userId === userId) ?? null),
    emailOf: (userId) => Effect.sync(() => world.emails?.[userId] ?? null),
    claimByEmail: (organizationId, userId, email) =>
      Effect.sync(() => {
        const entry = students.find((s) => s.organizationId === organizationId && s.userId === null && s.email.toLowerCase() === email.toLowerCase());
        if (!entry) return null;
        entry.userId = userId;
        return entry;
      }),
    classesOf: (studentId) =>
      Effect.sync(() => classes.filter((c) => visible(c) && memberOf(c.id, studentId))),
    idByJoinCode: (code) =>
      Effect.sync(() => {
        const cls = classes.find((c) => c.joinCode === code && visible(c));
        return cls ? { id: cls.id, organizationId: cls.organizationId } : null;
      }),
    fillStudent: (studentId, studentNumber, sex) =>
      Effect.sync(() => {
        const entry = studentById(studentId);
        if (!entry) return null;
        Object.assign(entry, { studentNumber, sex });
        return entry;
      }),
    ensureStudent: (row) =>
      Effect.sync(() => {
        if (!students.some((s) => s.organizationId === row.organizationId && s.userId === row.userId)) students.push(Object.assign(studentItem(), row));
      }),
    googleAccounts: (userId) => Effect.sync(() => accounts.filter((a) => a.userId === userId)),
    saveToken: (accountId, accessToken) => Effect.sync(() => void savedTokens.push({ accountId, accessToken })),
    imported: (actor) =>
      Effect.sync(() =>
        classes
          .filter((c) => isTheirs(c, actor) && c.classroom !== null)
          .map((c) => ({ id: c.id, classroom: c.classroom })),
      ),
    studentByEmail: (organizationId, email) =>
      Effect.sync(() => {
        const entry = students.find((s) => s.organizationId === organizationId && s.email.toLowerCase() === email);
        return entry ? { id: entry.id, userId: entry.userId } : null;
      }),
    insertStudent: (row) => Effect.sync(() => void students.push(Object.assign(studentItem(), row))),
    countMembers: (classId) => Effect.sync(() => members.filter((m) => m.classId === classId).length),
  });
  const roster = stub<ClassRoster["Service"]>("ClassRoster", {
    joined: (classId, studentId) =>
      Effect.sync(() => {
        sessionChanges.push(`joined ${classId} ${studentId}`);
        if (memberOf(classId, studentId)) return false;
        members.push({ classId, studentId });
        return true;
      }),
    left: (classId, studentId) =>
      Effect.sync(() => {
        const at = members.findIndex((m) => m.classId === classId && m.studentId === studentId);
        if (at < 0) return false;
        members.splice(at, 1);
        sessionChanges.push(`left ${classId} ${studentId}`);
        return true;
      }),
    claimed: (studentId) => Effect.sync(() => void sessionChanges.push(`claimed ${studentId}`)),
  });
  return { layer: Layer.mergeAll(Layer.succeed(ClassRepo, repo), Layer.succeed(ClassRoster, roster)), classes, students, members, sessionChanges, savedTokens };
};
