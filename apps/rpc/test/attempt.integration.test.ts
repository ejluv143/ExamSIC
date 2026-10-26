// A student taking a quiz over the real API: start, autosave, submit and the result with its automatic scoring.
// Needs an API (API_URL) on a migrated database with the test fixture loaded (test/fixture); every test makes its
// own session of the fixture's quiz.
import { clientIpHeader } from "@examinus/contract/api";
import { beforeAll, describe, expect, test } from "bun:test";
import {
  answerFor,
  asWebFor,
  callAs,
  createSession,
  demoPassword,
  ok,
  refused,
  signIn,
  studentEmail,
  students,
  teacherEmail,
  teacherPassword,
} from "./helpers.ts";

const [ann, ben] = students as [string, string, ...string[]];
const device = "device-1";

beforeAll(async () => {
  await signIn("teacher", teacherEmail, teacherPassword);
  for (const s of [ann, ben]) await signIn(s, studentEmail(s), demoPassword);
}, 30_000);

type Question = { id: string; type: string };

// Starts the first student's attempt and returns it with the questions of their paper.
async function begin(sessionId: string, who = ann) {
  const attempt = await ok(who, "attempt.start", { sessionId, deviceId: device });
  const paper = await ok(who, "attempt.paper", { sessionId, deviceId: device });
  const questions = paper.parts.flatMap((p: { questions: Question[] }) => p.questions) as Question[];
  return { attempt, paper, questions };
}

const answersOf = (questions: Question[], right: (q: Question, i: number) => boolean) =>
  Object.fromEntries(questions.map((q, i) => [q.id, answerFor(q, right(q, i))]));

