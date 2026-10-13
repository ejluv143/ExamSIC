import { describe, expect, test } from "bun:test";
import type { QuizDetail, QuizDraft } from "@examinus/contract/quiz";
import type { Question } from "@examinus/domain/question";
import { Effect, Layer } from "effect";
import { harness, stub } from "../../testing/config.ts";
import { quizRow, sessionRow } from "../../testing/rows.ts";
import { toQuiz } from "./mappers.ts";
import { QuizRepo } from "./Repo.ts";
import { QuizService } from "./Service.ts";

const trueFalse = (id: string, points: number): Question => ({
  id,
  prompt: `Question ${id}`,
  points,
  gamePoints: "standard",
  partialCredit: true,
  type: "true_false",
  answer: true,
});

const part = (id: string, questions: Question[], poolSize: number | null = null) => ({
  id,
  quizId: "quiz-1",
  position: 0,
  title: `Part ${id}`,
  instructions: "",
  shuffleQuestions: false,
  poolSize,
  questions,
});

// teacher-1 owns quiz-1 (two parts); teacher-2 owns quiz-2. `saved` and `removed` record what reached the repo.
const setup = () => {
  const owners: Record<string, string> = { "quiz-1": "teacher-1", "quiz-2": "teacher-2" };
  const parts = [part("p1", [trueFalse("a", 2), trueFalse("b", 3)]), part("p2", [trueFalse("c", 5), trueFalse("d", 5)], 1)];
  const saved: Array<{ ownerId: string; draft: QuizDraft; existing: string | null }> = [];
  const removed: string[] = [];
  const repo = Layer.succeed(
    QuizRepo,
    stub<QuizRepo["Service"]>("QuizRepo", {
      findOwned: (quizId, ownerId) => Effect.succeed(owners[quizId] === ownerId ? quizRow({ id: quizId, ownerId }) : null),
      detail: (quiz) => Effect.succeed({ quiz: toQuiz(quiz), parts } satisfies QuizDetail),
      listOwned: (ownerId) =>
        Effect.succeed([{ quiz: quizRow({ ownerId }), parts, sessions: [sessionRow({ quizId: "quiz-1" })] }]),
      save: (ownerId, draft, existing) =>
        Effect.sync(() => {
          saved.push({ ownerId, draft, existing });
          return existing ?? "quiz-new";
        }),
      remove: (quizId) => Effect.sync(() => void removed.push(quizId)),
    }),
  );
  return { ...harness(QuizService.layer.pipe(Layer.provide(repo))), saved, removed };
};

const draft = (over: Partial<QuizDraft> = {}): QuizDraft => {
  const quiz = toQuiz(quizRow());
  return {
    title: "New quiz",
    description: "",
    subject: null,
    subjectArea: null,
    header: quiz.header,
    paper: quiz.paper,
    settings: quiz.settings,
    parts: [],
    ...over,
  };
};

describe("QuizService", () => {
  test("another teacher's quiz can't be read: NotFound, not Forbidden", async () => {
    const { fail } = setup();
    const err = await fail(Effect.flatMap(Effect.service(QuizService), (s) => s.get("quiz-2", "teacher-1")));
    expect(err._tag).toBe("NotFound");
  });

  test("saving a draft that names someone else's quiz is refused and nothing is written", async () => {
    const { fail, saved } = setup();
    const err = await fail(Effect.flatMap(Effect.service(QuizService), (s) => s.save("teacher-1", draft({ id: "quiz-2" }))));
    expect(err._tag).toBe("NotFound");
    expect(saved).toEqual([]);
  });

  test("a draft without an id creates a quiz for the caller; one with the caller's own id updates it", async () => {
    const { run, saved } = setup();
    const ids = await run(
      Effect.gen(function* () {
        const quizzes = yield* QuizService;
        const created = yield* quizzes.save("teacher-1", draft());
        const updated = yield* quizzes.save("teacher-1", draft({ id: "quiz-1" }));
        return [created, updated];
      }),
    );
    expect(ids).toEqual(["quiz-new", "quiz-1"]);
    expect(saved.map((s) => [s.ownerId, s.existing])).toEqual([
      ["teacher-1", null],
      ["teacher-1", "quiz-1"],
    ]);
  });

  test("removing someone else's quiz is refused; removing your own deletes it", async () => {
    const { run, fail, removed } = setup();
    const err = await fail(Effect.flatMap(Effect.service(QuizService), (s) => s.remove("quiz-2", "teacher-1")));
    expect(err._tag).toBe("NotFound");
    expect(removed).toEqual([]);
    await run(Effect.flatMap(Effect.service(QuizService), (s) => s.remove("quiz-1", "teacher-1")));
    expect(removed).toEqual(["quiz-1"]);
  });

  test("a copy is saved as a new quiz owned by the caller, titled '(copy)', with every part and question", async () => {
    const { run, saved } = setup();
    const id = await run(Effect.flatMap(Effect.service(QuizService), (s) => s.duplicate("quiz-1", "teacher-1")));
    expect(id).toBe("quiz-new");
    const [write] = saved;
    expect(write?.ownerId).toBe("teacher-1");
    expect(write?.existing).toBeNull();
    expect(write?.draft.title).toBe("Algebra (copy)");
    expect(write?.draft.id).toBeUndefined();
    expect(write?.draft.parts.map((p) => [p.title, p.poolSize, p.questions.map((q) => q.id)])).toEqual([
      ["Part p1", null, ["a", "b"]],
      ["Part p2", 1, ["c", "d"]],
    ]);
  });

  test("another teacher's quiz can't be copied", async () => {
    const { fail, saved } = setup();
    const err = await fail(Effect.flatMap(Effect.service(QuizService), (s) => s.duplicate("quiz-2", "teacher-1")));
    expect(err._tag).toBe("NotFound");
    expect(saved).toEqual([]);
  });

  test("the list counts a pooled part by the questions drawn from it, not by all its questions", async () => {
    const { run } = setup();
    const [item] = await run(Effect.flatMap(Effect.service(QuizService), (s) => s.list("teacher-1")));
    // Part 1: 2 + 3 points over two questions; part 2 draws one of two 5-point questions.
    expect(item?.questionCount).toBe(3);
    expect(item?.totalPoints).toBe(10);
    expect(item?.sessions.map((s) => s.id)).toEqual(["session-1"]);
  });
});
