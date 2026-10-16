// Organizations (#82): a teacher who belongs to two schools sees only the active one's classes, quizzes, sessions,
// attempts and AI keys; the same account can be a teacher in one and a student in the other; members hold several
// roles. Needs an API (API_URL) on a migrated database with the test fixture loaded (test/fixture): the test teacher
// is a teacher at SIC and owner+teacher at the second school, where the demo teacher is a student.
import { beforeAll, describe, expect, test } from "bun:test";
import {
  answerFor,
  call,
  demoClassId,
  demoPassword,
  demoQuizId,
  ok,
  otherOrganizationId,
  otherTeacherEmail,
  quizSettings,
  refused,
  sicOrganizationId,
  signIn,
  studentEmail,
  students,
  teacherEmail,
  teacherPassword,
} from "./helpers.ts";

const [ann] = students as [string, ...string[]];
const device = "device-org";
const otherClassId = "c-other";

beforeAll(async () => {
  await signIn("teacher", teacherEmail, teacherPassword);
  await signIn("reyes", otherTeacherEmail, demoPassword);
  await signIn(ann, studentEmail(ann), demoPassword);
}, 30_000);

type Question = { id: string; type: string };

// Ann takes and submits a fresh session of the demo quiz at SIC, so there is an attempt to look at from elsewhere.
async function submittedAtSic() {
  const session = await ok("teacher", "session.create", {
    quizId: demoQuizId,
    classId: demoClassId,
    startNow: true,
    ...(await quizSettings()),
  });
  const attempt = await ok(ann, "attempt.start", { sessionId: session.id, deviceId: device });
  const paper = await ok(ann, "attempt.paper", { sessionId: session.id, deviceId: device });
  const questions = paper.parts.flatMap((p: { questions: Question[] }) => p.questions) as Question[];
  const answers = Object.fromEntries(questions.map((q) => [q.id, answerFor(q, true)]));
  await ok(ann, "attempt.submit", { attemptId: attempt.id, deviceId: device, answers, events: [], typing: {} });
  return { sessionId: session.id as string, attemptId: attempt.id as string };
}

