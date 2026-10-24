// Organizations are optional: an account that signs up starts in its personal space, where a teacher makes classes
// and quizzes with no organization, a student joins such a class with its code, and organization-only features
// (members, AI keys, bank sharing) are refused. A member of an organization can step out to their personal space,
// where the organization's content isn't visible. Needs an API (API_URL) on a migrated database with the test fixture.
import { beforeAll, describe, expect, test } from "bun:test";
import { callFrom, demoClassId, demoQuizId, ok, refused, sicOrganizationId, signIn, switchTo, teacherEmail, teacherPassword } from "./helpers.ts";

const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const password = "Strong123";
const teacher = { name: "Solo Teacher", email: `solo-teacher-${run}@test.local`, password, profile: { role: "teacher" }, acceptTerms: true };
const student = { name: "Solo Student", email: `solo-student-${run}@test.local`, password, profile: { role: "student" }, acceptTerms: true };
const ip = `10.99.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

const classFields = { courseCode: "SOLO101", title: "Solo class", subjectArea: null, section: "", term: "", schedule: "", room: "", units: 3 };

beforeAll(async () => {
  await signIn("teacher", teacherEmail, teacherPassword);
}, 30_000);

describe("signing up", () => {
  test("gives no organization: the account starts in its personal space with the chosen role", async () => {
    const registered = await callFrom(ip, "auth.register", teacher);
    expect(registered.err).toBeUndefined();
    expect(registered.ok.user.organization).toBeNull();
    expect(registered.ok.user.memberships).toEqual([]);
    expect(registered.ok.user.personalRole).toBe("teacher");

    const studentUp = await callFrom(ip, "auth.register", student);
    expect(studentUp.err).toBeUndefined();
    expect(studentUp.ok.user.organization).toBeNull();
    expect(studentUp.ok.user.personalRole).toBe("student");
  }, 30_000);
});

describe("a teacher with no organization", () => {
  let classId: string;
  let joinCode: string;

  test("makes classes and quizzes in the personal space", async () => {
    await signIn("solo", teacher.email, password, null);
    const created = await ok("solo", "class.create", classFields);
    classId = created.id;
    const classes = await ok("solo", "class.list");
    expect(classes.map((c: { id: string }) => c.id)).toEqual([classId]);
    joinCode = classes[0].joinCode;

    // A quiz with no organization: the demo quiz's content, saved as a new one (no id).
    const { quiz, parts } = await ok("teacher", "quiz.get", { quizId: demoQuizId });
    const draft = {
      title: quiz.title,
      description: quiz.description,
      subject: quiz.subject,
      subjectArea: quiz.subjectArea,
      header: quiz.header,
      paper: quiz.paper,
      settings: quiz.settings,
      parts: parts.map((p: Record<string, unknown>) => ({
        id: p.id,
        title: p.title,
        instructions: p.instructions,
        shuffleQuestions: p.shuffleQuestions,
        poolSize: p.poolSize,
        questions: p.questions,
      })),
    };
    const { quizId } = await ok("solo", "quiz.save", { draft });
    const quizzes = await ok("solo", "quiz.list");
    expect(quizzes.map((q: { quiz: { id: string } }) => q.quiz.id)).toEqual([quizId]);
  }, 30_000);

  test("cannot use what only an organization has", async () => {
    expect(await refused("solo", "org.members")).toMatch(/^Forbidden/);
    expect(await refused("solo", "ai.keys")).toMatch(/^Forbidden/);
    expect(await refused("solo", "bank.share", { recipients: [teacherEmail], scope: "subject", subject: "Algebra" })).toMatch(/^Forbidden/);
  });

  test("a student joins the class with its code and stays in the personal space", async () => {
    await signIn("solo-student", student.email, password, null);
    const joined = await ok("solo-student", "enrollment.join", { code: joinCode, studentNumber: "2026-99999", sex: "F" });
    expect(joined.classId).toBe(classId);
    const { user } = await ok("solo-student", "auth.session");
    expect(user.organization).toBeNull();
    expect(user.memberships).toEqual([]);
    const mine = await ok("solo-student", "enrollment.mine");
    expect(mine.classes.map((c: { id: string }) => c.id)).toEqual([classId]);
    const roster = await ok("solo", "class.get", { classId });
    expect(roster.studentIds).toHaveLength(1);
  }, 30_000);

  test("making an organization moves them into it; the personal space's content stays out of it", async () => {
    const inOrg = await ok("solo", "org.create", { name: "Solo School" });
    expect(inOrg.organization.name).toBe("Solo School");
    expect(inOrg.organization.roles).toEqual(["owner", "teacher"]);
    expect(await ok("solo", "class.list")).toEqual([]);
    expect(await ok("solo", "class.get", { classId })).toBeNull();

    const back = await ok("solo", "org.setActive", { organizationId: null });
    expect(back.organization).toBeNull();
    expect((await ok("solo", "class.list")).map((c: { id: string }) => c.id)).toEqual([classId]);
  });
});

describe("a member stepping out to the personal space", () => {
  test("sees none of the organization's content, and comes back", async () => {
    await switchTo("teacher", null);
    try {
      const { user } = await ok("teacher", "auth.session");
      expect(user.organization).toBeNull();
      expect((await ok("teacher", "class.list")).map((c: { id: string }) => c.id)).not.toContain(demoClassId);
      expect(await refused("teacher", "quiz.get", { quizId: demoQuizId })).toMatch(/^NotFound/);
    } finally {
      await switchTo("teacher", sicOrganizationId);
    }
    expect((await ok("teacher", "class.list")).map((c: { id: string }) => c.id)).toContain(demoClassId);
  });
});
