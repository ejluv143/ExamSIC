import { describe, expect, test } from "bun:test";
import type { QuizDetail, QuizDraft } from "@examinus/contract/quiz";
import type { Question } from "@examinus/domain/question";
import { Effect, Layer } from "effect";
import type { Actor } from "../auth/Session.ts";
import { harness, stub } from "../../testing/config.ts";
import { quizRow, sessionRow } from "../../testing/rows.ts";
import { toQuiz } from "./mappers.ts";
import { QuizRepo } from "./Repo.ts";
import { QuizService } from "./Service.ts";

const org1 = "org-1";
const t1: Actor = { id: "teacher-1", organizationId: org1 };
const t1Other: Actor = { id: "teacher-1", organizationId: "org-2" };

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
// `attempted`: the quizzes students have started.
const setup = (attempted: string[] = []) => {
  const owners: Record<string, { ownerId: string; organizationId: string }> = {
    "quiz-1": { ownerId: "teacher-1", organizationId: org1 },
    "quiz-2": { ownerId: "teacher-2", organizationId: org1 },
  };
  const parts = [part("p1", [trueFalse("a", 2), trueFalse("b", 3)]), part("p2", [trueFalse("c", 5), trueFalse("d", 5)], 1)];
  const saved: Array<{ actor: Actor; draft: QuizDraft; existing: string | null }> = [];
  const removed: string[] = [];
  const repo = Layer.succeed(
    QuizRepo,
    stub<QuizRepo["Service"]>("QuizRepo", {
      findOwned: (quizId, actor) => {
        const owner = owners[quizId];
        return Effect.succeed(
          owner?.ownerId === actor.id && owner.organizationId === actor.organizationId
            ? quizRow({ id: quizId, ownerId: owner.ownerId, organizationId: owner.organizationId })
            : null,
        );
      },
      detail: (quiz) => Effect.succeed({ quiz: toQuiz(quiz), parts } satisfies QuizDetail),
      listOwned: (actor) =>
        Effect.succeed([{ quiz: quizRow({ ownerId: actor.id, organizationId: actor.organizationId }), parts, sessions: [sessionRow({ quizId: "quiz-1" })] }]),
      hasAttempts: (quizId) => Effect.succeed(attempted.includes(quizId)),
      save: (actor, draft, existing) =>
        Effect.sync(() => {
          saved.push({ actor, draft, existing });
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
    const err = await fail(Effect.flatMap(Effect.service(QuizService), (s) => s.get("quiz-2", t1)));
    expect(err._tag).toBe("NotFound");
  });

  test("a quiz of another organization is NotFound, even for its owner", async () => {
    const { fail, saved, removed } = setup();
    const service = Effect.service(QuizService);
    const errors = await Promise.all([
      fail(Effect.flatMap(service, (s) => s.get("quiz-1", t1Other))),
      fail(Effect.flatMap(service, (s) => s.save(t1Other, draft({ id: "quiz-1" })))),
      fail(Effect.flatMap(service, (s) => s.remove("quiz-1", t1Other))),
      fail(Effect.flatMap(service, (s) => s.duplicate("quiz-1", t1Other))),
    ]);
    expect(errors.map((e) => e._tag)).toEqual(["NotFound", "NotFound", "NotFound", "NotFound"]);
    expect(saved).toEqual([]);
    expect(removed).toEqual([]);
  });

  test("saving a draft that names someone else's quiz is refused and nothing is written", async () => {
    const { fail, saved } = setup();
    const err = await fail(Effect.flatMap(Effect.service(QuizService), (s) => s.save(t1, draft({ id: "quiz-2" }))));
    expect(err._tag).toBe("NotFound");
    expect(saved).toEqual([]);
  });

  test("a draft without an id creates a quiz for the caller; one with the caller's own id updates it", async () => {
    const { run, saved } = setup();
    const ids = await run(
      Effect.gen(function* () {
        const quizzes = yield* QuizService;
        const created = yield* quizzes.save(t1, draft());
        const updated = yield* quizzes.save(t1, draft({ id: "quiz-1" }));
        return [created, updated];
      }),
    );
    expect(ids).toEqual(["quiz-new", "quiz-1"]);
    expect(saved.map((s) => [s.actor, s.existing])).toEqual([
      [t1, null],
      [t1, "quiz-1"],
    ]);
  });

  test("once students have taken a quiz, a save that changes grading is refused and nothing is written", async () => {
    const { fail, saved } = setup(["quiz-1"]);
    const [p1, p2] = [part("p1", [trueFalse("a", 2), trueFalse("b", 3)]), part("p2", [trueFalse("c", 5), trueFalse("d", 5)], 1)];
    const drafts = [
      // A question removed (its answers would be deleted), one re-keyed, points changed, choices shuffled.
      draft({ id: "quiz-1", parts: [p1, { ...p2, questions: [trueFalse("c", 5)] }] }),
      draft({ id: "quiz-1", parts: [{ ...p1, questions: [{ ...trueFalse("a", 2), answer: false } as Question, trueFalse("b", 3)] }, p2] }),
      draft({ id: "quiz-1", parts: [{ ...p1, questions: [trueFalse("a", 4), trueFalse("b", 3)] }, p2] }),
      draft({ id: "quiz-1", parts: [p1, p2], settings: { ...draft().settings, shuffleChoices: true } }),
    ];
    for (const d of drafts) {
      const err = await fail(Effect.flatMap(Effect.service(QuizService), (s) => s.save(t1, d)));
      expect(err._tag).toBe("QuizInUse");
    }
    expect(saved).toEqual([]);
  });

  test("once students have taken a quiz, its wording, title and paper can still be fixed", async () => {
    const { run, saved } = setup(["quiz-1"]);
    const p1 = part("p1", [{ ...trueFalse("a", 2), prompt: "Fixed typo" }, trueFalse("b", 3)]);
    const p2 = { ...part("p2", [trueFalse("c", 5), trueFalse("d", 5)], 1), title: "Renamed part", instructions: "Read carefully." };
    const id = await run(
      Effect.flatMap(Effect.service(QuizService), (s) => s.save(t1, draft({ id: "quiz-1", title: "Algebra I", parts: [p1, p2] }))),
    );
    expect(id).toBe("quiz-1");
    expect(saved.map((s) => s.draft.title)).toEqual(["Algebra I"]);
  });

  test("a quiz no student has started can still change anything", async () => {
    const { run, saved } = setup();
    await run(
      Effect.flatMap(Effect.service(QuizService), (s) => s.save(t1, draft({ id: "quiz-1", parts: [part("p1", [trueFalse("z", 9)])] }))),
    );
    expect(saved.length).toBe(1);
  });

  test("removing someone else's quiz is refused; removing your own deletes it", async () => {
    const { run, fail, removed } = setup();
    const err = await fail(Effect.flatMap(Effect.service(QuizService), (s) => s.remove("quiz-2", t1)));
    expect(err._tag).toBe("NotFound");
    expect(removed).toEqual([]);
    await run(Effect.flatMap(Effect.service(QuizService), (s) => s.remove("quiz-1", t1)));
    expect(removed).toEqual(["quiz-1"]);
  });

  test("a copy is saved as a new quiz owned by the caller, titled '(copy)', with every part and question", async () => {
    const { run, saved } = setup();
    const id = await run(Effect.flatMap(Effect.service(QuizService), (s) => s.duplicate("quiz-1", t1)));
    expect(id).toBe("quiz-new");
    const [write] = saved;
    expect(write?.actor).toEqual(t1);
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
    const err = await fail(Effect.flatMap(Effect.service(QuizService), (s) => s.duplicate("quiz-2", t1)));
    expect(err._tag).toBe("NotFound");
    expect(saved).toEqual([]);
  });

  test("the list counts a pooled part by the questions drawn from it, not by all its questions", async () => {
    const { run } = setup();
    const [item] = await run(Effect.flatMap(Effect.service(QuizService), (s) => s.list(t1)));
    // Part 1: 2 + 3 points over two questions; part 2 draws one of two 5-point questions.
    expect(item?.questionCount).toBe(3);
    expect(item?.totalPoints).toBe(10);
    expect(item?.sessions.map((s) => s.id)).toEqual(["session-1"]);
  });
});
