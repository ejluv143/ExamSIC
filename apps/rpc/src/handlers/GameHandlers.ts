import { CurrentUser, Forbidden, GameRpcs, NotFound } from "@examinus/contract";
import { Effect } from "effect";
import { LiveHub } from "../features/live/Service.ts";
import { Game } from "../modes/game.ts";
import { requirePermission } from "../features/auth/Session.ts";

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
      "game.pickTeam": Effect.fn("game.pickTeam")(function* ({ sessionId, teamId }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        yield* game.pickTeam(user.id, sessionId, teamId);
      }),
      "game.retry": Effect.fn("game.retry")(function* ({ sessionId }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        yield* game.retry(user.id, sessionId);
      }),
      "game.claimRescue": Effect.fn("game.claimRescue")(function* ({ sessionId, questionId }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        yield* game.claimRescue(user.id, sessionId, questionId);
      }),
      "game.rescue": Effect.fn("game.rescue")(function* ({ sessionId, questionId, value }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        yield* game.rescue(user.id, sessionId, questionId, value);
      }),
      "game.submitPassword": Effect.fn("game.submitPassword")(function* ({ sessionId, guess }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        yield* game.submitPassword(user.id, sessionId, guess);
      }),
      "game.confirmPassword": Effect.fn("game.confirmPassword")(function* ({ sessionId }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        yield* game.confirmPassword(user.id, sessionId);
      }),
      "game.rejectPassword": Effect.fn("game.rejectPassword")(function* ({ sessionId }) {
        const user = yield* requirePermission({ attempt: ["update"] });
        yield* game.rejectPassword(user.id, sessionId);
      }),
      "game.assignTeam": Effect.fn("game.assignTeam")(function* ({ sessionId, attemptId, teamId }) {
        yield* host(sessionId);
        yield* game.assignTeam(sessionId, attemptId, teamId);
      }),
      "game.randomizeTeams": Effect.fn("game.randomizeTeams")(function* ({ sessionId }) {
        yield* host(sessionId);
        yield* game.randomizeTeams(sessionId);
      }),
      "game.balanceTeams": Effect.fn("game.balanceTeams")(function* ({ sessionId }) {
        yield* host(sessionId);
        yield* game.balanceTeams(sessionId);
      }),
      "game.addTeam": Effect.fn("game.addTeam")(function* ({ sessionId }) {
        yield* host(sessionId);
        yield* game.addTeam(sessionId);
      }),
      "game.removeTeam": Effect.fn("game.removeTeam")(function* ({ sessionId, teamId }) {
        yield* host(sessionId);
        yield* game.removeTeam(sessionId, teamId);
      }),
      "game.setStudentPick": Effect.fn("game.setStudentPick")(function* ({ sessionId, allowed }) {
        yield* host(sessionId);
        yield* game.setStudentPick(sessionId, allowed);
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
      "game.allowRejoin": Effect.fn("game.allowRejoin")(function* ({ sessionId, userId }) {
        yield* host(sessionId);
        yield* game.allowRejoin(sessionId, userId);
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
