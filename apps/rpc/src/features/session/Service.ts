// Ending sessions: on the teacher's say-so, and on schedule.
import { Context, Effect, Layer } from "effect";
import { LiveHub } from "../live/Service.ts";
import { AttemptService } from "../attempt/Service.ts";
import { attemptClock } from "./clock.ts";
import { SessionRepo } from "./Repo.ts";
import type { StudentEndReason } from "@examinus/contract/live";

export class SessionService extends Context.Service<
  SessionService,
  {
    // Ends the session now and auto-submits every attempt still in progress.
    readonly endSession: (sessionId: string) => Effect.Effect<void>;
    // Background job: opens and ends sessions on schedule and submits attempts that ran out of time.
    readonly sweep: Effect.Effect<void>;
  }
>()("examinus/api/SessionService") {
  static readonly layer = Layer.effect(
    SessionService,
    Effect.gen(function* () {
      const repo = yield* SessionRepo;
      const attempt = yield* AttemptService;
      const hub = yield* LiveHub;

      const submitInProgress = (rows: { id: string }[], reason: StudentEndReason) =>
        Effect.forEach(rows, (a) => attempt.submit({ attemptId: a.id, auto: true, reason }), { discard: true });

      const endSession = Effect.fn("SessionService.endSession")(function* (sessionId: string) {
        yield* repo.markEnded(sessionId, new Date());
        yield* submitInProgress(yield* repo.inProgress(sessionId), "session_ended");
        yield* hub.sessionChanged(sessionId);
      });

      const sweep = Effect.gen(function* () {
        const now = new Date();
        const changed = yield* repo.advance(now);
        yield* Effect.forEach(changed, (s) => hub.sessionChanged(s.id), { discard: true });
        // Attempts still in progress after their deadline (and the grace for a late submit) are submitted as they are.
        const open = yield* repo.openAttempts;
        const expired = open.filter(
          ({ attempt, session, accommodations }) => attemptClock(session, attempt, accommodations, now.getTime()) === "expired",
        );
        yield* submitInProgress(expired.map((e) => e.attempt), "time_up");
        if (expired.length) yield* Effect.log(`Auto-submitted ${expired.length} expired attempt(s).`);
      }).pipe(Effect.catchCause((cause) => Effect.logError("Quiz sweep failed", cause)));

      return SessionService.of({ endSession, sweep });
    }),
  );
}
