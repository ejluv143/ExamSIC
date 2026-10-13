// Sessions over the real API: create, update, start, end, release results and the roster. Needs an API (API_URL) on a
// freshly migrated and seeded database; every test makes its own sessions of the seeded quiz.
import { beforeAll, describe, expect, test } from "bun:test";
import {
  createSession,
  demoClassId,
  demoPassword,
  demoQuizId,
  ok,
  otherTeacherEmail,
  quizSettings,
  refused,
  signIn,
  studentEmail,
  students,
  teacherEmail,
  teacherPassword,
} from "./helpers.ts";

beforeAll(async () => {
  await signIn("teacher", teacherEmail, teacherPassword);
  await signIn("other", otherTeacherEmail, demoPassword);
  await signIn(students[0]!, studentEmail(students[0]!), demoPassword);
}, 30_000);

const student = students[0]!;

describe("creating a session", () => {
  test("a scheduled session waits for Start, has a join key, and the class roster", async () => {
    const created = await createSession({}, false);
    expect(created.status).toBe("scheduled");
    expect(created.mode).toBe("quiz");
    expect(created.joinCode).toHaveLength(7);
    const got = await ok("teacher", "session.get", { sessionId: created.id });
    expect(got.session.quizId).toBe(demoQuizId);
    expect(got.session.classId).toBe(demoClassId);
    // The roster is the class's current members (all six demo students, by roster id).
    expect(got.studentIds.length).toBeGreaterThanOrEqual(students.length);
    const listed = await ok("teacher", "session.list", { classId: demoClassId });
    const item = listed.find((i: { session: { id: string } }) => i.session.id === created.id);
    expect(item.studentCount).toBe(got.studentIds.length);
    expect(item.submittedCount).toBe(0);
  });

  test("startNow opens it immediately", async () => {
    const created = await createSession({}, true);
    expect(created.status).toBe("running");
    expect(created.startedAt).not.toBeNull();
  });

  test("invalid settings are refused with the reason", async () => {
    const make = async (overrides: Record<string, unknown>) =>
      refused("teacher", "session.create", {
        quizId: demoQuizId,
        classId: demoClassId,
        startNow: false,
        ...(await quizSettings(overrides)),
      });
    expect(await make({ opensAt: "2030-01-02T00:00:00Z", closesAt: "2030-01-01T00:00:00Z" })).toContain("must close after it opens");
    expect(await make({ attemptsAllowed: 0 })).toContain("at least one attempt");
    expect(await make({ timeLimitMinutes: 0 })).toContain("at least a minute");
    expect(await make({ ipAllowlist: ["not-an-ip"] })).toContain("isn't an IP address");
    expect(await make({ allowGuests: true })).toContain("Only games");
    expect(await make({ questionTimeLimitSeconds: 30 })).toContain("one question at a time");
  });

  test("only a teacher who owns the quiz and the class may create", async () => {
    const payload = { quizId: demoQuizId, classId: demoClassId, startNow: false, ...(await quizSettings()) };
    await refused("other", "session.create", payload);
    await refused(student, "session.create", payload);
    await refused("teacher", "session.create", { ...payload, classId: "no-such-class" });
  });
});

describe("changing and running a session", () => {
  test("update changes the settings while it is scheduled, and keeps the paper rules once it runs", async () => {
    const created = await createSession({ attemptsAllowed: 1 }, false);
    const changeTo = async (overrides: Record<string, unknown>) =>
      ok("teacher", "session.update", { sessionId: created.id, classId: demoClassId, ...(await quizSettings(overrides)) });
    expect((await changeTo({ attemptsAllowed: 3, timeLimitMinutes: 20 })).attemptsAllowed).toBe(3);
    expect((await changeTo({ oneQuestionAtATime: true })).oneQuestionAtATime).toBe(true);
    await ok("teacher", "session.start", { sessionId: created.id });
    // Running: attempts and time limit can change, the paper rules can't.
    const running = await changeTo({ attemptsAllowed: 2, timeLimitMinutes: 10, oneQuestionAtATime: false });
    expect(running.attemptsAllowed).toBe(2);
    expect(running.timeLimitMinutes).toBe(10);
    expect(running.oneQuestionAtATime).toBe(true);
  });

  test("start opens the session, end closes it, and an ended session can't change or restart", async () => {
    const created = await createSession({}, false);
    const started = await ok("teacher", "session.start", { sessionId: created.id });
    expect(started.status).toBe("running");
    const ended = await ok("teacher", "session.end", { sessionId: created.id });
    expect(ended.status).toBe("ended");
    expect(ended.endedAt).not.toBeNull();
    expect(await refused("teacher", "session.start", { sessionId: created.id })).toContain("ended");
    const update = { sessionId: created.id, classId: demoClassId, ...(await quizSettings()) };
    expect(await refused("teacher", "session.update", update)).toContain("ended");
  });

  test("results release: manual release is off until the teacher turns it on, and can be turned off again", async () => {
    const created = await createSession({ resultsRelease: "manual" }, true);
    expect(created.resultsReleased).toBe(false);
    expect((await ok("teacher", "session.releaseResults", { sessionId: created.id, released: true })).resultsReleased).toBe(true);
    expect((await ok("teacher", "session.releaseResults", { sessionId: created.id, released: false })).resultsReleased).toBe(false);
  });

  test("other teachers and students can't see, change, end or remove it", async () => {
    const created = await createSession({}, true);
    const sessionId = created.id;
    for (const who of ["other", student]) {
      await refused(who, "session.get", { sessionId });
      await refused(who, "session.start", { sessionId });
      await refused(who, "session.end", { sessionId });
      await refused(who, "session.releaseResults", { sessionId, released: true });
      await refused(who, "session.remove", { sessionId });
    }
    expect((await ok("teacher", "session.get", { sessionId })).session.status).toBe("running");
  });

  test("removing a session deletes it", async () => {
    const created = await createSession({}, false);
    await ok("teacher", "session.remove", { sessionId: created.id });
    await refused("teacher", "session.get", { sessionId: created.id });
  });
});
