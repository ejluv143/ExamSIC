import {
  Forbidden,
  LiveAuthMiddleware,
  LiveClaims,
  LiveRpcs,
  LiveTicketRpcs,
  NotFound,
  Unauthorized,
  Conflict,
  liveTicketHeader,
} from "@examora/contract";
import { and, eq } from "drizzle-orm";
import { Effect, Layer, Option, Stream } from "effect";
import { Database } from "../Database.ts";
import { attempts } from "../database/schemas/index.ts";
import { LiveHub } from "../Live.ts";
import { requirePermission } from "../Session.ts";

// Trusts the ticket in the request's headers instead of a login cookie.
export const LiveAuthMiddlewareLive = Layer.effect(
  LiveAuthMiddleware,
  Effect.gen(function* () {
    const hub = yield* LiveHub;
    return LiveAuthMiddleware.of((effect, { headers }) =>
      hub.redeemTicket(headers[liveTicketHeader] ?? "").pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new Unauthorized()),
            onSome: (user) => Effect.provideService(effect, LiveClaims, user),
          }),
        ),
      ),
    );
  }),
);

// Trades the signed-in user's session for a ticket to watch a session (teachers who own it) or to follow
// their own attempt (students).
export const LiveTicketHandlers = LiveTicketRpcs.toLayer(
  Effect.gen(function* () {
    const hub = yield* LiveHub;
    const db = yield* Database;
    return LiveTicketRpcs.of({
      "live.ticket": Effect.fn("live.ticket")(function* ({ target }) {
        if (target._tag === "teacher") {
          const user = yield* requirePermission({ session: ["host"] });
          if (!(yield* hub.ownsSession(target.sessionId, user.id)))
            return yield* new NotFound({ message: "That session doesn't exist." });
          return yield* hub.issueTicket({ userId: user.id, role: user.role, target });
        }
        const user = yield* requirePermission({ attempt: ["read"] });
        const [attempt] = yield* db.query((d) =>
          d
            .select({ status: attempts.status })
            .from(attempts)
            .where(and(eq(attempts.id, target.attemptId), eq(attempts.studentId, user.id))),
        );
        if (!attempt) return yield* new NotFound({ message: "That attempt doesn't exist." });
        if (attempt.status !== "in_progress") return yield* new Conflict({ message: "This attempt was already submitted." });
        return yield* hub.issueTicket({ userId: user.id, role: user.role, target });
      }),
    });
  }),
);

const denied = new Forbidden({ message: "This ticket isn't for that." });

export const LiveHandlers = LiveRpcs.toLayer(
  Effect.gen(function* () {
    const hub = yield* LiveHub;
    return LiveRpcs.of({
      "live.teacher": ({ sessionId }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const claims = yield* LiveClaims;
            if (claims.target._tag !== "teacher" || claims.target.sessionId !== sessionId || claims.role !== "teacher")
              return yield* denied;
            if (!(yield* hub.ownsSession(sessionId, claims.userId)))
              return yield* new NotFound({ message: "That session doesn't exist." });
            return hub.teacherStream(sessionId);
          }),
        ),
      "live.student": ({ attemptId }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const claims = yield* LiveClaims;
            if (claims.target._tag !== "student" || claims.target.attemptId !== attemptId || claims.role !== "student")
              return yield* denied;
            if (!(yield* hub.ownsAttempt(attemptId, claims.userId)))
              return yield* new NotFound({ message: "That attempt doesn't exist." });
            return hub.studentStream(attemptId);
          }),
        ),
    });
  }),
);
