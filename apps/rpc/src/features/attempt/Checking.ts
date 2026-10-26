// Submit-time checks of code answers (issue #45). Submitting doesn't wait for the runner: the answers are stored as
// waiting for their check, and a grader runs them right after the submit (`checkDue` for that attempt) and again every
// few seconds (`CheckSweep`), waiting longer after each try the runner couldn't take (busy, down, too slow). Only
// after `maxTries` such tries does an answer go to the teacher, so a burst of submits is graded late instead of not
// at all.
import type { CodeQuestion } from "@examinus/domain/kinds/code";
import type { Question } from "@examinus/domain/question";
import { autoScore } from "@examinus/domain/scoring";
import { Context, Effect, Layer, Result } from "effect";
import type { AnswerItem } from "../../database/schemas/index.ts";
import { Runner } from "../../platform/Runner.ts";
import { LiveHub } from "../live/Service.ts";
import { QuizRepo } from "../quiz/Repo.ts";
import { AttemptRepo } from "./Repo.ts";
import { attemptPaper, flatQuestions } from "./rules.ts";

// A grader holds the answers it took for longer than the runner call can take (3 minutes), so no other grader runs
// them meanwhile; if it dies, they come back once this runs out.
const holdMs = 4 * 60_000;
// Answers taken per round, and checked at once (the runner queues the rest, or answers busy).
const batch = 20;
const concurrency = 4;
// The wait before try n + 1: 5 s, doubling, at most a minute (a backlog clears in minutes, so a longer wait only
// leaves the runner idle). `maxTries` of them come to about 25 minutes.
export const retryDelayMs = (tries: number) => Math.min(5_000 * 2 ** tries, 60_000);
export const maxTries = 30;

export class Checking extends Context.Service<
  Checking,
  {
    // Checks the waiting code answers that are due (of one attempt, or of any) until none are left.
    readonly checkDue: (attemptId?: string) => Effect.Effect<void>;
  }
>()("examinus/api/AttemptChecking") {
  static readonly layer = Layer.effect(
    Checking,
    Effect.gen(function* () {
      const repo = yield* AttemptRepo;
      const quizRepo = yield* QuizRepo;
      const runner = yield* Runner;
      const hub = yield* LiveHub;

      // The attempt's questions, as submit graded them; null when the attempt or its quiz is gone.
      const paperOf = Effect.fn("Checking.paperOf")(function* (attemptId: string) {
        const attempt = yield* repo.find(attemptId);
        const session = attempt && (yield* repo.sessionOf(attempt.sessionId));
        const quiz = session && (yield* quizRepo.find(session.quizId));
        if (!attempt || !quiz) return null;
        return flatQuestions(attemptPaper(yield* quizRepo.detail(quiz), attempt.seed));
      });

      const checkOne = Effect.fn("Checking.checkOne")(function* (answer: AnswerItem, paper: readonly Question[]) {
        const question = paper.find((q) => q.id === answer.questionId);
        // Its question is no longer on the paper: nothing to check it against, so the teacher grades it.
        const run = question
          ? runner.tryTests(question as CodeQuestion, typeof answer.value === "string" ? answer.value : "")
          : Effect.succeed(null);
        const outcome = yield* Effect.result(run);
        if (Result.isFailure(outcome)) {
          if (answer.checkTries + 1 < maxTries)
            return yield* repo.retryCheck(answer.id, new Date(Date.now() + retryDelayMs(answer.checkTries)));
          yield* Effect.logWarning("Gave up on a code check: the runner couldn't take it; the teacher grades it", {
            answerId: answer.id,
            tries: answer.checkTries + 1,
            reason: outcome.failure.reason,
          });
        }
        const results = Result.isSuccess(outcome) ? outcome.success : null;
        const status = yield* repo.settleCheck({
          answer,
          paper,
          results,
          auto: question && results ? autoScore(question, answer.value, results) : null,
        });
        if (status) yield* hub.attemptChanged(answer.attemptId);
      });

      const checkDue = Effect.fn("Checking.checkDue")(function* (attemptId?: string) {
        for (;;) {
          const now = new Date();
          const claimed = yield* repo.claimChecks({ attemptId, now, holdUntil: new Date(now.getTime() + holdMs), limit: batch });
          if (claimed.length === 0) return;
          const byAttempt = new Map<string, AnswerItem[]>();
          for (const a of claimed) byAttempt.set(a.attemptId, [...(byAttempt.get(a.attemptId) ?? []), a]);
          yield* Effect.forEach(
            byAttempt,
            ([id, answers]) =>
              Effect.gen(function* () {
                const paper = (yield* paperOf(id)) ?? [];
                yield* Effect.forEach(answers, (a) => checkOne(a, paper), { concurrency, discard: true });
              }),
            { concurrency, discard: true },
          );
        }
      });

      return Checking.of({ checkDue });
    }),
  );
}