describe("taking a quiz", () => {
  test("the paper holds no questions until the attempt starts", async () => {
    const { id } = await createSession();
    const before = await ok(ann, "attempt.paper", { sessionId: id, deviceId: device });
    expect(before.attempt).toBeNull();
    expect(before.parts).toEqual([]);
    expect(before.questionCount).toBeGreaterThan(0);
    const { attempt, questions } = await begin(id);
    expect(attempt.status).toBe("in_progress");
    expect(questions).toHaveLength(before.questionCount);
    // Starting again returns the attempt in progress with its first start time.
    const again = await ok(ann, "attempt.start", { sessionId: id, deviceId: device });
    expect(again.id).toBe(attempt.id);
    expect(again.startedAt).toBe(attempt.startedAt);
  });

  test("a session that hasn't opened can't be started", async () => {
    const { id } = await createSession({}, false);
    expect(await refused(ann, "attempt.start", { sessionId: id, deviceId: device })).toContain("Conflict");
  });

  test("a room password is required when one is set", async () => {
    const { id } = await createSession({ roomPassword: "open-sesame" });
    expect(await refused(ann, "attempt.start", { sessionId: id, deviceId: device })).toContain("Forbidden");
    expect(await refused(ann, "attempt.start", { sessionId: id, deviceId: device, roomPassword: "nope" })).toContain("Forbidden");
    const attempt = await ok(ann, "attempt.start", { sessionId: id, deviceId: device, roomPassword: "open-sesame" });
    expect(attempt.status).toBe("in_progress");
  });

  // The campus network is 10.0.4.0/24; these tests run from loopback, which is outside it.
  test("an IP allowlist can't be passed with a forged x-forwarded-for", async () => {
    const { id } = await createSession({ ipAllowlist: ["10.0.4.0/24"] });
    const start = { sessionId: id, deviceId: device };
    expect((await callAs(ann, { "x-forwarded-for": "10.0.4.5" }, "attempt.start", start)).err).toContain("Forbidden");
    const attempt = await callAs(ann, asWebFor("10.0.4.5"), "attempt.start", start);
    expect(attempt.ok?.status).toBe("in_progress");
  });

  // Only with API_INTERNAL_SECRET set on the API: naming an address without the secret gets the caller's own.
  test.if(Boolean(process.env.API_INTERNAL_SECRET))("the client address header needs the internal secret", async () => {
    const { id } = await createSession({ ipAllowlist: ["10.0.4.0/24"] });
    const forged = await callAs(ann, { [clientIpHeader]: "10.0.4.5" }, "attempt.start", { sessionId: id, deviceId: device });
    expect(forged.err).toContain("Forbidden");
  });

  test("answers are saved as you go and come back with the paper", async () => {
    const { id } = await createSession();
    const { attempt, questions } = await begin(id);
    const first = questions[0]!;
    await ok(ann, "attempt.saveAnswer", { attemptId: attempt.id, deviceId: device, questionId: first.id, value: answerFor(first, true), timeSpentMs: 1200 });
    const paper = await ok(ann, "attempt.paper", { sessionId: id, deviceId: device });
    expect(paper.answers[first.id]).toEqual(answerFor(first, true));
    expect(paper.review.find((r: { questionId: string }) => r.questionId === first.id).answered).toBe(true);
  });

  test("another student can't save to or submit somebody else's attempt", async () => {
    const { id } = await createSession();
    const { attempt, questions } = await begin(id);
    const q = questions[0]!;
    await refused(ben, "attempt.saveAnswer", { attemptId: attempt.id, deviceId: device, questionId: q.id, value: answerFor(q, true) });
    await refused(ben, "attempt.submit", { attemptId: attempt.id, deviceId: device, answers: {}, events: [], typing: {} });
  });

  test("a different device is refused while the attempt is open", async () => {
    const { id } = await createSession();
    const { attempt, questions } = await begin(id);
    const q = questions[0]!;
    const err = await refused(ann, "attempt.saveAnswer", { attemptId: attempt.id, deviceId: "device-2", questionId: q.id, value: answerFor(q, true) });
    expect(err).toContain("OpenElsewhere");
  });

  test("submitting grades automatically: all right is full marks", async () => {
    const { id } = await createSession();
    const { attempt, questions } = await begin(id);
    const submitted = await ok(ann, "attempt.submit", {
      attemptId: attempt.id,
      deviceId: device,
      answers: answersOf(questions, () => true),
      events: [],
      typing: {},
    });
    expect(submitted.status).toBe("graded");
    expect(submitted.result.score).toBe(submitted.result.max);
    expect(submitted.result.max).toBeGreaterThan(0);
    expect(submitted.result.pendingEssays).toBe(0);
    const result = await ok(ann, "attempt.result", { sessionId: id });
    expect(result.visible).toBe(true);
    expect(result.summary.score).toBe(result.summary.max);
    expect(result.items).toHaveLength(questions.length);
    expect(result.items.every((i: { points: number | null }) => i.points !== null && i.points > 0)).toBe(true);
  });

  test("a wrong answer and a blank one score nothing; the rest still count", async () => {
    const { id } = await createSession();
    const { attempt, questions } = await begin(id);
    // First question right, second wrong, the rest left unanswered.
    const answers = answersOf(questions.slice(0, 2), (_q, i) => i === 0);
    const submitted = await ok(ann, "attempt.submit", { attemptId: attempt.id, deviceId: device, answers, events: [], typing: {} });
    const { score, max } = submitted.result;
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(max);
    const result = await ok(ann, "attempt.result", { sessionId: id });
    const byQuestion = new Map<string, number | null>(
      result.items.map((i: { question: Question; points: number | null }) => [i.question.id, i.points]),
    );
    expect(byQuestion.get(questions[0]!.id)).toBeGreaterThan(0);
    expect(byQuestion.get(questions[1]!.id)).toBe(0);
    expect(byQuestion.get(questions[2]!.id)).toBe(0);
  });

  test("after submitting: the attempt is final, saving is refused and starting again is out of attempts", async () => {
    const { id } = await createSession({ attemptsAllowed: 1 });
    const { attempt, questions } = await begin(id);
    const q = questions[0]!;
    const first = await ok(ann, "attempt.submit", { attemptId: attempt.id, deviceId: device, answers: answersOf(questions, () => true), events: [], typing: {} });
    expect(await refused(ann, "attempt.saveAnswer", { attemptId: attempt.id, deviceId: device, questionId: q.id, value: answerFor(q, false) })).toContain("Conflict");
    // Submitting twice returns the first result.
    const second = await ok(ann, "attempt.submit", { attemptId: attempt.id, deviceId: device, answers: answersOf(questions, () => false), events: [], typing: {} });
    expect(second.result).toEqual(first.result);
    expect(await refused(ann, "attempt.start", { sessionId: id, deviceId: device })).toContain("Conflict");
  });

  test("a second attempt is allowed when the session gives more, and the result is the latest one", async () => {
    const { id } = await createSession({ attemptsAllowed: 2 });
    const one = await begin(id);
    await ok(ann, "attempt.submit", { attemptId: one.attempt.id, deviceId: device, answers: answersOf(one.questions, () => false), events: [], typing: {} });
    const two = await begin(id);
    expect(two.attempt.id).not.toBe(one.attempt.id);
    await ok(ann, "attempt.submit", { attemptId: two.attempt.id, deviceId: device, answers: answersOf(two.questions, () => true), events: [], typing: {} });
    const result = await ok(ann, "attempt.result", { sessionId: id });
    expect(result.attemptsUsed).toBe(2);
    expect(result.summary.score).toBe(result.summary.max);
  });

  test("with a retake left the result is the score alone; the answer key comes with the last attempt (issue #15)", async () => {
    const { id } = await createSession({ attemptsAllowed: 2 });
    const one = await begin(id);
    await ok(ann, "attempt.submit", { attemptId: one.attempt.id, deviceId: device, answers: answersOf(one.questions, () => false), events: [], typing: {} });
    const first = await ok(ann, "attempt.result", { sessionId: id });
    expect(first.visible).toBe(true);
    expect(first.answerKey).toBe(false);
    expect(first.summary.max).toBeGreaterThan(0);
    expect(first.items).toEqual([]);
    // Nor during the last attempt.
    const two = await begin(id);
    expect((await ok(ann, "attempt.result", { sessionId: id })).items).toEqual([]);
    await ok(ann, "attempt.submit", { attemptId: two.attempt.id, deviceId: device, answers: answersOf(two.questions, () => true), events: [], typing: {} });
    const last = await ok(ann, "attempt.result", { sessionId: id });
    expect(last.answerKey).toBe(true);
    expect(last.items).toHaveLength(two.questions.length);
  });

  test("the answer key shows once the session ends, even with retakes left (issue #15)", async () => {
    const { id } = await createSession({ attemptsAllowed: null });
    const { attempt, questions } = await begin(id);
    await ok(ann, "attempt.submit", { attemptId: attempt.id, deviceId: device, answers: answersOf(questions, () => true), events: [], typing: {} });
    expect((await ok(ann, "attempt.result", { sessionId: id })).items).toEqual([]);
    await ok("teacher", "session.end", { sessionId: id });
    const ended = await ok(ann, "attempt.result", { sessionId: id });
    expect(ended.answerKey).toBe(true);
    expect(ended.items).toHaveLength(questions.length);
  });

  test("results stay hidden until the teacher releases them (manual release)", async () => {
    const { id } = await createSession({ resultsRelease: "manual" });
    const { attempt, questions } = await begin(id);
    await ok(ann, "attempt.submit", { attemptId: attempt.id, deviceId: device, answers: answersOf(questions, () => true), events: [], typing: {} });
    const hidden = await ok(ann, "attempt.result", { sessionId: id });
    expect(hidden.visible).toBe(false);
    expect(hidden.summary).toBeNull();
    expect(hidden.items).toEqual([]);
    await ok("teacher", "session.releaseResults", { sessionId: id, released: true });
    const shown = await ok(ann, "attempt.result", { sessionId: id });
    expect(shown.visible).toBe(true);
    expect(shown.summary.score).toBe(shown.summary.max);
  });

  test("the teacher sees the submitted attempt, and ending the session submits one still in progress", async () => {
    const { id } = await createSession();
    const { attempt: done, questions } = await begin(id, ann);
    await ok(ann, "attempt.submit", { attemptId: done.id, deviceId: device, answers: answersOf(questions, () => true), events: [], typing: {} });
    const open = await begin(id, ben);
    await ok(ben, "attempt.saveAnswer", { attemptId: open.attempt.id, deviceId: device, questionId: open.questions[0]!.id, value: answerFor(open.questions[0]!, true) });
    await ok("teacher", "session.end", { sessionId: id });
    const attempts = await ok("teacher", "session.attempts", { sessionId: id });
    expect(attempts).toHaveLength(2);
    expect(attempts.every((a: { attempt: { status: string } }) => a.attempt.status !== "in_progress")).toBe(true);
    // Ben's one saved answer was kept and graded when it was submitted for him.
    const bens = attempts.find((a: { attempt: { id: string } }) => a.attempt.id === open.attempt.id);
    expect(bens.answers.some((a: { questionId: string }) => a.questionId === open.questions[0]!.id)).toBe(true);
    expect(await refused(ben, "attempt.start", { sessionId: id, deviceId: device })).toContain("Conflict");
  });
});
