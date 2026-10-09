import { CurrentUser, Forbidden, GameRpcs, NotFound } from "@examora/contract";
import { Effect } from "effect";
import { LiveHub } from "../Live.ts";
import { Game } from "../modes/game.ts";
import { requirePermission } from "../Session.ts";

const noGame = new NotFound({ message: "That game doesn't exist." });

export const GameHandlers = GameRpcs.toLayer(
  Effect.gen(function* () {
    const game = yield* Game;
    const hub = yield* LiveHub;

    // The teacher who owns the session.
    const host = Effect.fn("game.host")(function* (sessionId: string) {
      const user = yield* requirePermission({ session: ["host"] });
      if (!(yield* hub.ownsSession(sessionId, user.id))) return yield* noGame;
      return user;
    });

    return GameRpcs.of({
      "game.find": Effect.fn("game.find")(function* ({ code }) {
        const user = yield* requirePermission({ attempt: ["read"] });
        return yield* game.find(user, code);
      }),
      "game.join": Effect.fn("game.join")(function* ({ sessionId }) {
        const user = yield* requirePermission({ attempt: ["create"] });
        yield* game.join(user.id, sessionId);
      }),
      "game.answer": Effect.fn("game.answer")(function* ({ sessionId, questionId, value }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        yield* game.answer(user.id, sessionId, questionId, value);
      }),
      "game.next": Effect.fn("game.next")(function* ({ sessionId }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        yield* game.next(user.id, sessionId);
      }),
      "game.openLobby": Effect.fn("game.openLobby")(function* ({ sessionId }) {
        yield* host(sessionId);
        yield* game.openLobby(sessionId);
      }),
      "game.start": Effect.fn("game.start")(function* ({ sessionId }) {
        yield* host(sessionId);
        yield* game.start(sessionId);
      }),
      "game.advance": Effect.fn("game.advance")(function* ({ sessionId }) {
        yield* host(sessionId);
        yield* game.advance(sessionId);
      }),
      "game.pause": Effect.fn("game.pause")(function* ({ sessionId }) {
        yield* host(sessionId);
        yield* game.pause(sessionId);
      }),
      "game.resume": Effect.fn("game.resume")(function* ({ sessionId }) {
        yield* host(sessionId);
        yield* game.unpause(sessionId);
      }),
      "game.goTo": Effect.fn("game.goTo")(function* ({ sessionId, index }) {
        yield* host(sessionId);
        yield* game.goTo(sessionId, index);
      }),
      "game.setSeconds": Effect.fn("game.setSeconds")(function* ({ sessionId, seconds }) {
        yield* host(sessionId);
        yield* game.setSeconds(sessionId, seconds);
      }),
      "game.end": Effect.fn("game.end")(function* ({ sessionId }) {
        yield* host(sessionId);
        yield* game.end(sessionId);
      }),
      "game.kick": Effect.fn("game.kick")(function* ({ sessionId, attemptId }) {
        yield* host(sessionId);
        yield* game.kick(sessionId, attemptId);
      }),
      "game.standings": Effect.fn("game.standings")(function* ({ sessionId }) {
        const current = yield* CurrentUser;
        if (current.role === "teacher") {
          yield* host(sessionId);
          return yield* game.standings(sessionId, null);
        }
        const user = yield* requirePermission({ attempt: ["read"] });
        if (!(yield* game.isRostered(sessionId, user.id))) return yield* noGame;
        const result = yield* game.standings(sessionId, user.id);
        // Students see the standings once the game is over.
        if (!result.ended) return yield* new Forbidden({ message: "The standings come out when the game ends." });
        return result;
      }),
      "game.gallery": Effect.fn("game.gallery")(function* ({ sessionId, questionId }) {
        const user = yield* host(sessionId);
        return yield* game.gallery(sessionId, questionId, user);
      }),
    });
  }),
);
