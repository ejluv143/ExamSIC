// Mastery mode: where a student stands in the queue, and grading one try at once.
import { Conflict } from "@examinus/contract/errors";
import { assetIdsIn } from "@examinus/domain/asset";
import { type MasteryAnswerResult, type MasteryFeedback, type MasteryState } from "@examinus/domain/mastery";
import { toRevealQuestion, toStudentQuestion, type Question } from "@examinus/domain/question";
import { kindOf } from "@examinus/domain/kinds";
import { type AnswerValue, hasAnswer } from "@examinus/domain/quiz";
import { autoScore } from "@examinus/domain/scoring";
import { paperRandom } from "@examinus/domain/shuffle";
import { Context, Effect, Layer } from "effect";
import type { AttemptItem, QuizItem, QuizSessionItem } from "../../database/schemas/index.ts";
import { Cache } from "../../platform/Cache.ts";
import { Runner } from "../../platform/Runner.ts";
import { checkAnswer } from "../../platform/checks.ts";
import { sampleFor } from "../../platform/sql-grader.ts";
import { AttemptRepo } from "../attempt/Repo.ts";
import { attemptPaper, cleanAnswer, flatQuestions } from "../attempt/rules.ts";
import { AttemptService } from "../attempt/Service.ts";
import { Assets } from "../assets/Service.ts";
import { LiveHub } from "../live/Service.ts";
import { QuizRepo } from "../quiz/Repo.ts";
import { MasteryRepo } from "./Repo.ts";
import { settingsOf } from "./rules.ts";

export class MasteryService extends Context.Service<
  MasteryService,
  {
    // The student's standing and the question to answer now. Resumes the saved queue; hands the attempt in once the
    // queue is empty.
    readonly state: (
      userId: string,
      attempt: AttemptItem,
      session: QuizSessionItem,
      quiz: QuizItem,
    ) => Effect.Effect<MasteryState>;
    // Grades one try of the question at the head of the queue. Conflict when it isn't the next in the queue.
    readonly answer: (
      userId: string,
      attempt: AttemptItem,
      session: QuizSessionItem,
      quiz: QuizItem,
      questionId: string,
      value: AnswerValue,
      timeSpentMs: number | undefined,
    ) => Effect.Effect<MasteryAnswerResult, Conflict>;
  }
