// The organizations' AI keys, and what grading suggestions read and write on attempts, quizzes and answers.
import type { AiGradeSuggestion } from "@examinus/contract/ai";
import type { AiProvider } from "@examinus/domain/ai";
import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database } from "../../platform/Database.ts";
import type { Actor } from "../auth/Session.ts";
import {
  aiKeys,
  answers,
  attempts,
  questions,
  quizParts,
  quizSessions,
  quizzes,
  type AttemptItem,
  type QuestionItem,
} from "../../database/schemas/index.ts";

export type AiKeyRow = typeof aiKeys.$inferSelect;

export class AiRepo extends Context.Service<
  AiRepo,
  {
    // The organization's keys.
    readonly keys: (organizationId: string) => Effect.Effect<AiKeyRow[]>;
    // Changes the model of a saved key; null when the organization has none saved for the provider.
    readonly setModel: (organizationId: string, provider: AiProvider, model: string) => Effect.Effect<AiKeyRow | null>;
    readonly saveKey: (
      organizationId: string,
      provider: AiProvider,
      values: { secret: string; last4: string; model: string; updatedAt: Date },
    ) => Effect.Effect<AiKeyRow>;
    readonly removeKey: (organizationId: string, provider: AiProvider) => Effect.Effect<void>;
    // The attempt, when it belongs to one of the actor's quizzes in their organization (same check as session.grade),
    // with that quiz's id.
    readonly ownAttempt: (attemptId: string, actor: Actor) => Effect.Effect<{ attempt: AttemptItem; quizId: string } | null>;
    // The question, when it is in the quiz.
    readonly quizQuestion: (questionId: string, quizId: string) => Effect.Effect<QuestionItem | null>;
    // The saved answer's value; undefined when there is none.
    readonly answerValue: (attemptId: string, questionId: string) => Effect.Effect<unknown>;
    readonly saveSuggestion: (
      attemptId: string,
      questionId: string,
      suggestion: AiGradeSuggestion,
      answer: string,
    ) => Effect.Effect<void>;
  }
>()("examinus/api/AiRepo") {
  static readonly layer = Layer.effect(
    AiRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return AiRepo.of({
        keys: Effect.fn("AiRepo.keys")(function* (organizationId) {
          return yield* db.query((d) => d.select().from(aiKeys).where(eq(aiKeys.organizationId, organizationId)));
        }),

        setModel: Effect.fn("AiRepo.setModel")(function* (organizationId, provider, model) {
          const [row] = yield* db.query((d) =>
            d
              .update(aiKeys)
              .set({ model })
              .where(and(eq(aiKeys.organizationId, organizationId), eq(aiKeys.provider, provider)))
              .returning(),
          );
          return row ?? null;
        }),

        saveKey: Effect.fn("AiRepo.saveKey")(function* (organizationId, provider, values) {
          const [row] = yield* db.query((d) =>
            d
              .insert(aiKeys)
              .values({ organizationId, provider, ...values })
              .onConflictDoUpdate({ target: [aiKeys.organizationId, aiKeys.provider], set: values })
              .returning(),
          );
          return row!;
        }),

        removeKey: Effect.fn("AiRepo.removeKey")(function* (organizationId, provider) {
          yield* db.query((d) =>
            d.delete(aiKeys).where(and(eq(aiKeys.organizationId, organizationId), eq(aiKeys.provider, provider))),
          );
        }),

        ownAttempt: Effect.fn("AiRepo.ownAttempt")(function* (attemptId, actor) {
          const [row] = yield* db.query((d) =>
            d
              .select({ attempt: attempts, quizId: quizzes.id })
              .from(attempts)
              .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .where(
                and(
                  eq(attempts.id, attemptId),
                  eq(quizzes.ownerId, actor.id),
                  eq(quizzes.organizationId, actor.organizationId),
                ),
              ),
          );
          return row ?? null;
        }),

        quizQuestion: Effect.fn("AiRepo.quizQuestion")(function* (questionId, quizId) {
          const [row] = yield* db.query((d) =>
            d
              .select({ question: questions })
              .from(questions)
              .innerJoin(quizParts, eq(questions.partId, quizParts.id))
              .where(and(eq(questions.id, questionId), eq(quizParts.quizId, quizId))),
          );
          return row?.question ?? null;
        }),

        answerValue: Effect.fn("AiRepo.answerValue")(function* (attemptId, questionId) {
          const [saved] = yield* db.query((d) =>
            d.select().from(answers).where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId))),
          );
          return saved?.value;
        }),

        saveSuggestion: Effect.fn("AiRepo.saveSuggestion")(function* (attemptId, questionId, suggestion, answer) {
          yield* db.query((d) =>
            d
              .update(answers)
              .set({ aiSuggestion: { ...suggestion, answer } })
              .where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId))),
          );
        }),
      });
    }),
  );
}
