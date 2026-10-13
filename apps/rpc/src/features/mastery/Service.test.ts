import { describe, expect, test } from "bun:test";
import type { Question } from "@examinus/domain/question";
import type { AnswerValue, MasterySettings } from "@examinus/domain/quiz";
import { Effect, Layer } from "effect";
import type { AnswerItem, AttemptItem } from "../../database/schemas/index.ts";
import { Cache } from "../../platform/Cache.ts";
import { Runner } from "../../platform/Runner.ts";
import { harness, stub } from "../../testing/config.ts";
import { answerRow, attemptRow, quizRow, sessionRow } from "../../testing/rows.ts";
import { Assets } from "../assets/Service.ts";
import { AttemptRepo } from "../attempt/Repo.ts";
import { AttemptService } from "../attempt/Service.ts";
import { LiveHub } from "../live/Service.ts";
import { toQuiz } from "../quiz/mappers.ts";
import { QuizRepo } from "../quiz/Repo.ts";
import { MasteryRepo, type Try, type TryOutcome } from "./Repo.ts";
import { MasteryService } from "./Service.ts";

const trueFalse = (id: string, over: { answer?: boolean; explanation?: string } = {}): Question => ({
  id,
  prompt: `Question ${id}`,
  points: 1,
  gamePoints: "standard",
  partialCredit: true,
  type: "true_false",
  answer: over.answer ?? true,
  ...(over.explanation === undefined ? {} : { explanation: over.explanation }),
});

const paper = [trueFalse("q1", { explanation: "Because." }), trueFalse("q2"), trueFalse("q3")];

type Options = {
  // What the repo reports for the try; null: the question is no longer first in the queue.
  outcome?: TryOutcome | null;
  answers?: AnswerItem[];
  // The attempt as the service reads it again after an answer.
  fresh?: Partial<AttemptItem>;
};

const setup = (options: Options = {}) => {
  const queues: Array<[string, readonly string[]]> = [];
  const tries: Try[] = [];
  const submits: Array<{ attemptId: string; auto: boolean }> = [];
  const changes: Array<[string, unknown]> = [];
  const mastery = Layer.succeed(
    MasteryRepo,
    stub<MasteryRepo["Service"]>("MasteryRepo", {
      setQueue: (attemptId, queue) => Effect.sync(() => void queues.push([attemptId, queue])),
      recordTry: (input) =>
        Effect.sync(() => {
          tries.push(input);
          return options.outcome === undefined ? { queue: ["q2", "q3"], returns: false, final: false, tries: 1, empty: false } : options.outcome;
        }),
    }),
  );
  const attempts = Layer.succeed(
    AttemptRepo,
    stub<AttemptRepo["Service"]>("AttemptRepo", {
      answersOf: () => Effect.succeed(options.answers ?? []),
      find: () => Effect.succeed(attemptRow({ masteryQueue: ["q2", "q3"], ...options.fresh })),
      keepOwnPictures: (_studentId, value) => Effect.succeed(value),
    }),
  );
  const attemptService = Layer.succeed(
    AttemptService,
    stub<AttemptService["Service"]>("AttemptService", {
      submit: (input) => Effect.sync(() => (submits.push({ attemptId: input.attemptId, auto: input.auto }), null)),
    }),
  );
  const quizzes = Layer.succeed(
    QuizRepo,
    stub<QuizRepo["Service"]>("QuizRepo", {
      detail: (quiz) =>
        Effect.succeed({
          quiz: toQuiz(quiz),
          parts: [{ id: "p1", quizId: quiz.id, position: 0, title: "P", instructions: "", shuffleQuestions: false, poolSize: null, questions: paper }],
        }),
    }),
  );
  const hub = Layer.succeed(
    LiveHub,
    stub<LiveHub["Service"]>("LiveHub", { attemptChanged: (attemptId, change) => Effect.sync(() => void changes.push([attemptId, change])) }),
  );
  const assets = Layer.succeed(Assets, stub<Assets["Service"]>("Assets", { paperUrls: () => Effect.succeed({}) }));
  const layer = MasteryService.layer.pipe(
    Layer.provide([mastery, attempts, attemptService, quizzes, hub, assets, Layer.succeed(Runner, stub<Runner["Service"]>("Runner", {})), Layer.succeed(Cache, stub<Cache["Service"]>("Cache", {}))]),
  );
  return { ...harness(layer), queues, tries, submits, changes };
};

