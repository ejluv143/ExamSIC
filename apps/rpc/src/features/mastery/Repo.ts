// The tables behind mastery mode: the queue stored on the attempt and the tries stored on the answers.
import type { AnswerValue, CodeTestResult, MasteryTry } from "@examinus/contract";
import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { answers, attempts, codeResults } from "../../database/schemas/index.ts";
import { Database } from "../../platform/Database.ts";
import { advanceQueue } from "./rules.ts";

// One graded try of the question at the head of the queue. `results`: the tests' outcome of a code or SQL answer.
export type Try = {
  attemptId: string;
  questionId: string;
  value: AnswerValue;
  score: number | null;
  results: CodeTestResult[] | null;
  at: Date;
  // The time spent on the question (ms), already limited; null keeps what was stored.
  spentMs: number | null;
  retryLimit: number;
};

// What the queue looks like after the try, and the try's number.
export type TryOutcome = { queue: string[]; returns: boolean; final: boolean; tries: number; empty: boolean };

export class MasteryRepo extends Context.Service<
  MasteryRepo,
  {
    // Stores the queue of an attempt that is still in progress.
    readonly setQueue: (attemptId: string, queue: readonly string[]) => Effect.Effect<void>;
    // Stores a try and the queue that follows from it, in one transaction. null: the attempt is submitted or the
    // question is no longer first in its queue (another click or browser took the try), and nothing was written.
    readonly recordTry: (input: Try) => Effect.Effect<TryOutcome | null>;
  }
>()("examinus/api/MasteryRepo") {
  static readonly layer = Layer.effect(
    MasteryRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return MasteryRepo.of({
        setQueue: Effect.fn("MasteryRepo.setQueue")(function* (attemptId, queue) {
          yield* db.query((d) =>
            d
              .update(attempts)
              .set({ masteryQueue: [...queue] })
              .where(and(eq(attempts.id, attemptId), eq(attempts.status, "in_progress"))),
          );
        }),
        recordTry: Effect.fn("MasteryRepo.recordTry")(function* ({ attemptId, questionId, value, score, results, at, spentMs, retryLimit }) {
          return yield* db.query((d) =>
            d.transaction(async (tx) => {
              // One answer at a time per attempt: a double click or two browsers can't both take the same try.
              const [locked] = await tx.select().from(attempts).where(eq(attempts.id, attemptId)).for("update");
              if (!locked || locked.status !== "in_progress" || locked.masteryQueue?.[0] !== questionId) return null;
              const [before] = await tx
                .select()
                .from(answers)
                .where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId)));
              const tries = (before?.tries ?? 0) + 1;
              const log: MasteryTry[] = [...(before?.triesLog ?? []), { value, score, at: at.toISOString() }];
              const next = advanceQueue(locked.masteryQueue, { score }, tries, retryLimit);
              const correct = score === null ? null : score >= 1;
              const [row] = await tx
                .insert(answers)
                .values({
                  attemptId,
                  questionId,
                  value,
                  correct,
                  autoScore: score,
                  answeredAt: at,
                  timeSpentMs: spentMs,
                  tries,
                  triesLog: log,
                })
                .onConflictDoUpdate({
                  target: [answers.attemptId, answers.questionId],
                  set: {
                    value,
                    correct,
                    autoScore: score,
                    answeredAt: at,
                    ...(spentMs === null ? {} : { timeSpentMs: spentMs }),
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
              await tx.update(attempts).set({ masteryQueue: next.queue }).where(eq(attempts.id, attemptId));
              return { ...next, tries, empty: next.queue.length === 0 };
            }),
          );
        }),
      });
    }),
  );
}