>()("examinus/api/MasteryService") {
  static readonly layer = Layer.effect(
    MasteryService,
    Effect.gen(function* () {
      const repo = yield* MasteryRepo;
      const attempts = yield* AttemptRepo;
      const attemptService = yield* AttemptService;
      const quizRepo = yield* QuizRepo;
      const runner = yield* Runner;
      const hub = yield* LiveHub;
      const assets = yield* Assets;
      const cache = yield* Cache;

      // Checks a code or SQL answer against the question's tests. null: nothing could check it (waits for the teacher).
      const check = (q: Question, value: AnswerValue) => checkAnswer(runner, q, value, !hasAnswer(value));

      // The queue of an attempt: stored, or made from the paper's order on the first read.
      const queueOf = Effect.fn("MasteryService.queueOf")(function* (attempt: AttemptItem, paper: readonly Question[]) {
        if (attempt.masteryQueue !== null) return attempt.masteryQueue;
        const queue = paper.map((q) => q.id);
        yield* repo.setQueue(attempt.id, queue);
        return queue;
      });

      const state = Effect.fn("MasteryService.state")(function* (
        userId: string,
        attempt: AttemptItem,
        session: QuizSessionItem,
        quiz: QuizItem,
      ) {
        const settings = settingsOf(session);
        const detail = yield* quizRepo.detail(quiz);
        const parts = attemptPaper(detail, attempt.seed);
        const paper = flatQuestions(parts);
        const rows = yield* attempts.answersOf(attempt.id);
        const byQuestion = new Map(rows.map((r) => [r.questionId, r]));
        let queue: readonly string[] = attempt.status === "in_progress" ? yield* queueOf(attempt, paper) : [];
        // Everything answered: hand the attempt in, so it is graded and shows up as finished.
        if (attempt.status === "in_progress" && queue.length === 0) {
          yield* attemptService.submit({ attemptId: attempt.id, auto: false });
          queue = [];
        }
        const open = new Set(queue);
        let mastered = 0;
        let missed = 0;
        let pending = 0;
        for (const q of paper) {
          const row = byQuestion.get(q.id);
          if (!row || row.tries === 0) continue;
          if (row.correct === true) mastered++;
          else if (!open.has(q.id)) {
            if (row.autoScore === null && row.manualScore === null) pending++;
            else missed++;
          }
        }
        const current = queue.length > 0 ? paper.find((q) => q.id === queue[0]) : undefined;
        const student = current ? toStudentQuestion(current, paperRandom(detail.quiz.settings, attempt.seed, current.id)) : null;
        const withSample =
          student && current
            ? yield* sampleFor(cache, current).pipe(
                Effect.map((sample) => (sample ? { ...student, sampleResult: sample } : student)),
                Effect.catchDefect(() => Effect.succeed(student)),
              )
            : student;
        const assetUrls = withSample ? yield* assets.paperUrls(userId, assetIdsIn(JSON.stringify(withSample))) : {};
        return {
          total: paper.length,
          mastered,
          missed,
          pending,
          remaining: queue.length,
          retryLimit: settings.retryLimit,
          targetPercent: settings.targetPercent,
          question: withSample,
          triesUsed: current ? (byQuestion.get(current.id)?.tries ?? 0) : 0,
          finished: attempt.status !== "in_progress" || queue.length === 0,
          assetUrls,
        } satisfies MasteryState;
      });

      const answer = Effect.fn("MasteryService.answer")(function* (
        userId: string,
        attempt: AttemptItem,
        session: QuizSessionItem,
        quiz: QuizItem,
        questionId: string,
        value: AnswerValue,
        timeSpentMs: number | undefined,
      ) {
        const settings = settingsOf(session);
        const detail = yield* quizRepo.detail(quiz);
        const paper = flatQuestions(attemptPaper(detail, attempt.seed));
        const queue = yield* queueOf(attempt, paper);
        if (queue[0] !== questionId) return yield* new Conflict({ message: "That isn't the question you're on." });
        const question = paper.find((q) => q.id === questionId)!;
        const cleaned =
          kindOf(question).answerPictures
            ? yield* attempts.keepOwnPictures(userId, cleanAnswer(question, value))
            : cleanAnswer(question, value);
        if (!hasAnswer(cleaned)) return yield* new Conflict({ message: "Answer the question first." });

        const results = yield* check(question, cleaned);
        const score = autoScore(question, cleaned, results);
        const spentMs = timeSpentMs === undefined ? null : Math.min(Math.max(0, timeSpentMs), 24 * 3600_000);

        const outcome = yield* repo.recordTry({
          attemptId: attempt.id,
          questionId,
          value: cleaned,
          score,
          results,
          at: new Date(),
          spentMs,
          retryLimit: settings.retryLimit,
        });
        if (!outcome) return yield* new Conflict({ message: "That question isn't open any more." });

        yield* hub.attemptChanged(attempt.id, { answer: { questionId, value: cleaned } });
        const correct = score === null ? null : score >= 1;
        const reveal = outcome.final && settings.showCorrectAnswer;
        // The revealed question keeps the answers but not the grading secrets (issue #14).
        const revealed = reveal ? toRevealQuestion(question) : null;
        const explanation = correct === true || reveal ? (question.explanation ?? "") : "";
        const feedback = {
          correct,
          score,
          triesUsed: outcome.tries,
          triesLeft: correct === false ? Math.max(0, settings.retryLimit - outcome.tries) : 0,
          returns: outcome.returns,
          final: outcome.final,
          explanation,
          reveal: revealed,
          assetUrls: revealed ? yield* assets.paperUrls(userId, assetIdsIn(JSON.stringify(revealed))) : {},
        } satisfies MasteryFeedback;

        // The state is read after the answer, with the attempt as it is now (the last answer hands it in).
        const fresh = yield* attempts.find(attempt.id);
        const next = yield* state(userId, fresh!, session, quiz);
        return { feedback, state: next } satisfies MasteryAnswerResult;
      });

      return MasteryService.of({ state, answer });
    }),
  );
}