const mastery = Effect.service(MasteryService);
const quiz = quizRow();
const session = (settings: MasterySettings | null = null) => sessionRow({ mode: "mastery", mastery: settings });
const state = (attempt: AttemptItem, settings: MasterySettings | null = null) =>
  Effect.flatMap(mastery, (m) => m.state("student-1", attempt, session(settings), quiz));
const answer = (attempt: AttemptItem, questionId: string, value: AnswerValue, settings: MasterySettings | null = null, spent?: number) =>
  Effect.flatMap(mastery, (m) => m.answer("student-1", attempt, session(settings), quiz, questionId, value, spent));

describe("MasteryService.state", () => {
  test("the first read makes the queue from the paper and stores it on the attempt", async () => {
    const { run, queues } = setup();
    const s = await run(state(attemptRow()));
    expect(queues).toEqual([["attempt-1", ["q1", "q2", "q3"]]]);
    expect(s).toMatchObject({ total: 3, remaining: 3, mastered: 0, missed: 0, pending: 0, triesUsed: 0, finished: false });
    expect(s.question?.id).toBe("q1");
  });

  test("the question shown to the student carries no answer key", async () => {
    const { run } = setup();
    const s = await run(state(attemptRow()));
    expect(s.question).not.toBeNull();
    expect(s.question).not.toHaveProperty("answer");
    expect(s.question).not.toHaveProperty("explanation");
  });

  test("a stored queue is resumed as it is, not rebuilt", async () => {
    const { run, queues } = setup({ answers: [answerRow({ questionId: "q3", tries: 2, correct: false, autoScore: 0 })] });
    const s = await run(state(attemptRow({ masteryQueue: ["q3", "q1"] })));
    expect(queues).toEqual([]);
    expect(s.question?.id).toBe("q3");
    expect(s.remaining).toBe(2);
    expect(s.triesUsed).toBe(2);
  });

  test("an empty queue hands the attempt in and reports the run as finished", async () => {
    const { run, submits } = setup();
    const s = await run(state(attemptRow({ masteryQueue: [] })));
    expect(submits).toEqual([{ attemptId: "attempt-1", auto: false }]);
    expect(s).toMatchObject({ finished: true, remaining: 0, question: null });
  });

  test("a submitted attempt is finished and isn't submitted again or given a queue", async () => {
    const { run, submits, queues } = setup();
    const s = await run(state(attemptRow({ status: "graded", masteryQueue: null })));
    expect(submits).toEqual([]);
    expect(queues).toEqual([]);
    expect(s).toMatchObject({ finished: true, remaining: 0, question: null });
  });

  test("questions leave the open count as mastered, missed (retries used up) or pending (waiting for the teacher)", async () => {
    const answers = [
      answerRow({ questionId: "q1", tries: 1, correct: true, autoScore: 1 }),
      answerRow({ questionId: "q2", tries: 3, correct: false, autoScore: 0 }),
      answerRow({ questionId: "q3", tries: 1, correct: null, autoScore: null, manualScore: null }),
    ];
    const { run } = setup({ answers });
    const s = await run(state(attemptRow({ masteryQueue: ["q1"] }), null));
    // q1 is correct (mastered) though still queued by the stored state; q2 missed; q3 pending.
    expect(s).toMatchObject({ mastered: 1, missed: 1, pending: 1, remaining: 1 });
  });

  test("a missed question that is still in the queue isn't counted as missed yet", async () => {
    const { run } = setup({ answers: [answerRow({ questionId: "q2", tries: 1, correct: false, autoScore: 0 })] });
    const s = await run(state(attemptRow({ masteryQueue: ["q2"] })));
    expect(s).toMatchObject({ missed: 0, mastered: 0 });
  });

  test("the session's retry limit and target are reported; without settings the default is 3 tries", async () => {
    const { run } = setup();
    const custom = await run(state(attemptRow({ masteryQueue: ["q1"] }), { retryLimit: 5, targetPercent: 80, showCorrectAnswer: false }));
    expect([custom.retryLimit, custom.targetPercent]).toEqual([5, 80]);
    const fallback = await run(state(attemptRow({ masteryQueue: ["q1"] })));
    expect([fallback.retryLimit, fallback.targetPercent]).toEqual([3, null]);
  });
});

