// The rooms in memory. The position of a teacher-paced game (phase, question, when it opened) is on `quiz_sessions`;
// each player's points and streak are on `attempts`; every answer is an `answers` row with the points it earned.
// A `Room` is a cache of that, rebuilt from the database the first time anything touches the session after a
// restart, so the same question carries on with the time it had left.
import { NotFound } from "@examinus/contract/errors";
import { Context, Effect, Layer, Semaphore, SynchronizedRef } from "effect";
import { gameRooms, record } from "../../platform/Metrics.ts";
import { avatarOf } from "../auth/avatar.ts";
import { attemptPaper, flatQuestions } from "../attempt/rules.ts";
import { hashSeed, paperOf, recomputeBoard, restoreTeams, tallyKeys } from "./Engine.ts";
import { GameRepo } from "./Repo.ts";
import type { Player, Room } from "./Room.ts";

const noGame = new NotFound({ message: "That game doesn't exist." });

export class RoomStore extends Context.Service<
  RoomStore,
  {
    // The room of a game, loaded on first use; null when there is no such game.
    readonly get: (sessionId: string) => Effect.Effect<Room | null>;
    readonly need: (sessionId: string) => Effect.Effect<Room, NotFound>;
    // The room if it is in memory; never loads.
    readonly peek: (sessionId: string) => Effect.Effect<Room | undefined>;
    // Every room in memory.
    readonly all: Effect.Effect<[string, Room][]>;
    readonly drop: (sessionId: string) => Effect.Effect<void>;
  }
