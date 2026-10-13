// The AI coach's reading of the student's latest released result.
import { NotFound } from "@examinus/contract/errors";
import {
  analyzeAttempt,
  coachContext,
  fallbackCoach,
  fitCoachReport,
  resultTelemetry,
  type CoachResult,
} from "@examinus/domain/analytics";
import { Context, Effect, Layer } from "effect";
import { limits, RateLimiter } from "../../platform/RateLimiter.ts";
import { Ai } from "../ai/Service.ts";
import { AttemptRepo } from "./Repo.ts";
import { Results } from "./Results.ts";

export class Coach extends Context.Service<
  Coach,
  {
    // The report is kept once written, so reloading the page doesn't ask the model again. NotFound until results show.
    readonly coach: (sessionId: string, userId: string) => Effect.Effect<CoachResult, NotFound>;
  }
>()("examinus/api/AttemptCoach") {
  static readonly layer = Layer.effect(
    Coach,
    Effect.gen(function* () {
      const repo = yield* AttemptRepo;
      const results = yield* Results;
      const ai = yield* Ai;
      const limiter = yield* RateLimiter;

      const coach = Effect.fn("Coach.coach")(function* (sessionId: string, userId: string) {
        const { result, last } = yield* results.latest(sessionId, userId);
        if (!last || !result.summary || result.items.length === 0)
          return yield* new NotFound({ message: "There's no released result to coach on yet." });
        // The report is written for this score: a regrade (or a retake) asks for a new one.
        const key = `${last.id}:${result.summary.score}/${result.summary.max}/${result.summary.pendingEssays}`;
        if (last.coachReport?.key === key) return last.coachReport.result;
        const analytics = analyzeAttempt(resultTelemetry(result, userId));
        const topics = analytics.topics.map((t) => t.topic);
        const generatedAt = new Date().toISOString();
        const fromAi = yield* limiter.hit(limits.aiCoach, userId).pipe(
          Effect.andThen(ai.coach(coachContext(analytics))),
          Effect.map((report): CoachResult => ({ report: fitCoachReport(report, topics), source: "ai", generatedAt })),
          // No key, a slow or failed model, or too many asks: the rule-based report stands in.
          Effect.catchCause((cause) => Effect.logInfo("AI coach unavailable, using the rule-based report", cause).pipe(Effect.as(null))),
        );
        if (!fromAi) return { report: fitCoachReport(fallbackCoach(analytics), topics), source: "rules", generatedAt } satisfies CoachResult;
        yield* repo.saveCoachReport(last.id, { key, result: fromAi });
        return fromAi;
      });

      return Coach.of({ coach });
    }),
  );
}
