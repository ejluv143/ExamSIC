import { AiFailed, AiRpcs } from "@examinus/contract/ai";
import { Effect } from "effect";
import { limits, RateLimiter } from "../../platform/RateLimiter.ts";
import { requireOrgPermission } from "../auth/Session.ts";
import { Ai, type AiProviderError } from "./Service.ts";

// The provider's failures are worded for people.
const failed = (error: AiProviderError) => new AiFailed({ message: error.message });

export const AiHandlers = AiRpcs.toLayer(
  Effect.gen(function* () {
    const ai = yield* Ai;
    const limiter = yield* RateLimiter;

    return AiRpcs.of({
      "ai.status": Effect.fn("ai.status")(function* () {
        const me = yield* requireOrgPermission({ ai: ["use"] });
        return yield* ai.options(me.organization.id);
      }),

      "ai.keys": Effect.fn("ai.keys")(function* () {
        const me = yield* requireOrgPermission({ ai: ["configure"] });
        return yield* ai.keys(me.organization.id);
      }),

      "ai.setKey": Effect.fn("ai.setKey")(function* ({ provider, apiKey, model }) {
        const me = yield* requireOrgPermission({ ai: ["configure"] });
        return yield* ai.setKey(me.organization.id, provider, apiKey, model);
      }),

      "ai.removeKey": Effect.fn("ai.removeKey")(function* ({ provider }) {
        const me = yield* requireOrgPermission({ ai: ["configure"] });
        yield* ai.removeKey(me.organization.id, provider);
      }),

      "ai.generate": Effect.fn("ai.generate")(function* (request) {
        const me = yield* requireOrgPermission({ ai: ["use"] });
        const key = yield* ai.resolve(me.organization.id, request.provider);
        yield* limiter.hit(limits.aiGenerate, me.id);
        const questions = yield* ai.generateQuestions(key, request).pipe(Effect.catchTag("AiProviderError", (e) => Effect.fail(failed(e))));
        return { questions };
      }),

      "ai.suggestGrade": Effect.fn("ai.suggestGrade")(function* ({ attemptId, questionId, provider, feedbackStyle }) {
        const me = yield* requireOrgPermission({ ai: ["use"] });
        const { question, answer } = yield* ai.essayToGrade(me.actor, attemptId, questionId);
        const key = yield* ai.resolve(me.organization.id, provider);
        yield* limiter.hit(limits.aiGrade, me.id);
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
