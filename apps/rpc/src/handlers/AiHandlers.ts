import { AiFailed, AiRpcs, NotFound } from "@examora/contract";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { Ai } from "../Ai.ts";
import { Database } from "../Database.ts";
import { answers, attempts, questions, quizParts, quizSessions, quizzes } from "../database/schemas/index.ts";
import { limits, RateLimiter } from "../RateLimiter.ts";
import { toQuestion } from "../Quizzes.ts";
import { requirePermission } from "../Session.ts";

export const AiHandlers = AiRpcs.toLayer(
  Effect.gen(function* () {
    const db = yield* Database;
    const ai = yield* Ai;
    const limiter = yield* RateLimiter;

    return AiRpcs.of({
      "ai.status": Effect.fn("ai.status")(function* () {
        yield* requirePermission({ ai: ["use"] });
        return yield* ai.options;
      }),

      "ai.keys": Effect.fn("ai.keys")(function* () {
        yield* requirePermission({ ai: ["configure"] });
        return yield* ai.keys;
      }),

      "ai.setKey": Effect.fn("ai.setKey")(function* ({ provider, apiKey, model }) {
        yield* requirePermission({ ai: ["configure"] });
        return yield* ai.setKey(provider, apiKey, model);
      }),

      "ai.removeKey": Effect.fn("ai.removeKey")(function* ({ provider }) {
        yield* requirePermission({ ai: ["configure"] });
        yield* ai.removeKey(provider);
      }),

      "ai.generate": Effect.fn("ai.generate")(function* (request) {
        const user = yield* requirePermission({ ai: ["use"] });
        const key = yield* ai.resolve(request.provider);
        yield* limiter.hit(limits.aiGenerate, user.id);
        return { questions: yield* ai.generateQuestions(key, request) };
      }),

      "ai.suggestGrade": Effect.fn("ai.suggestGrade")(function* ({ attemptId, questionId, provider, feedbackStyle }) {
        const user = yield* requirePermission({ ai: ["use"] });
        // The attempt must belong to one of the teacher's quizzes (same check as session.grade).
        const [row] = yield* db.query((d) =>
          d
            .select({ attempt: attempts, quiz: quizzes })
            .from(attempts)
            .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
            .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
            .where(and(eq(attempts.id, attemptId), eq(quizzes.ownerId, user.id))),
        );
        if (!row) return yield* new NotFound({ message: "That attempt doesn't exist." });
        const [questionRow] = yield* db.query((d) =>
          d
            .select({ question: questions })
            .from(questions)
            .innerJoin(quizParts, eq(questions.partId, quizParts.id))
            .where(and(eq(questions.id, questionId), eq(quizParts.quizId, row.quiz.id))),
        );
        if (!questionRow) return yield* new NotFound({ message: "That question isn't in this quiz." });
        const question = toQuestion(questionRow.question);
        if (question.type !== "essay") return yield* new AiFailed({ message: "AI can only suggest scores for essay questions." });
        if (row.attempt.status === "in_progress") return yield* new AiFailed({ message: "The student hasn't submitted yet." });
        const [saved] = yield* db.query((d) =>
          d.select().from(answers).where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId))),
        );
        const answer = saved?.value;
        if (typeof answer !== "string" || answer.trim() === "") return yield* new AiFailed({ message: "The answer is empty" });

        const key = yield* ai.resolve(provider);
        yield* limiter.hit(limits.aiGrade, user.id);
        const suggestion = yield* ai.suggestGrade(key, {
          prompt: question.prompt,
          points: question.points,
          rubric: question.rubric,
          answer,
          feedbackStyle,
        });
        yield* db.query((d) =>
          d
            .update(answers)
            .set({ aiSuggestion: { ...suggestion, answer } })
            .where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId))),
        );
        return suggestion;
      }),
    });
  }),
);
