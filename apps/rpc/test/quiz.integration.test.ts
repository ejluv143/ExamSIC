// Editing a quiz students have taken (#22): quiz.save refuses changes to what grades and paper order depend on, so
// submitted answers and their scores stay exactly as they were; wording can still be fixed. Needs an API (API_URL)
// on a migrated database with the test fixture loaded (test/fixture). Every test works on its own copy of the
// fixture's quiz, so the other suites' quiz is never edited.
import { beforeAll, describe, expect, test } from "bun:test";
import {
  answerFor,
  demoPassword,
  demoQuizId,
  ok,
  refused,
  runningSession,
  signIn,
  studentEmail,
  students,
  teacherEmail,
  teacherPassword,
} from "./helpers.ts";

const [ann] = students as [string, ...string[]];
const device = "device-1";

beforeAll(async () => {
  await signIn("teacher", teacherEmail, teacherPassword);
  await signIn(ann, studentEmail(ann), demoPassword);
}, 30_000);

type Question = { id: string; type: string; prompt: string; points: number };
type Part = { id: string; title: string; instructions: string; shuffleQuestions: boolean; poolSize: number | null; questions: Question[] };

// A fresh copy of the fixture's quiz, and the draft quiz.save takes to save it back unchanged.
async function copy() {
  const { quizId } = await ok("teacher", "quiz.duplicate", { quizId: demoQuizId });
  return { quizId, draft: await draftOf(quizId) };
}

async function draftOf(quizId: string) {
  const { quiz, parts } = await ok("teacher", "quiz.get", { quizId });
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    subject: quiz.subject,
    subjectArea: quiz.subjectArea,
    header: quiz.header,
    paper: quiz.paper,
    settings: quiz.settings,
    parts: (parts as Part[]).map(({ id, title, instructions, shuffleQuestions, poolSize, questions }) => ({
      id,
      title,
      instructions,
      shuffleQuestions,
      poolSize,
      questions,
    })),
  };
}

type Draft = Awaited<ReturnType<typeof draftOf>>;

// The draft with every question passed through `edit`, and those it returns null for left out.
const editQuestions = (draft: Draft, edit: (q: Question, i: number) => Question | null): Draft => {
  let i = 0;
  return {
    ...draft,
    parts: draft.parts.map((p) => ({
      ...p,
      questions: p.questions.flatMap((q) => {
        const edited = edit(q, i++);
        return edited ? [edited] : [];
      }),
    })),
  };
};

// Ann takes and submits the quiz, every answer right; her result as attempt.result reports it.
async function submitted(quizId: string) {
  const session = await runningSession(quizId);
  const attempt = await ok(ann, "attempt.start", { sessionId: session.id, deviceId: device });
  const paper = await ok(ann, "attempt.paper", { sessionId: session.id, deviceId: device });
  const questions = paper.parts.flatMap((p: { questions: Question[] }) => p.questions) as Question[];
  const answers = Object.fromEntries(questions.map((q) => [q.id, answerFor(q, true)]));
  await ok(ann, "attempt.submit", { attemptId: attempt.id, deviceId: device, answers, events: [], typing: {} });
  return { sessionId: session.id as string, result: await ok(ann, "attempt.result", { sessionId: session.id }) };
}

describe("editing a quiz students have taken", () => {
  test("removing, re-keying or re-pointing a question is refused, and the result stays exactly the same", async () => {
    const { quizId, draft } = await copy();
    const { sessionId, result } = await submitted(quizId);
    expect(result.summary.score).toBeGreaterThan(0);

    const trueFalse = draft.parts.flatMap((p) => p.questions).find((q) => q.type === "true_false")!;
    const refusals = [
      // A question removed: its answers would have been deleted with it.
      editQuestions(draft, (q, i) => (i === 0 ? null : q)),
      // The answer key changed.
      editQuestions(draft, (q) => (q.id === trueFalse.id ? { ...q, answer: !(q as unknown as { answer: boolean }).answer } : q)),
      // Other points.
      editQuestions(draft, (q, i) => (i === 0 ? { ...q, points: q.points + 5 } : q)),
      // Another order.
      { ...draft, parts: [...draft.parts].reverse() },
      // Choices shuffled.
      { ...draft, settings: { ...draft.settings, shuffleChoices: !draft.settings.shuffleChoices } },
    ];
    expect(trueFalse).toBeDefined();
    expect(draft.parts.length).toBeGreaterThan(1);
    for (const edited of refusals) expect(await refused("teacher", "quiz.save", { draft: edited })).toContain("QuizInUse");

    expect(await draftOf(quizId)).toEqual(draft);
    expect(await ok(ann, "attempt.result", { sessionId })).toEqual(result);
  });

  test("fixing the wording still saves, and leaves the result as it was", async () => {
    const { quizId, draft } = await copy();
    const { sessionId, result } = await submitted(quizId);
    const fixed = {
      ...editQuestions(draft, (q, i) => (i === 0 ? { ...q, prompt: `${q.prompt} (typo fixed)` } : q)),
      title: `${draft.title} (fixed)`,
    };
    fixed.parts = fixed.parts.map((p) => ({ ...p, title: `${p.title}!`, instructions: "Read each question carefully." }));
    await ok("teacher", "quiz.save", { draft: fixed });

    const saved = await draftOf(quizId);
    expect(saved.title).toBe(fixed.title);
    expect(saved.parts[0]!.questions[0]!.prompt).toEndWith("(typo fixed)");
    const after = await ok(ann, "attempt.result", { sessionId });
    expect(after.summary).toEqual(result.summary);
    expect(after.items.map((i: { score: unknown }) => i.score)).toEqual(result.items.map((i: { score: unknown }) => i.score));
  });

  test("a quiz no student has started can still change anything", async () => {
    const { quizId, draft } = await copy();
    await runningSession(quizId);
    await ok("teacher", "quiz.save", { draft: editQuestions(draft, (q, i) => (i === 0 ? null : q)) });
    const saved = await draftOf(quizId);
    expect(saved.parts.flatMap((p) => p.questions)).toHaveLength(draft.parts.flatMap((p) => p.questions).length - 1);
  });

  test("a quiz with submitted answers can still be deleted, with its sessions and answers", async () => {
    const { quizId } = await copy();
    const { sessionId } = await submitted(quizId);
    await ok("teacher", "quiz.remove", { quizId });
    expect(await refused("teacher", "quiz.get", { quizId })).toContain("NotFound");
    expect(await refused(ann, "attempt.result", { sessionId })).toContain("NotFound");
  });
});