>()("examinus/api/RoomStore") {
  static readonly layer = Layer.effect(
    RoomStore,
    Effect.gen(function* () {
      const repo = yield* GameRepo;
      // Treated as immutable: a change is a new map, made while the ref's lock is held.
      const rooms = yield* SynchronizedRef.make<ReadonlyMap<string, Room>>(new Map());

      // --- Loading a room from the database ---

      const load = Effect.fn("RoomStore.load")(function* (sessionId: string) {
        const head = yield* repo.roomHead(sessionId);
        if (!head) return null;
        const { session, detail } = head;
        const seed = hashSeed(session.id);
        // A relay deals out the whole quiz, so its questions are never drawn from a pool.
        const questions = flatQuestions(session.relay ? detail.parts : attemptPaper(detail, seed));
        const rows = yield* repo.players(sessionId);
        const done = yield* repo.scored(sessionId);
        const removedRows = yield* repo.removedPlayers(sessionId);
        const pacing = session.pacing;
        const room: Room = {
          id: session.id,
          title: head.quiz.title,
          pacing,
          seconds: session.gameQuestionSeconds,
          leaderboard: session.gameLeaderboard,
          streakBonus: session.gameStreakBonus,
          lateJoinMinutes: session.lateJoinMinutes,
          joinCode: session.joinCode,
          status: session.status,
          startedAt: session.startedAt?.getTime() ?? null,
          endedAt: session.endedAt?.getTime() ?? null,
          detail,
          seed,
          questions,
          byId: new Map(flatQuestions(detail.parts).map((q) => [q.id, q])),
          phase: session.gamePhase ?? (session.status === "ended" ? "ended" : "lobby"),
          index: session.currentQuestionIndex ?? 0,
          questionStartedAt: session.questionStartedAt?.getTime() ?? null,
          pausedAt: session.gamePhase === "question" ? (session.pausedAt?.getTime() ?? null) : null,
          played: new Set(),
          closing: false,
          inflight: 0,
          players: new Map(),
          byUser: new Map(),
          answeredNow: new Set(),
          tally: new Map(),
          lastResult: new Map(),
          board: [],
          ranks: new Map(),
          boardDirty: false,
          presenterDirty: false,
          lock: Semaphore.makeUnsafe(1),
          removed: new Map(removedRows.map((r) => [r.userId, { userId: r.userId, name: r.name, avatar: avatarOf(r.userId, r.avatar) }])),
          relay: session.relay,
          relayPassword: session.relayPassword,
          relayClues: session.relayClues,
          teams: new Map(),
          relayVersion: 0,
        };
        for (const { attempt, name, avatar } of rows) {
          const p: Player = {
            attemptId: attempt.id,
            userId: attempt.studentId,
            name,
            avatar: avatarOf(attempt.studentId, avatar),
            seed: attempt.seed,
            points: attempt.points,
            streak: attempt.gameStreak,
            streakBefore: attempt.gameStreak,
            done: new Map(),
            index: attempt.questionIndex,
            startedAt: pacing === "student" ? (attempt.questionStartedAt?.getTime() ?? null) : null,
            finished: attempt.status !== "in_progress" && pacing === "student",
            paper: null,
            teamId: null,
            tries: new Map(),
          };
          room.players.set(p.attemptId, p);
          room.byUser.set(p.userId, p);
        }
        for (const r of done) {
          const p = room.players.get(r.attemptId);
          if (!p) continue;
          p.done.set(r.questionId, { correct: r.correct, earned: r.earned ?? 0 });
          if (r.tries > 0) p.tries.set(r.questionId, r.tries);
        }
        if (pacing === "teacher") {
          // Questions answered by anyone were played; so was the one on screen.
          const answeredIds = new Set(done.map((r) => r.questionId));
          questions.forEach((q, i) => answeredIds.has(q.id) && room.played.add(i));
          if (room.phase !== "lobby" && room.phase !== "ended") room.played.add(room.index);
        }
        // The open or just closed question of a teacher-paced game: who answered it and how the answers split.
        const current = pacing === "teacher" && (room.phase === "question" || room.phase === "reveal") ? questions[room.index] : undefined;
        if (current) {
          const values = yield* repo.questionAnswers(sessionId, current.id);
          for (const v of values) {
            room.answeredNow.add(v.attemptId);
            for (const key of tallyKeys(current, v.value, v.autoScore)) room.tally.set(key, (room.tally.get(key) ?? 0) + 1);
            room.lastResult.set(v.attemptId, { correct: v.correct, answered: true, earned: v.earned ?? 0 });
          }
        }
        if (session.relay) {
          const teamRows = yield* repo.teams(room.id);
          if (teamRows) restoreTeams(room, teamRows);
          // A retry in progress: the question was opened again after its answer.
          const reopened = new Map(rows.map((r) => [r.attempt.id, r.attempt.questionStartedAt]));
          for (const r of done) {
            const p = room.players.get(r.attemptId);
            const reopenedAt = reopened.get(r.attemptId);
            if (!p || p.finished || !reopenedAt) continue;
            if (paperOf(room, p)[p.index]?.id === r.questionId && reopenedAt.getTime() > r.answeredAt.getTime()) p.done.delete(r.questionId);
          }
        }
        recomputeBoard(room);
        return room;
      });

      // Loads of different games take turns, so two requests for the same game never build it twice.
      const get = Effect.fn("RoomStore.get")(function* (sessionId: string) {
        const known = (yield* SynchronizedRef.get(rooms)).get(sessionId);
        if (known) return known;
        return yield* SynchronizedRef.modifyEffect(rooms, (current) =>
          Effect.gen(function* () {
            const again = current.get(sessionId);
            if (again) return [again, current] as const;
            const room = yield* load(sessionId);
            if (!room) return [null, current] as const;
            const next = new Map(current).set(sessionId, room);
            yield* record(gameRooms, next.size, {});
            return [room, next] as const;
          }),
        );
      });

      return RoomStore.of({
        get,
        need: Effect.fn("RoomStore.need")(function* (sessionId: string) {
          return (yield* get(sessionId)) ?? (yield* noGame);
        }),
        peek: (sessionId) => Effect.map(SynchronizedRef.get(rooms), (current) => current.get(sessionId)),
        all: Effect.map(SynchronizedRef.get(rooms), (current) => [...current]),
        drop: (sessionId) =>
          SynchronizedRef.updateEffect(rooms, (current) => {
            const next = new Map(current);
            next.delete(sessionId);
            return record(gameRooms, next.size, {}).pipe(Effect.as(next));
          }),
      });
    }),
  );
}
