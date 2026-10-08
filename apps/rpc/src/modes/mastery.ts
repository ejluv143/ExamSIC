// Mastery mode: a self-paced queue per attempt. Each answer is graded at once; a wrong answer goes back into the
// queue (after a few other questions) until it is answered correctly or the retry limit is used up. The queue is
// stored on the attempt, so a reload (or another browser) resumes it exactly.
import {
  assetIdsIn,
  autoScore,
  Conflict,
  masteryRequeueGap,
  paperRandom,
  toStudentQuestion,
  type AnswerValue,
  type MasteryAnswerResult,
  type MasteryFeedback,
  type MasterySettings,
  type MasteryState,
  type MasteryTry,
  type CodeTestResult,
  type Question,
} from "@examora/contract";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import type { Database } from "../Database.ts";
import { answers, attempts, codeResults, type AttemptItem, type QuizItem, type QuizSessionItem } from "../database/schemas/index.ts";
import type { LiveHub } from "../Live.ts";
import type { Assets } from "../Assets.ts";
import type { Runner } from "../Runner.ts";
import {
  attemptPaper,
  cleanAnswer,
  flatQuestions,
  hasAnswer,
  keepOwnPictures,
  loadQuizDetail,
  type Quizzes,
} from "../Quizzes.ts";
import { runSqlChecks, sampleResult } from "../sql-grader.ts";

// --- The queue (pure) ---

// A question's own stats once its try has been graded. `score` null: waits for the teacher (accepted once).
export type TryResult = { score: number | null };

// What the queue looks like after the first question in it was tried. `tries` counts this try. A mastered or
// manual question leaves; a miss goes back `gap` places down, or to the end when fewer are left, until the limit.
export function advanceQueue(
  queue: readonly string[],
  result: TryResult,
  tries: number,
  retryLimit: number,
  gap: number = masteryRequeueGap,
): { queue: string[]; returns: boolean; final: boolean } {
  const [head, ...rest] = queue;
  if (head === undefined) return { queue: [], returns: false, final: false };
  if (result.score === null || result.score >= 1) return { queue: rest, returns: false, final: false };
  if (tries >= retryLimit) return { queue: rest, returns: false, final: true };
  rest.splice(Math.min(gap, rest.length), 0, head);
  return { queue: rest, returns: true, final: false };
}

// --- The service ---

type Deps = {
  db: Database["Service"];
  runner: Runner["Service"];
  hub: LiveHub["Service"];
  assets: Assets["Service"];
  quizzes: Quizzes["Service"];
};

const settingsOf = (session: QuizSessionItem): MasterySettings =>
  session.mastery ?? { retryLimit: 3, targetPercent: null, showCorrectAnswer: true };

