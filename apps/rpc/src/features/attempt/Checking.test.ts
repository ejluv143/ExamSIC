import type { CodeTestResult } from "@examinus/domain/kinds/base";
import type { Question } from "@examinus/domain/question";
import { describe, expect, test } from "bun:test";
import { Effect, Layer, References } from "effect";
import type { AnswerItem } from "../../database/schemas/index.ts";
import { Runner, RunnerUnavailable } from "../../platform/Runner.ts";
import { harness, stub } from "../../testing/config.ts";
import { answerItem, attemptItem, codeQuestion, quizDetail, quizItem, sessionItem } from "../../testing/session-rows.ts";
import { LiveHub } from "../live/Service.ts";
import { QuizRepo } from "../quiz/Repo.ts";
import { Checking, maxTries, retryDelayMs } from "./Checking.ts";
import { AttemptRepo } from "./Repo.ts";

const passed: CodeTestResult[] = [{ testId: "t1", passed: true, output: "1" }];

// One submitted attempt whose code answer waits for its check; `tryTests` is what the runner does with it.
const setup = (tryTests: Runner["Service"]["tryTests"], pending: Partial<AnswerItem> = {}) => {
  const quiz = quizItem();
  const attempt = attemptItem({ id: "a1", status: "needs_grading" });
  let waiting: AnswerItem[] = [answerItem("a1", "q3", { value: "print(input())", checkPendingSince: new Date(), ...pending })];
  const log = {
    settled: [] as { answerId: string; results: CodeTestResult[] | null; auto: number | null; paper: readonly Question[] }[],
    retries: [] as { answerId: string; retryAt: Date }[],
    changed: [] as string[],
  };
  const repo = stub<AttemptRepo["Service"]>("AttemptRepo", {
    find: () => Effect.succeed(attempt),
    sessionOf: () => Effect.succeed(sessionItem()),
    // Each answer is handed out once, as the hold would do.
    claimChecks: () => Effect.sync(() => [waiting, (waiting = [])][0]!),
    settleCheck: ({ answer, results, auto, paper }) =>
      Effect.sync(() => (log.settled.push({ answerId: answer.id, results, auto, paper }), "graded" as const)),
    retryCheck: (answerId, retryAt) => Effect.sync(() => void log.retries.push({ answerId, retryAt })),
  });
  const layer = Checking.layer.pipe(
    Layer.provide([
      Layer.succeed(AttemptRepo, repo),
      Layer.succeed(
        QuizRepo,
        stub<QuizRepo["Service"]>("QuizRepo", {
          find: () => Effect.succeed(quiz),
          detail: () => Effect.succeed(quizDetail([codeQuestion("q3")], quiz)),
        }),
      ),
      Layer.succeed(Runner, stub<Runner["Service"]>("Runner", { configured: true, tryTests })),
      Layer.succeed(LiveHub, stub<LiveHub["Service"]>("LiveHub", { attemptChanged: (id) => Effect.sync(() => void log.changed.push(id)) })),
    ]),
    Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, "Error")),
  );
  return { ...harness(layer), log };
};

const checkDue = Effect.gen(function* () {
  yield* (yield* Checking).checkDue();
});

describe("Checking.checkDue", () => {
  test("a waiting code answer is run and stored with its score, and the teacher's views are told", async () => {
    const { run, log } = setup(() => Effect.succeed(passed));
    await run(checkDue);
    expect(log.settled).toMatchObject([{ answerId: "a1-q3", results: passed, auto: 1 }]);
    expect(log.settled[0]!.paper.map((q) => q.id)).toEqual(["q3"]);
    expect(log.changed).toEqual(["a1"]);
    expect(log.retries).toEqual([]);
  });

  test("a busy runner puts the check off, waiting longer after each try", async () => {
    const { run, log } = setup(() => Effect.fail(new RunnerUnavailable({ reason: "busy" })), { checkTries: 2 });
    const before = Date.now();
    await run(checkDue);
    expect(log.settled).toEqual([]);
    expect(log.retries).toHaveLength(1);
    const wait = log.retries[0]!.retryAt.getTime() - before;
    expect(wait).toBeGreaterThanOrEqual(retryDelayMs(2) - 50);
    expect(wait).toBeLessThan(retryDelayMs(2) + 1_000);
    expect(retryDelayMs(2)).toBe(20_000);
  });

  test("after the last try the answer goes to the teacher instead of waiting forever", async () => {
    const { run, log } = setup(() => Effect.fail(new RunnerUnavailable({ reason: "down" })), { checkTries: maxTries - 1 });
    await run(checkDue);
    expect(log.retries).toEqual([]);
    expect(log.settled).toMatchObject([{ answerId: "a1-q3", results: null, auto: null }]);
  });

  test("the wait between tries grows to at most a minute", () => {
    expect([0, 1, 2, 3, 4].map(retryDelayMs)).toEqual([5_000, 10_000, 20_000, 40_000, 60_000]);
    expect(retryDelayMs(20)).toBe(60_000);
  });
});