describe("MasteryService.answer", () => {
  const first = () => attemptRow({ masteryQueue: ["q1", "q2", "q3"] });

  test("an answer to a question that isn't first in the queue is refused and nothing is graded or stored", async () => {
    const { fail, tries, changes } = setup();
    const err = await fail(answer(first(), "q2", true));
    expect(err._tag).toBe("Conflict");
    expect(tries).toEqual([]);
    expect(changes).toEqual([]);
  });

  test("a blank answer isn't a try", async () => {
    const { fail, tries } = setup();
    // A true/false answer must be a boolean; text is cleaned away.
    const err = await fail(answer(first(), "q1", "yes"));
    expect(err._tag).toBe("Conflict");
    expect(err.message).toContain("Answer the question");
    expect(tries).toEqual([]);
  });

  test("a correct answer is stored with full score, shows the explanation and tells the live view", async () => {
    const { run, tries, changes } = setup();
    const result = await run(answer(first(), "q1", true, null, 4000));
    expect(tries).toHaveLength(1);
    expect(tries[0]).toMatchObject({ attemptId: "attempt-1", questionId: "q1", value: true, score: 1, spentMs: 4000, retryLimit: 3 });
    expect(result.feedback).toMatchObject({ correct: true, score: 1, triesLeft: 0, returns: false, final: false, explanation: "Because.", reveal: null });
    expect(changes).toEqual([["attempt-1", { answer: { questionId: "q1", value: true } }]]);
  });

  test("a wrong answer scores zero and counts the tries left against the session's retry limit, without revealing", async () => {
    const outcome: TryOutcome = { queue: ["q2", "q3", "q1"], returns: true, final: false, tries: 1, empty: false };
    const { run, tries } = setup({ outcome });
    const result = await run(answer(first(), "q1", false, { retryLimit: 4, targetPercent: null, showCorrectAnswer: true }));
    expect(tries[0]).toMatchObject({ score: 0, retryLimit: 4 });
    expect(result.feedback).toMatchObject({ correct: false, score: 0, triesUsed: 1, triesLeft: 3, returns: true, final: false, explanation: "", reveal: null });
  });

  test("after the last wrong try the correct answer is revealed, unless the teacher turned that off", async () => {
    const outcome: TryOutcome = { queue: ["q2", "q3"], returns: false, final: true, tries: 3, empty: false };
    const shown = await setup({ outcome }).run(answer(first(), "q1", false));
    expect(shown.feedback).toMatchObject({ final: true, explanation: "Because.", triesLeft: 0 });
    expect(shown.feedback.reveal).toMatchObject({ id: "q1", answer: true });
    const hidden = await setup({ outcome }).run(answer(first(), "q1", false, { retryLimit: 3, targetPercent: null, showCorrectAnswer: false }));
    expect(hidden.feedback).toMatchObject({ final: true, explanation: "", reveal: null });
  });

  test("when another click already took the try, the answer is a Conflict and the live view isn't told", async () => {
    const { fail, changes } = setup({ outcome: null });
    const err = await fail(answer(first(), "q1", true));
    expect(err._tag).toBe("Conflict");
    expect(changes).toEqual([]);
  });

  test("the time spent is kept within 0 and 24 hours, and left out when the browser sent none", async () => {
    const { run, tries } = setup();
    await run(answer(first(), "q1", true, null, -50));
    await run(answer(first(), "q1", true, null, 10 * 24 * 3600_000));
    await run(answer(first(), "q1", true));
    expect(tries.map((t) => t.spentMs)).toEqual([0, 24 * 3600_000, null]);
  });

  test("the state returned with the feedback is read after the try, so it points at the next question", async () => {
    const { run } = setup({ fresh: { masteryQueue: ["q2", "q3"] } });
    const result = await run(answer(first(), "q1", true));
    expect(result.state.question?.id).toBe("q2");
    expect(result.state.remaining).toBe(2);
  });
});