export function makeMastery({ db, runner, hub, assets, quizzes }: Deps) {
  // Checks a code or SQL answer against the question's tests. null: nothing could check it (waits for the teacher).
  const check = (q: Question, value: AnswerValue): Effect.Effect<CodeTestResult[] | null> => {
    if (q.type !== "code" && q.type !== "sql") return Effect.succeed(null);
    if (!hasAnswer(value)) return Effect.succeed([{ testId: "blank", passed: false, output: "", error: "No answer" }]);
    const code = value as string;
    return q.type === "code"
      ? runner.runTests(q, code)
      : Effect.promise(() => runSqlChecks(q, code)).pipe(
          Effect.catch(() => Effect.succeed(null)),
          Effect.catchDefect(() => Effect.succeed(null)),
        );
  };

  // The queue of an attempt: stored, or made from the paper's order on the first read.
  const queueOf = Effect.fn("mastery.queueOf")(function* (attempt: AttemptItem, paper: readonly Question[]) {
    if (attempt.masteryQueue !== null) return attempt.masteryQueue;
    const queue = paper.map((q) => q.id);
    yield* db.query((d) =>
      d.update(attempts).set({ masteryQueue: queue }).where(and(eq(attempts.id, attempt.id), eq(attempts.status, "in_progress"))),
    );
    return queue;
  });

  const stateOf = Effect.fn("mastery.state")(function* (userId: string, attempt: AttemptItem, session: QuizSessionItem, quiz: QuizItem) {
    const settings = settingsOf(session);
    const detail = yield* db.query((d) => loadQuizDetail(d, quiz));
    const parts = attemptPaper(detail, attempt.seed);
    const paper = flatQuestions(parts);
    const rows = yield* db.query((d) => d.select().from(answers).where(eq(answers.attemptId, attempt.id)));
    const byQuestion = new Map(rows.map((r) => [r.questionId, r]));
    let queue: readonly string[] = attempt.status === "in_progress" ? yield* queueOf(attempt, paper) : [];
    // Everything answered: hand the attempt in, so it is graded and shows up as finished.
    if (attempt.status === "in_progress" && queue.length === 0) {
      yield* quizzes.submit({ attemptId: attempt.id, auto: false });
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
      student && current?.type === "sql"
        ? yield* Effect.promise(() => sampleResult(current)).pipe(
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

  const answer = Effect.fn("mastery.answer")(function* (
    userId: string,
    attempt: AttemptItem,
    session: QuizSessionItem,
    quiz: QuizItem,
    questionId: string,
    value: AnswerValue,
    timeSpentMs: number | undefined,
  ) {
    const settings = settingsOf(session);
    const detail = yield* db.query((d) => loadQuizDetail(d, quiz));
    const paper = flatQuestions(attemptPaper(detail, attempt.seed));
    const queue = yield* queueOf(attempt, paper);
    if (queue[0] !== questionId) return yield* new Conflict({ message: "That isn't the question you're on." });
    const question = paper.find((q) => q.id === questionId)!;
    const cleaned =
      question.type === "drawing"
        ? yield* db.query((d) => keepOwnPictures(d, userId, cleanAnswer(question, value)))
        : cleanAnswer(question, value);
    if (!hasAnswer(cleaned)) return yield* new Conflict({ message: "Answer the question first." });

    const results = yield* check(question, cleaned);
    const score = autoScore(question, cleaned, results);
    const now = new Date();
    const spent = timeSpentMs === undefined ? null : Math.min(Math.max(0, timeSpentMs), 24 * 3600_000);

    const outcome = yield* db.query((d) =>
      d.transaction(async (tx) => {
        // One answer at a time per attempt: a double click or two browsers can't both take the same try.
        const [locked] = await tx.select().from(attempts).where(eq(attempts.id, attempt.id)).for("update");
        if (!locked || locked.status !== "in_progress" || locked.masteryQueue?.[0] !== questionId) return null;
        const [before] = await tx
          .select()
          .from(answers)
          .where(and(eq(answers.attemptId, attempt.id), eq(answers.questionId, questionId)));
        const tries = (before?.tries ?? 0) + 1;
        const log: MasteryTry[] = [...(before?.triesLog ?? []), { value: cleaned, score, at: now.toISOString() }];
        const next = advanceQueue(locked.masteryQueue, { score }, tries, settings.retryLimit);
        const correct = score === null ? null : score >= 1;
        const [row] = await tx
          .insert(answers)
          .values({
            attemptId: attempt.id,
            questionId,
            value: cleaned,
            correct,
            autoScore: score,
            answeredAt: now,
            timeSpentMs: spent,
            tries,
            triesLog: log,
          })
          .onConflictDoUpdate({
            target: [answers.attemptId, answers.questionId],
            set: {
              value: cleaned,
              correct,
              autoScore: score,
              answeredAt: now,
              ...(spent === null ? {} : { timeSpentMs: spent }),
              tries,
              triesLog: log,
            },
          })
          .returning({ id: answers.id });
        if (results)
          await tx
            .insert(codeResults)
            .values({ answerId: row!.id, results })
            .onConflictDoUpdate({ target: codeResults.answerId, set: { results } });
        await tx.update(attempts).set({ masteryQueue: next.queue }).where(eq(attempts.id, attempt.id));
        return { ...next, tries, empty: next.queue.length === 0 };
      }),
    );
    if (!outcome) return yield* new Conflict({ message: "That question isn't open any more." });

    yield* hub.attemptChanged(attempt.id, { answer: { questionId, value: cleaned } });
    const correct = score === null ? null : score >= 1;
    const reveal = outcome.final && settings.showCorrectAnswer;
    const explanation = correct === true || reveal ? (question.explanation ?? "") : "";
    const feedback = {
      correct,
      score,
      triesUsed: outcome.tries,
      triesLeft: correct === false ? Math.max(0, settings.retryLimit - outcome.tries) : 0,
      returns: outcome.returns,
      final: outcome.final,
      explanation,
      reveal: reveal ? question : null,
      assetUrls: reveal ? yield* assets.paperUrls(userId, assetIdsIn(JSON.stringify(question))) : {},
    } satisfies MasteryFeedback;

    // The state is read after the answer, with the attempt as it is now (the last answer hands it in).
    const [fresh] = yield* db.query((d) => d.select().from(attempts).where(eq(attempts.id, attempt.id)));
    const state = yield* stateOf(userId, fresh!, session, quiz);
    return { feedback, state } satisfies MasteryAnswerResult;
  });

  return { state: stateOf, answer };
}
