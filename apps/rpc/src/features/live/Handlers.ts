// Live sessions over RPC: the ticket a signed-in user trades for a stream, and the streams themselves.
import { Conflict, Forbidden, NotFound, Unauthorized } from "@examinus/contract/errors";
import { LiveAuthMiddleware, LiveClaims, LiveRpcs, LiveTicketRpcs, liveTicketHeader } from "@examinus/contract/live";
import { CurrentUser } from "@examinus/contract/middleware";
import { roleOf } from "@examinus/domain/roles";
import { Effect, Layer, Option, Stream } from "effect";
import { liveStreams, record } from "../../platform/Metrics.ts";
import { requireOrgPermission, requirePermission } from "../auth/Session.ts";
import { Game } from "../game/Service.ts";
import { LiveRepo } from "./Repo.ts";
import { LiveHub } from "./Service.ts";

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
    const repo = yield* LiveRepo;
    const game = yield* Game;
    // Without an effective role (no active organization) there is nothing to stream.
    const roleFor = (user: Parameters<typeof roleOf>[0]) => {
      const role = roleOf(user);
      return role === null ? Effect.fail(new Forbidden({ message: "Pick an organization first." })) : Effect.succeed(role);
    };
    return LiveTicketRpcs.of({
      "live.ticket": Effect.fn("live.ticket")(function* ({ target }) {
        if (target._tag === "teacher") {
          const user = yield* requireOrgPermission({ session: ["host"] });
          if (!(yield* hub.ownsSession(target.sessionId, user.actor)))
            return yield* new NotFound({ message: "That session doesn't exist." });
          return yield* hub.issueTicket({ userId: user.id, organizationId: user.organization.id, role: yield* roleFor(user), target });
        }
        if (target._tag === "game") {
          // The teacher presents their own game; a student plays the games they are on the roster of.
          const current = yield* CurrentUser;
          const role = yield* roleFor(current);
          if (role === "teacher") {
            const user = yield* requireOrgPermission({ session: ["host"] });
            if (!(yield* hub.ownsSession(target.sessionId, user.actor))) return yield* new NotFound({ message: "That game doesn't exist." });
          } else {
            yield* requirePermission({ attempt: ["read"] });
            if (!(yield* game.isRostered(target.sessionId, current.id))) return yield* new NotFound({ message: "That game doesn't exist." });
          }
          return yield* hub.issueTicket({ userId: current.id, organizationId: current.organization?.id ?? null, role, target });
        }
        if (target._tag === "lobby") {
          // A student (or guest) waits in the lobby of a session they are on the roster of.
          const user = yield* requirePermission({ attempt: ["read"] });
          if (!(yield* game.isRostered(target.sessionId, user.id))) return yield* new NotFound({ message: "That session doesn't exist." });
          return yield* hub.issueTicket({ userId: user.id, organizationId: user.organization?.id ?? null, role: yield* roleFor(user), target });
        }
        const user = yield* requirePermission({ attempt: ["read"] });
        const status = yield* repo.attemptStatus(target.attemptId, user.id);
        if (status === null) return yield* new NotFound({ message: "That attempt doesn't exist." });
        if (status !== "in_progress") return yield* new Conflict({ message: "This attempt was already submitted." });
        return yield* hub.issueTicket({ userId: user.id, organizationId: user.organization?.id ?? null, role: yield* roleFor(user), target });
      }),
    });
  }),
);

const denied = new Forbidden({ message: "This ticket isn't for that." });

// Counts the stream as open until its scope closes, whichever way it ends (finished, failed, or the client left).
// Call it inside `Stream.unwrap`, whose scope lasts as long as the stream.
const countOpen = (stream: string) =>
  Effect.acquireRelease(
    record(liveStreams, 1, { stream }),
    () => record(liveStreams, -1, { stream }),
  );

export const LiveHandlers = LiveRpcs.toLayer(
  Effect.gen(function* () {
    const hub = yield* LiveHub;
    const game = yield* Game;
    return LiveRpcs.of({
      "live.teacher": ({ sessionId }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const claims = yield* LiveClaims;
            if (claims.target._tag !== "teacher" || claims.target.sessionId !== sessionId || claims.role !== "teacher" || claims.organizationId === null)
              return yield* denied;
            if (!(yield* hub.ownsSession(sessionId, { id: claims.userId, organizationId: claims.organizationId })))
              return yield* new NotFound({ message: "That session doesn't exist." });
            yield* countOpen("live.teacher");
            return hub.teacherStream(sessionId);
          }),
        ),
      "live.game": ({ sessionId }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const claims = yield* LiveClaims;
            if (claims.target._tag !== "game" || claims.target.sessionId !== sessionId) return yield* denied;
            if (claims.role === "teacher") {
              if (claims.organizationId === null || !(yield* hub.ownsSession(sessionId, { id: claims.userId, organizationId: claims.organizationId })))
                return yield* new NotFound({ message: "That game doesn't exist." });
              yield* countOpen("live.game");
              return game.stream(sessionId, { kind: "presenter" });
            }
            if ((claims.role !== "student" && claims.role !== "guest") || !(yield* game.isRostered(sessionId, claims.userId)))
              return yield* new NotFound({ message: "That game doesn't exist." });
            yield* countOpen("live.game");
            return game.stream(sessionId, { kind: "player", userId: claims.userId });
          }),
        ),
      "live.student": ({ attemptId }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const claims = yield* LiveClaims;
            if (claims.target._tag !== "student" || claims.target.attemptId !== attemptId || (claims.role !== "student" && claims.role !== "guest"))
              return yield* denied;
            if (!(yield* hub.ownsAttempt(attemptId, claims.userId)))
              return yield* new NotFound({ message: "That attempt doesn't exist." });
            yield* countOpen("live.student");
            return hub.studentStream(attemptId);
          }),
        ),
      "live.lobby": ({ sessionId }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const claims = yield* LiveClaims;
            if (claims.target._tag !== "lobby" || claims.target.sessionId !== sessionId || (claims.role !== "student" && claims.role !== "guest"))
              return yield* denied;
            if (!(yield* game.isRostered(sessionId, claims.userId))) return yield* new NotFound({ message: "That session doesn't exist." });
            yield* countOpen("live.lobby");
            return hub.lobbyStream(sessionId);
          }),
        ),
    });
  }),
);