describe("a teacher in two organizations", () => {
  test("the session says which organization is active and which they belong to", async () => {
    const { user } = await ok("teacher", "auth.session");
    expect(user.role).toBe("user");
    expect(user.organization.id).toBe(sicOrganizationId);
    expect(user.organization.roles).toEqual(["teacher"]);
    expect(user.memberships.map((m: { id: string }) => m.id).sort()).toEqual([otherOrganizationId, sicOrganizationId]);
    // Several roles in one organization.
    const other = user.memberships.find((m: { id: string }) => m.id === otherOrganizationId);
    expect(other.roles).toEqual(["owner", "teacher"]);
  });

  test("switching changes which classes, quizzes, sessions and attempts are visible; the rest is NotFound", async () => {
    const { sessionId, attemptId } = await submittedAtSic();
    const settings = await quizSettings();
    const sicClasses = await ok("teacher", "class.list");
    expect(sicClasses.map((c: { id: string }) => c.id)).toContain(demoClassId);
    expect(sicClasses.map((c: { id: string }) => c.id)).not.toContain(otherClassId);
    expect(await ok("teacher", "class.get", { classId: otherClassId })).toBeNull();

    const switched = await ok("teacher", "org.setActive", { organizationId: otherOrganizationId });
    expect(switched.organization.id).toBe(otherOrganizationId);
    try {
      const classes = await ok("teacher", "class.list");
      expect(classes.map((c: { id: string }) => c.id)).toEqual([otherClassId]);
      expect(await ok("teacher", "class.get", { classId: demoClassId })).toBeNull();
      expect((await ok("teacher", "quiz.list")).map((q: { id: string }) => q.id)).not.toContain(demoQuizId);
      expect(await refused("teacher", "quiz.get", { quizId: demoQuizId })).toMatch(/^NotFound/);
      expect(await refused("teacher", "session.get", { sessionId })).toMatch(/^NotFound/);
      expect(await refused("teacher", "session.create", { quizId: demoQuizId, classId: otherClassId, startNow: true, ...settings })).toMatch(/^NotFound/);
      expect((await ok("teacher", "session.list", {})).map((s: { id: string }) => s.id)).not.toContain(sessionId);
      expect(await refused("teacher", "session.examRecord", { attemptId })).toMatch(/^NotFound/);
      expect(await refused("teacher", "live.ticket", { target: { _tag: "teacher", sessionId } })).toMatch(/^NotFound/);
      // AI keys are the organization's: none at the second school even once SIC has one.
      expect(await ok("teacher", "ai.keys")).toEqual([]);
    } finally {
      await ok("teacher", "org.setActive", { organizationId: sicOrganizationId });
    }
    const back = await ok("teacher", "session.get", { sessionId });
    expect(back.session.id).toBe(sessionId);
  });

  test("one account can be a teacher in one organization and a student in another", async () => {
    // Prof. Reyes teaches at SIC and studies at the second school.
    expect(await ok("reyes", "class.list")).toBeArray();
    expect(await refused("reyes", "enrollment.mine")).toMatch(/^Forbidden/);
    await ok("reyes", "org.setActive", { organizationId: otherOrganizationId });
    try {
      expect(await refused("reyes", "class.list")).toMatch(/^Forbidden/);
      const { user } = await ok("reyes", "auth.session");
      expect(user.organization.roles).toEqual(["student"]);
      // Joining a class with its code puts the roster entry in that organization.
      const joined = await ok("reyes", "enrollment.join", { code: "CS101XA", studentNumber: "2026-00001", sex: "M" });
      expect(joined.classId).toBe(otherClassId);
      const mine = await ok("reyes", "enrollment.mine");
      expect(mine.classes.map((c: { id: string }) => c.id)).toEqual([otherClassId]);
    } finally {
      await ok("reyes", "org.setActive", { organizationId: sicOrganizationId });
    }
  });

  test("a student's class code switches them to the class's organization", async () => {
    // Ann is only at SIC; the second school's class code makes her a student there too and switches her session.
    const r = await call(ann, "enrollment.join", { code: "CS101XA", studentNumber: "2026-00002", sex: "F" });
    expect(r.err).toBeUndefined();
    try {
      const { user } = await ok(ann, "auth.session");
      expect(user.organization.id).toBe(otherOrganizationId);
      expect(user.memberships.map((m: { id: string }) => m.id).sort()).toEqual([otherOrganizationId, sicOrganizationId]);
    } finally {
      await ok(ann, "org.setActive", { organizationId: sicOrganizationId });
    }
  });

  test("a member of one organization cannot switch to another", async () => {
    await signIn("student", "student@sic.edu.ph", teacherPassword);
    expect(await refused("student", "org.setActive", { organizationId: otherOrganizationId })).toMatch(/^NotFound/);
  });
});

describe("managing an organization", () => {
  test("the owner invites with a code, sets several roles, and only owners manage owners", async () => {
    await ok("teacher", "org.setActive", { organizationId: otherOrganizationId });
    try {
      const members = await ok("teacher", "org.members");
      const reyes = members.find((m: { email: string }) => m.email === otherTeacherEmail);
      expect(reyes.roles).toEqual(["student"]);
      // Reyes becomes a teacher and an admin there too.
      await ok("teacher", "org.setMemberRoles", { memberId: reyes.id, roles: ["admin", "teacher", "student"] });
      const invite = await ok("teacher", "org.createInvite", { roles: ["teacher"], expiresInDays: 7 });
      expect(invite.code).toMatch(/^[A-Z0-9]{8}$/);
      // The last owner can't give up ownership.
      expect(await refused("teacher", "org.setMemberRoles", { memberId: members.find((m: { email: string }) => m.email === teacherEmail).id, roles: ["teacher"] })).toMatch(/^Conflict/);
      // Reyes, now an admin, manages members but not owners.
      await ok("reyes", "org.setActive", { organizationId: otherOrganizationId });
      try {
        expect(await refused("reyes", "org.setMemberRoles", { memberId: reyes.id, roles: ["owner"] })).toMatch(/^Forbidden/);
        await ok("reyes", "org.setMemberRoles", { memberId: reyes.id, roles: ["student"] });
      } finally {
        await ok("reyes", "org.setActive", { organizationId: sicOrganizationId });
      }
      await ok("teacher", "org.revokeInvite", { inviteId: invite.id });
    } finally {
      await ok("teacher", "org.setActive", { organizationId: sicOrganizationId });
    }
  });

  test("a teacher who is not an admin cannot manage members or AI keys", async () => {
    expect(await refused("teacher", "org.members")).toMatch(/^Forbidden/);
    expect(await refused("teacher", "ai.setKey", { provider: "openai", apiKey: "sk-test-0000", model: "gpt-4o-mini" })).toMatch(/^Forbidden/);
  });
});
