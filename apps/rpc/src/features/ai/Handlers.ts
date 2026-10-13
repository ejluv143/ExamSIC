import { AiFailed, AiRpcs } from "@examinus/contract/ai";
import { Effect } from "effect";
import { limits, RateLimiter } from "../../platform/RateLimiter.ts";
import { requirePermission } from "../auth/Session.ts";
import { Ai, type AiProviderError } from "./Service.ts";

// The provider's failures are worded for people.
const failed = (error: AiProviderError) => new AiFailed({ message: error.message });

export const AiHandlers = AiRpcs.toLayer(
  Effect.gen(function* () {
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
        const questions = yield* ai.generateQuestions(key, request).pipe(Effect.catchTag("AiProviderError", (e) => Effect.fail(failed(e))));
        return { questions };
      }),

      "ai.suggestGrade": Effect.fn("ai.suggestGrade")(function* ({ attemptId, questionId, provider, feedbackStyle }) {
        const user = yield* requirePermission({ ai: ["use"] });
        const { question, answer } = yield* ai.essayToGrade(user.id, attemptId, questionId);
        const key = yield* ai.resolve(provider);
        yield* limiter.hit(limits.aiGrade, user.id);
        const suggestion = yield* ai
          .suggestGrade(key, {
            prompt: question.prompt,
            points: question.points,
            rubric: question.rubric,
            answer,
            feedbackStyle,
          })
          .pipe(Effect.catchTag("AiProviderError", (e) => Effect.fail(failed(e))));
        yield* ai.saveSuggestion(attemptId, questionId, suggestion, answer);
        return suggestion;
      }),
    });
  }),
);
