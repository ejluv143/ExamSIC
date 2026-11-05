// Every change to a `Room` after it is loaded (RoomStore.ts loads it) is a transition in this file, and each one is a
// single serialised operation: it takes the room's lock once (`locked`, the only place it is taken), checks the
// rules of Engine.ts against the state it finds there, changes the room, writes the change through GameRepo, and
// publishes to the audience that must see it. Classic or relay, teacher- or student-paced: the branches are in here,
// so Service.ts only decides who may ask.
//
// Effect semaphores aren't re-entrant, so a transition is built from plain steps (`openAt`, `applyAnswer`, …) that
// assume the lock is held, and no step takes it again. Work that has to wait (answers on their way, a code check)
// happens outside the lock, in separate locked sections before and after: the lock is never held while waiting for
// something that itself needs the lock.
import { Conflict, Forbidden, NotFound } from "@examinus/contract/errors";
import type { GameLast } from "@examinus/contract/game";
import { type Avatar } from "@examinus/domain/avatar";
import { gameAnswerPoints, gameGraceMs, gameQuestionProblems } from "@examinus/domain/game";
import { kindOf } from "@examinus/domain/kinds";
import { type CodeTestResult } from "@examinus/domain/kinds/base";
import { type Question } from "@examinus/domain/question";
import { relayLimits, type AnswerValue, type RelaySettings } from "@examinus/domain/quiz";
import { normalizePassword, rescuePoints, balanceTeams, randomizeTeams } from "@examinus/domain/relay";
import { autoScore } from "@examinus/domain/scoring";
import { Effect } from "effect";
import { authoredQuestions, gameQuestions } from "../attempt/paper.ts";
import { cleanAnswer, isBlank } from "../attempt/rules.ts";
import type { AttemptService } from "../attempt/Service.ts";
import { avatarOf } from "../auth/avatar.ts";
import type { LiveHub } from "../live/Service.ts";
import type { LiveBus } from "../../platform/LiveBus.ts";
import type { Runner } from "../../platform/Runner.ts";
import { checkAnswer } from "../../platform/checks.ts";
import {
  applyRelayStart,
  applyTeams,
  blankTeam,
  handOver,
  lobbyProblem,
  membership,
  memberRowsOf,
  newTeamRows,
  nextIndex,
  paperOf,
  pickLateTeam,
  placeIn,
  planRelayStart,
  playingTeam,
  recomputeBoard,
  relayAllOver,
  releaseSlots,
  scoreAnswer,
  slotStateOf,
  tallyKeys,
  teamOf,
  teamOver,
} from "./Engine.ts";
import type { GameRepo } from "./Repo.ts";
import {
  channelOf,
  checkWaitMs,
  guessGapMs,
  inflightPollMs,
  inflightWaitMs,
  type Player,
  type Room,
  type Signal,
  type Team,
} from "./Room.ts";
import type { GameViews } from "./Views.ts";

const noGame = new NotFound({ message: "That game doesn't exist." });
const joinFirst = () => new Forbidden({ message: "Join the game first." });

export type TransitionDeps = {
  repo: GameRepo["Service"];
  bus: LiveBus["Service"];
  attempts: AttemptService["Service"];
  hub: LiveHub["Service"];
  views: GameViews["Service"];
  runner: Runner["Service"];
};

// What a joining player is made of: their attempt row and profile.
export type Arrival = {
  userId: string;
  attempt: { id: string; seed: number; points: number; gameStreak: number; questionIndex: number };
  // True when joining made the attempt (a refused late join takes it back).
  created: boolean;
  profile: { name: string; avatar: Avatar | null } | undefined;
};

// An answer as it is stored: the row, and the player's points and streak with it.
type Stored = {
  row: { value: AnswerValue | null; correct: boolean | null; autoScore: number | null; timeMs: number | null; gamePointsEarned: number };
  points: number;
  streak: number;
};

// What `tick` found out about a room.
export type Standing = "live" | "expired" | "gone";

export const roomTransitions = ({ repo, bus, attempts, hub, views, runner }: TransitionDeps) => {
  const publish = (room: Room, signal: Signal) => bus.publish(channelOf(room.id), signal);

  // The one place a room's lock is taken.
  const locked = <A, E, R>(room: Room, body: Effect.Effect<A, E, R>) => room.lock.withPermits(1)(body);

  // A change that concerns one player: only their screen needs it, except in a relay, where teammates see each other.
  const aboutPlayer = (room: Room, userId: string): Signal => (room.relay !== null ? { to: "all" } : { to: "user", userId });

  const seat = (room: Room, userId: string) => {
    const p = room.byUser.get(userId);
    return p ? Effect.succeed(p) : Effect.fail(joinFirst());
  };

  // A relay game and the player in it.
  const relaySeat = Effect.fn("Room.relaySeat")(function* (room: Room, userId: string) {
    if (room.relay === null) return yield* new Conflict({ message: "This isn't a Team Relay game." });
    return { relay: room.relay, p: yield* seat(room, userId) };
  });

  // The player's team while its round is on.
  const relayPlaying = (room: Room, p: Player): Effect.Effect<Team, Conflict> =>
    Effect.suspend(() => {
      const playing = playingTeam(room, p);
      return "problem" in playing ? Effect.fail(new Conflict({ message: playing.problem })) : Effect.succeed(playing.team);
    });

  const waitForInflight = (room: Room, limitMs: number) =>
    Effect.gen(function* () {
      for (let waited = 0; room.inflight > 0 && waited < limitMs; waited += inflightPollMs) yield* Effect.sleep(`${inflightPollMs} millis`);
    });

  // --- Quiz rules ---

  // Fails with Conflict listing what stops this quiz from being a game with this pacing.
  const validate = Effect.fn("Room.validate")(function* (quizId: string, pacing: "teacher" | "student", relay = false) {
    const detail = yield* repo.quizDetail(quizId);
    if (!detail) return yield* new Conflict({ message: "That quiz doesn't exist." });
    const flat = authoredQuestions(detail);
    const problems = gameQuestionProblems(pacing, flat, relay);
    if (relay && flat.length < 2) problems.push("A Team Relay needs at least 2 questions.");
    if (problems.length > 0) return yield* new Conflict({ message: problems.join(" ") });
  });

  // --- Teacher-paced flow (steps: the lock is held) ---

  const persistPosition = (room: Room) =>
    repo.persistPosition(room.id, {
      phase: room.phase,
      index: room.index,
      questionStartedAt: room.questionStartedAt,
      pausedAt: room.pausedAt,
    });

  const openAt = Effect.fn("Room.openAt")(function* (room: Room, index: number) {
    room.phase = "question";
    room.index = index;
    room.played.add(index);
    room.questionStartedAt = Date.now();
    room.pausedAt = null;
    room.closing = false;
    room.answeredNow.clear();
    room.tally.clear();
    room.lastResult.clear();
    // Screens first: the room is what they show, the row is only for a restart. A commit can take a second or
    // more on a busy disk, and the question's clock is already running.
    yield* publish(room, { to: "all" });
    yield* persistPosition(room);
    // The question after this one is looked up now, so "Next" doesn't wait for it.
    const upcoming = nextIndex(room);
    const after = upcoming === null ? undefined : room.questions[upcoming];
    if (after) yield* views.extras(room, after).pipe(Effect.forkDetach);
  });

  // Closes the open question once its clock has run out (or when the teacher moves on): those who didn't
  // answer lose their streak, the standings update, the answers split is shown. Answering early never closes
  // it, so nobody learns their result while the others still have time. Safe to call twice.
  //
  // Two locked sections with the wait between them: answers on their way need the lock to land, so the wait can't
  // hold it. `closing` refuses new answers meanwhile and makes a second close return.
  const close = Effect.fn("Room.close")(function* (room: Room, index: number) {
    const begun = yield* locked(
      room,
      Effect.gen(function* () {
        if (room.phase !== "question" || room.index !== index || room.closing) return null;
        room.closing = true;
        // Code and SQL are checked by a runner or grader, which takes a while: the presenter sees "Checking
        // answers…" meanwhile.
        const limit = kindOf(room.questions[index]!).checker === undefined ? inflightWaitMs : checkWaitMs;
        if (room.inflight > 0 && limit === checkWaitMs) yield* publish(room, { to: "all" });
        return limit;
      }),
    );
    if (begun === null) return;
    // Answers already on their way finish first, so none is left out of the split. An answer that finishes after
    // this wait still stores its score but earns no game points (see `applyAnswer`).
    yield* waitForInflight(room, begun);
    yield* locked(
      room,
      Effect.gen(function* () {
        // The game ended while this waited.
        if (room.phase !== "question" || room.index !== index) return;
        const q = room.questions[index]!;
        const missed = [...room.players.values()].filter((p) => !room.answeredNow.has(p.attemptId));
        const breaksStreak = missed.filter((p) => q.gamePoints !== "none" && !kindOf(q).gameUnscored && p.streak > 0);
        for (const p of missed) room.lastResult.set(p.attemptId, { correct: false, answered: false, earned: 0 });
        for (const p of breaksStreak) p.streak = 0;
        room.phase = "reveal";
        room.pausedAt = null;
        room.closing = false;
        recomputeBoard(room);
        // The reveal shows at once; the database catches up behind it (see openAt).
        yield* publish(room, { to: "all" });
        if (breaksStreak.length > 0) yield* repo.resetStreaks(breaksStreak.map((p) => p.attemptId));
        yield* persistPosition(room);
      }),
    );
  });

  // Submits every attempt still open, so the normal results (score, grading queue, class record) exist.
  const gradeAll = Effect.fn("Room.gradeAll")(
    function* (room: Room) {
      const open = yield* repo.openAttempts(room.id);
      yield* Effect.forEach(open, (a) => attempts.submit({ attemptId: a.id, auto: false }), { concurrency: 6, discard: true });
      yield* hub.sessionChanged(room.id);
    },
    Effect.catchCause((cause) => Effect.logError("Grading the game failed", cause)),
  );

  const finish = Effect.fn("Room.finish")(function* (room: Room) {
    if (room.phase === "ended" && room.status === "ended") return;
    // A question in flight stops here; what was answered stays.
    yield* waitForInflight(room, inflightWaitMs);
    const ended = yield* locked(
      room,
      Effect.gen(function* () {
        if (room.phase === "ended" && room.status === "ended") return false;
        room.phase = "ended";
        room.status = "ended";
        room.endedAt = Date.now();
        recomputeBoard(room);
        yield* repo.markEnded(room.id, room.endedAt);
        yield* publish(room, { to: "all" });
        return true;
      }),
    );
    // Grading takes a while with a big room: the screens already show the podium.
    if (ended) yield* gradeAll(room).pipe(Effect.forkDetach);
  });

  // --- Answers ---

  // Scores one answer (or, `timedOut`, a question that ran out of time) into the room and returns the row to store.
  // `results`: the code or SQL checks, when the question has them.
  const applyAnswer = (
    room: Room,
    p: Player,
    q: Question,
    value: AnswerValue,
    elapsedMs: number,
    timedOut: boolean,
    results: CodeTestResult[] | null,
  ): Stored => {
    const scored = scoreAnswer(room, p, q, value, elapsedMs, timedOut, results);
    const { fraction, correct } = scored;
    // Teacher-paced, an answer whose check finished after its question closed keeps its score on the record but
    // earns no game points (the standings were already shown); a wrong one still breaks the streak.
    const late = room.pacing === "teacher" && (room.phase !== "question" || room.questions[room.index]?.id !== q.id);
    const earned = late ? 0 : scored.earned;
    const streak = late ? (fraction === null || fraction === 1 ? p.streak : 0) : scored.streak;
    p.streakBefore = p.streak;
    p.points += earned;
    p.streak = streak;
    p.done.set(q.id, { correct, earned });
    if (room.pacing === "teacher") {
      room.lastResult.set(p.attemptId, { correct, answered: true, earned } satisfies GameLast);
      for (const key of tallyKeys(q, value, fraction)) room.tally.set(key, (room.tally.get(key) ?? 0) + 1);
      room.presenterDirty = true;
    }
    room.boardDirty = true;
    room.relayVersion++;
    return {
      row: {
        value: timedOut ? null : value,
        correct,
        autoScore: fraction,
        timeMs: timedOut ? null : Math.round(elapsedMs),
        gamePointsEarned: earned,
      },
      points: p.points,
      streak: p.streak,
    };
  };

  const storeAnswer = (p: Player, q: Question, stored: Stored) =>
    repo.storeAnswer(p.attemptId, q.id, stored.row, stored.points, stored.streak);

  // Checks that the player may answer now and reserves the answer, so a double tap can't count twice.
  const reserveAnswer = Effect.fn("Room.reserveAnswer")(function* (room: Room, userId: string, questionId: string) {
    const p = yield* seat(room, userId);
    if (room.status === "ended" || room.phase === "ended") return yield* new Conflict({ message: "The game is over." });
    const now = Date.now();
    let q: Question | undefined;
    let openedAt: number;
    if (room.pacing === "teacher") {
      if (room.phase !== "question" || room.closing || room.questionStartedAt === null)
        return yield* new Conflict({ message: "This question is closed." });
      if (room.pausedAt !== null) return yield* new Conflict({ message: "The game is paused." });
      if (room.answeredNow.has(p.attemptId)) return yield* new Conflict({ message: "You already answered this question." });
      q = room.questions[room.index];
      openedAt = room.questionStartedAt;
    } else {
      if (room.status !== "running" || p.startedAt === null || p.finished) return yield* new Conflict({ message: "The game isn't running for you." });
      if (room.relay !== null) yield* relayPlaying(room, p);
      q = paperOf(room, p)[p.index];
      openedAt = p.startedAt;
      if (q && p.done.has(q.id)) return yield* new Conflict({ message: "You already answered this question." });
    }
    if (!q || q.id !== questionId) return yield* new Conflict({ message: "That question isn't open." });
    if (now > openedAt + room.seconds * 1000 + gameGraceMs) return yield* new Conflict({ message: "Time is up." });
    if (room.pacing === "teacher") room.answeredNow.add(p.attemptId);
    else p.done.set(q.id, { correct: null, earned: 0 });
    room.inflight++;
    return { p, q, elapsedMs: now - openedAt };
  });

  const answer = Effect.fn("Room.answer")(function* (room: Room, userId: string, questionId: string, value: AnswerValue) {
    const { p, q, elapsedMs } = yield* locked(room, reserveAnswer(room, userId, questionId));
    // The check (and a code or SQL one can take long) runs outside the lock; the answer lands under it.
    yield* Effect.gen(function* () {
      const cleaned = kindOf(q).answerPictures ? yield* repo.ownPictures(userId, cleanAnswer(q, value)) : cleanAnswer(q, value);
      const results = yield* checkAnswer(runner, q, cleaned, isBlank(cleaned));
      // A player removed while the check ran has no attempt left to store it on.
      const stored = yield* locked(room, Effect.sync(() => (room.players.get(p.attemptId) === p ? applyAnswer(room, p, q, cleaned, elapsedMs, false, results) : null)));
      if (stored) yield* storeAnswer(p, q, stored);
    }).pipe(Effect.ensuring(locked(room, Effect.sync(() => void room.inflight--))));
    // The player's screen locks ("Answer locked in"); teacher-paced, the result waits for the clock.
    yield* publish(room, aboutPlayer(room, userId));
  });

  const next = Effect.fn("Room.next")(function* (room: Room, userId: string) {
    yield* locked(
      room,
      Effect.gen(function* () {
        if (room.pacing !== "student") return yield* new Conflict({ message: "The teacher moves this game along." });
        const p = yield* seat(room, userId);
        if (room.status !== "running") return yield* new Conflict({ message: "The game isn't running." });
        if (room.relay !== null) yield* relayPlaying(room, p);
        const now = Date.now();
        if (p.finished) return;
        const paper = paperOf(room, p);
        if (p.startedAt === null && paper.length > 0) {
          p.index = 0;
        } else {
          const q = paper[p.index];
          if (p.startedAt !== null && q && !p.done.has(q.id)) return yield* new Conflict({ message: "Answer the question first." });
          // The last question is done; a relay player whose team gave them nothing finishes at once.
          if (p.startedAt === null || p.index + 1 >= paper.length) {
            p.finished = true;
            room.presenterDirty = true;
            yield* attempts.submit({ attemptId: p.attemptId, auto: false }).pipe(Effect.forkDetach);
            yield* publish(room, aboutPlayer(room, userId));
            return;
          }
          p.index++;
        }
        p.startedAt = now;
        yield* repo.setQuestion(p.attemptId, p.index, now);
        yield* publish(room, aboutPlayer(room, userId));
      }),
    );
  });

  // --- Joining and leaving ---

  // Whether a player may join (checked before their attempt is made); true: they are in already.
  const canJoin = (room: Room, userId: string): Effect.Effect<boolean, Conflict> =>
    Effect.gen(function* () {
      if (room.byUser.has(userId)) return true;
      if (room.status === "ended") return yield* new Conflict({ message: "This game is over." });
      if (room.status !== "lobby" && room.status !== "running")
        return yield* new Conflict({ message: "Your teacher hasn't opened the game yet." });
      if (
        room.status === "running" &&
        room.lateJoinMinutes !== null &&
        room.startedAt !== null &&
        Date.now() > room.startedAt + room.lateJoinMinutes * 60_000
      )
        return yield* new Conflict({ message: `It's too late to join: players could join in the first ${room.lateJoinMinutes} minutes.` });
      if (room.relay !== null && room.status === "running" && pickLateTeam(room) === null)
        return yield* new Conflict({ message: "Every team is full." });
      return false;
    });

  // Seats a player whose attempt exists. Two requests can join the same student at once: the first to get here wins.
  // A relay game that already started puts the newcomer in the smallest team that is still playing.
  const admit = Effect.fn("Room.admit")(function* (room: Room, arrival: Arrival) {
    const { userId, attempt, created, profile } = arrival;
    yield* locked(
      room,
      Effect.gen(function* () {
        if (room.byUser.has(userId)) return;
        const p: Player = {
          attemptId: attempt.id,
          userId,
          name: profile?.name ?? "Player",
          avatar: avatarOf(userId, profile?.avatar ?? null),
          seed: attempt.seed,
          points: attempt.points,
          streak: attempt.gameStreak,
          streakBefore: attempt.gameStreak,
          done: new Map(),
          index: attempt.questionIndex,
          startedAt: null,
          finished: false,
          paper: null,
          teamId: null,
          tries: new Map(),
        };
        if (room.relay !== null && room.status === "running") {
          const team = pickLateTeam(room);
          if (team === null) {
            if (created) yield* repo.deleteAttempt(p.attemptId);
            return yield* new Conflict({ message: "Every team is full." });
          }
          room.players.set(p.attemptId, p);
          room.byUser.set(userId, p);
          const updates = handOver(room, team, p);
          yield* repo.joinTeam(p.attemptId, team.id, updates);
          room.relayVersion++;
          room.presenterDirty = true;
          room.boardDirty = true;
          yield* publish(room, { to: "all" });
          return;
        }
        room.players.set(p.attemptId, p);
        room.byUser.set(userId, p);
        room.presenterDirty = true;
        room.boardDirty = true;
        yield* publish(room, { to: "user", userId });
      }),
    );
  });

  const kick = Effect.fn("Room.kick")(function* (room: Room, attemptId: string) {
    yield* locked(
      room,
      Effect.gen(function* () {
        const p = room.players.get(attemptId);
        if (!p) return yield* noGame;
        // A relay team's questions are handed to the teammates (or left without an owner) before the player goes.
        const updates = room.relay !== null ? releaseSlots(room, p) : [];
        room.players.delete(attemptId);
        room.byUser.delete(p.userId);
        room.answeredNow.delete(attemptId);
        room.removed.set(p.userId, { userId: p.userId, name: p.name, avatar: p.avatar });
        // Out of the game: no seat, and no way to join again with the key until the teacher allows it (the roster row
        // stays, marked removed).
        yield* repo.removePlayer(room.id, attemptId, p.userId, updates);
        room.presenterDirty = true;
        room.boardDirty = true;
        yield* publish(room, aboutPlayer(room, p.userId));
      }),
    );
  });

  const allowRejoin = Effect.fn("Room.allowRejoin")(function* (room: Room, userId: string) {
    yield* locked(
      room,
      Effect.gen(function* () {
        if (!room.removed.has(userId)) return yield* new NotFound({ message: "That player wasn't removed." });
        yield* repo.allowRejoin(room.id, userId);
        room.removed.delete(userId);
        // The player's screen offers to join again.
        yield* publish(room, { to: "presenter" });
        yield* publish(room, { to: "user", userId });
      }),
    );
  });

  // The player saved a new avatar: this game shows it.
  const avatarChanged = Effect.fn("Room.avatarChanged")(function* (room: Room, userId: string, avatar: Avatar) {
    yield* locked(
      room,
      Effect.gen(function* () {
        const p = room.byUser.get(userId);
        if (!p) return;
        p.avatar = avatar;
        // Only the picture changes: the standings stay as of the last closed question.
        room.board = room.board.map((row) => (row.attemptId === p.attemptId ? { ...row, avatar } : row));
        yield* publish(room, { to: "all" });
      }),
    );
  });

  // --- The teacher's controls ---

  const makeTeams = Effect.fn("Room.makeTeams")(function* (room: Room, count: number) {
    const rows = newTeamRows(room, count);
    if (rows.length === 0) return;
    const created = yield* repo.insertTeams(rows);
    for (const t of created) room.teams.set(t.id, blankTeam(t));
  });

  const openLobby = Effect.fn("Room.openLobby")(function* (room: Room) {
    const opened = yield* locked(
      room,
      Effect.gen(function* () {
        if (room.status === "ended") return yield* new Conflict({ message: "This game is over." });
        if (room.status !== "scheduled") return false;
        yield* validate(room.detail.quiz.id, room.pacing, room.relay !== null);
        if (room.relay !== null && room.teams.size === 0) yield* makeTeams(room, room.relay.teamCount);
        room.status = "lobby";
        room.phase = "lobby";
        yield* repo.setLobby(room.id);
        yield* publish(room, { to: "all" });
        return true;
      }),
    );
    if (opened) yield* hub.sessionChanged(room.id);
  });

  const startRelay = Effect.fn("Room.startRelay")(function* (room: Room) {
    if (room.status === "ended") return yield* new Conflict({ message: "This game is over." });
    if (room.status === "running") return yield* new Conflict({ message: "The game already started." });
    if (room.status !== "lobby") return yield* new Conflict({ message: "Open the lobby first." });
    yield* validate(room.detail.quiz.id, room.pacing, true);
    if (room.players.size === 0) return yield* new Conflict({ message: "Wait for at least two players to join." });
    const plan = planRelayStart(room);
    if (plan.problem !== null) return yield* new Conflict({ message: plan.problem });
    const now = new Date();
    yield* repo.startRelay(
      room.id,
      now,
      plan.teams.filter((t) => !plan.playing.includes(t)).map((t) => t.id),
      plan.plans.map((p) => ({ teamId: p.team.id, members: p.members, password: p.password, slots: [...p.slots.values()] })),
    );
    applyRelayStart(room, plan.teams, plan.playing, plan.plans);
    room.status = "running";
    room.startedAt = now.getTime();
    yield* publish(room, { to: "all" });
  });

  const startClassic = Effect.fn("Room.startClassic")(function* (room: Room) {
    if (room.status === "ended") return yield* new Conflict({ message: "This game is over." });
    if (room.status === "running" && (room.pacing === "student" || room.phase !== "lobby"))
      return yield* new Conflict({ message: "The game already started." });
    yield* validate(room.detail.quiz.id, room.pacing);
    if (room.players.size === 0) return yield* new Conflict({ message: "Wait for at least one player to join." });
    const now = new Date();
    room.status = "running";
    room.startedAt = now.getTime();
    yield* repo.setRunning(room.id, now);
    if (room.pacing === "teacher") yield* openAt(room, 0);
    else yield* publish(room, { to: "all" });
  });

  const start = Effect.fn("Room.start")(function* (room: Room) {
    yield* locked(room, room.relay !== null ? startRelay(room) : startClassic(room));
    yield* hub.sessionChanged(room.id);
  });

  // The teacher moves a teacher-paced game on: close the question, show the standings, open the next, or end.
  // Closing and ending wait for answers on their way, so they run after this section has let go of the lock.
  const advance = Effect.fn("Room.advance")(function* (room: Room) {
    const then = yield* locked(
      room,
      Effect.gen(function* () {
        if (room.pacing !== "teacher") return yield* new Conflict({ message: "Players move through a student-paced game themselves." });
        const upcoming = nextIndex(room);
        switch (room.phase) {
          case "question":
            return { close: room.index };
          case "reveal":
            if (upcoming === null) return "finish" as const;
            if (!room.leaderboard) {
              yield* openAt(room, upcoming);
              return null;
            }
            room.phase = "leaderboard";
            yield* publish(room, { to: "all" });
            yield* persistPosition(room);
            return null;
          case "leaderboard":
            if (upcoming === null) return "finish" as const;
            yield* openAt(room, upcoming);
            return null;
          default:
            return yield* new Conflict({ message: "The game isn't running." });
        }
      }),
    );
    if (then === null) return;
    if (then === "finish") return yield* finish(room);
    return yield* close(room, then.close);
  });

  const teacherClock = (room: Room) =>
    Effect.gen(function* () {
      if (room.pacing !== "teacher") return yield* new Conflict({ message: "Only a teacher-paced game has a clock the teacher controls." });
      if (room.status !== "running" || room.phase === "ended") return yield* new Conflict({ message: "The game isn't running." });
    });

  const pause = Effect.fn("Room.pause")(function* (room: Room) {
    yield* locked(
      room,
      Effect.gen(function* () {
        yield* teacherClock(room);
        if (room.phase !== "question") return yield* new Conflict({ message: "There's no question open to pause." });
        if (room.pausedAt !== null) return yield* new Conflict({ message: "The game is already paused." });
        room.pausedAt = Date.now();
        yield* publish(room, { to: "all" });
        yield* persistPosition(room);
      }),
    );
  });

  const unpause = Effect.fn("Room.unpause")(function* (room: Room) {
    yield* locked(
      room,
      Effect.gen(function* () {
        yield* teacherClock(room);
        if (room.pausedAt === null) return yield* new Conflict({ message: "The game isn't paused." });
        // The question keeps the time it had left: its start moves on by the time paused.
        if (room.questionStartedAt !== null) room.questionStartedAt += Date.now() - room.pausedAt;
        room.pausedAt = null;
        yield* publish(room, { to: "all" });
        yield* persistPosition(room);
      }),
    );
  });

  const goTo = Effect.fn("Room.goTo")(function* (room: Room, index: number) {
    yield* locked(
      room,
      Effect.gen(function* () {
        yield* teacherClock(room);
        if (room.phase === "question") return yield* new Conflict({ message: "Close the open question first." });
        if (!Number.isInteger(index) || index < 0 || index >= room.questions.length)
          return yield* new Conflict({ message: "There's no such question." });
        if (room.played.has(index)) return yield* new Conflict({ message: "That question was already played." });
        yield* openAt(room, index);
      }),
    );
  });

  // Applies a new question length to the room (an open question keeps its start and must close at once if the new
  // length has already passed: the index to close), and tells every screen otherwise.
  const applySeconds = (room: Room, seconds: number) =>
    Effect.gen(function* () {
      room.seconds = seconds;
      const clock = room.pausedAt ?? Date.now();
      if (room.phase === "question" && room.pausedAt === null && room.questionStartedAt !== null && clock >= room.questionStartedAt + seconds * 1000)
        return room.index;
      yield* publish(room, { to: "all" });
      return null;
    });

  const setSeconds = Effect.fn("Room.setSeconds")(function* (room: Room, seconds: number) {
    const overdue = yield* locked(
      room,
      Effect.gen(function* () {
        yield* teacherClock(room);
        yield* repo.setSeconds(room.id, seconds);
        return yield* applySeconds(room, seconds);
      }),
    );
    if (overdue !== null) yield* close(room, overdue);
  });

  // The session's settings were edited (session.update): the room takes the ones a game reads while it runs.
  const applySettings = Effect.fn("Room.applySettings")(function* (room: Room) {
    const overdue = yield* locked(
      room,
      Effect.gen(function* () {
        const row = yield* repo.settings(room.id);
        if (!row) return null;
        room.leaderboard = row.leaderboard;
        room.streakBonus = row.streakBonus;
        room.lateJoinMinutes = row.lateJoinMinutes;
        room.integrity = row.integrity;
        // The relay settings only change before the game starts (a started game refuses the edit).
        if (room.startedAt === null && room.status !== "ended") {
          room.relay = row.relay;
          room.relayPassword = row.relayPassword;
          room.relayClues = row.relayClues;
          room.questions = gameQuestions(room.detail, room.seed, row.relay !== null);
          if (row.relay === null && room.teams.size > 0) {
            yield* repo.deleteTeams(room.id);
            room.teams.clear();
            for (const p of room.players.values()) {
              p.teamId = null;
              p.paper = null;
            }
          } else if (row.relay !== null && room.teams.size === 0 && room.status === "lobby") {
            yield* makeTeams(room, row.relay.teamCount);
          }
        }
        // Publishes, or says the question must close, so every screen sees the new rules.
        return yield* applySeconds(room, row.seconds);
      }),
    );
    if (overdue !== null) yield* close(room, overdue);
  });

  // --- Team Relay: the lobby ---

  // The relay's settings, or why the teams can't change now.
  const lobbyRelay = (room: Room): Effect.Effect<RelaySettings, Conflict> =>
    Effect.suspend(() => {
      const problem = lobbyProblem(room);
      return problem === null ? Effect.succeed(room.relay!) : Effect.fail(new Conflict({ message: problem }));
    });

  // Runs a lobby change, refusing it outside the lobby of a relay.
  const inLobby = <A, E>(room: Room, body: (relay: RelaySettings) => Effect.Effect<A, E>) =>
    locked(room, Effect.flatMap(lobbyRelay(room), body));

  // Writes the teams of the given players to the database.
  const saveMembers = (room: Room, attemptIds: string[]) => repo.saveMembers(attemptIds, memberRowsOf(room, attemptIds));

  const assignTeam = Effect.fn("Room.assignTeam")(function* (room: Room, attemptId: string, teamId: string | null) {
    yield* inLobby(room, (relay) =>
      Effect.gen(function* () {
        const p = room.players.get(attemptId);
        if (!p) return yield* new NotFound({ message: "That player isn't in the game." });
        if (teamId !== null) {
          const team = room.teams.get(teamId);
          if (!team) return yield* new NotFound({ message: "That team doesn't exist." });
          if (p.teamId !== teamId && team.members.length >= relay.teamSize) return yield* new Conflict({ message: `${team.name} is full.` });
        }
        placeIn(room, p, teamId);
        yield* saveMembers(room, [attemptId]);
        yield* publish(room, { to: "all" });
      }),
    );
  });

  const dealTeams = Effect.fn("Room.dealTeams")(function* (room: Room) {
    yield* inLobby(room, (relay) =>
      Effect.gen(function* () {
        const everyone = [...room.players.keys()];
        const dealt = randomizeTeams(everyone, [...room.teams.keys()], relay.teamSize, Math.floor(Math.random() * 2 ** 31));
        if (dealt === null) return yield* new Conflict({ message: "There are more players than places: add a team or make the teams bigger." });
        applyTeams(room, dealt);
        yield* saveMembers(room, everyone);
        yield* publish(room, { to: "all" });
      }),
    );
  });

  const levelTeams = Effect.fn("Room.levelTeams")(function* (room: Room) {
    yield* inLobby(room, (relay) =>
      Effect.gen(function* () {
        const unassigned = [...room.players.values()].filter((p) => p.teamId === null).map((p) => p.attemptId);
        const level = balanceTeams(membership(room), unassigned, relay.teamSize);
        applyTeams(room, level.teams);
        yield* saveMembers(room, [...room.players.keys()]);
        yield* publish(room, { to: "all" });
      }),
    );
  });

  const addTeam = Effect.fn("Room.addTeam")(function* (room: Room) {
    yield* inLobby(room, () =>
      Effect.gen(function* () {
        if (room.teams.size >= relayLimits.teamCount.maximum)
          return yield* new Conflict({ message: `A relay has at most ${relayLimits.teamCount.maximum} teams.` });
        yield* makeTeams(room, 1);
        yield* publish(room, { to: "all" });
      }),
    );
  });

  const removeTeam = Effect.fn("Room.removeTeam")(function* (room: Room, teamId: string) {
    yield* inLobby(room, () =>
      Effect.gen(function* () {
        const team = room.teams.get(teamId);
        if (!team) return yield* new NotFound({ message: "That team doesn't exist." });
        if (room.teams.size <= 1) return yield* new Conflict({ message: "A relay needs at least one team." });
        // Its members go back to the unassigned.
        for (const id of team.members) {
          const p = room.players.get(id);
          if (p) {
            p.teamId = null;
            p.paper = null;
          }
        }
        room.teams.delete(teamId);
        yield* repo.deleteTeam(teamId);
        yield* publish(room, { to: "all" });
      }),
    );
  });

  const setStudentPick = Effect.fn("Room.setStudentPick")(function* (room: Room, allowed: boolean) {
    yield* inLobby(room, (relay) =>
      Effect.gen(function* () {
        const changed = { ...relay, studentPick: allowed };
        yield* repo.setRelay(room.id, changed);
        room.relay = changed;
        yield* publish(room, { to: "all" });
      }),
    );
  });

  // A student takes (or switches to) a team of their own choice, when the teacher allows it.
  const pickTeam = Effect.fn("Room.pickTeam")(function* (room: Room, userId: string, teamId: string) {
    yield* locked(
      room,
      Effect.gen(function* () {
        const p = yield* seat(room, userId);
        const relay = yield* lobbyRelay(room);
        if (!relay.studentPick) return yield* new Conflict({ message: "Your teacher puts the players in teams." });
        const team = room.teams.get(teamId);
        if (!team) return yield* new NotFound({ message: "That team doesn't exist." });
        if (p.teamId === teamId) return;
        if (team.members.length >= relay.teamSize) return yield* new Conflict({ message: `${team.name} is full.` });
        placeIn(room, p, teamId);
        yield* saveMembers(room, [p.attemptId]);
        yield* publish(room, { to: "all" });
      }),
    );
  });

  // --- Team Relay: playing ---

  // Another try at the question on screen after a wrong answer.
  const retry = Effect.fn("Room.retry")(function* (room: Room, userId: string) {
    yield* locked(
      room,
      Effect.gen(function* () {
        const { relay, p } = yield* relaySeat(room, userId);
        yield* relayPlaying(room, p);
        if (!relay.retry) return yield* new Conflict({ message: "Your teacher didn't allow retries." });
        const q = p.finished || p.startedAt === null ? undefined : paperOf(room, p)[p.index];
        const done = q ? p.done.get(q.id) : undefined;
        if (!q || !done) return yield* new Conflict({ message: "There's no answer to try again." });
        if (done.correct === null) return yield* new Conflict({ message: "Your answer is still being checked." });
        if (done.correct) return yield* new Conflict({ message: "That answer was right." });
        const used = p.tries.get(q.id) ?? 0;
        if (used >= relay.retryLimit) return yield* new Conflict({ message: "You've used your retries on this question." });
        const now = Date.now();
        // What the first answer earned is taken back: the next answer earns again, less for the retry.
        p.tries.set(q.id, used + 1);
        p.points -= done.earned;
        p.done.delete(q.id);
        p.startedAt = now;
        room.boardDirty = true;
        room.relayVersion++;
        yield* repo.retry(p.attemptId, q.id, used + 1, p.points, now);
        yield* publish(room, { to: "all" });
      }),
    );
  });

  // A player who finished their own questions takes a teammate's locked one (the first to ask gets it).
  const claimRescue = Effect.fn("Room.claimRescue")(function* (room: Room, userId: string, questionId: string) {
    yield* locked(
      room,
      Effect.gen(function* () {
        const { relay, p } = yield* relaySeat(room, userId);
        if (!relay.rescue) return yield* new Conflict({ message: "Rescues are off in this game." });
        const team = yield* relayPlaying(room, p);
        if (!p.finished) return yield* new Conflict({ message: "Finish your own questions first." });
        if ([...team.slots.values()].some((s) => s.rescuer === p.attemptId && s.rescueCorrect === null))
          return yield* new Conflict({ message: "Answer the question you took first." });
        const slot = team.slots.get(questionId);
        if (!slot || slot.owner === p.attemptId || slotStateOf(room, slot) !== "rescue")
          return yield* new Conflict({ message: "That question can't be rescued." });
        const now = Date.now();
        slot.rescuer = p.attemptId;
        slot.rescueClaimedAt = now;
        yield* repo.claimRescue(team.id, questionId, p.attemptId, now);
        room.relayVersion++;
        yield* publish(room, { to: "all" });
      }),
    );
  });

  // The answer to the claimed rescue question: it earns the rescuer a share of the points, and it never touches
  // the owner's answer or grade. Checked outside the lock like any answer; what it earned lands under it.
  const rescueAnswer = Effect.fn("Room.rescue")(function* (room: Room, userId: string, questionId: string, value: AnswerValue) {
    const claim = yield* locked(
      room,
      Effect.gen(function* () {
        const { relay, p } = yield* relaySeat(room, userId);
        const team = yield* relayPlaying(room, p);
        const slot = team.slots.get(questionId);
        const q = room.byId.get(questionId);
        if (!slot || !q || slot.rescuer !== p.attemptId || slot.rescueCorrect !== null)
          return yield* new Conflict({ message: "You haven't taken that question." });
        if (slot.scoring) return yield* new Conflict({ message: "Your answer is already in." });
        const now = Date.now();
        const claimedAt = slot.rescueClaimedAt ?? now;
        if (now > claimedAt + room.seconds * 1000 + gameGraceMs) return yield* new Conflict({ message: "Time is up." });
        slot.scoring = true;
        room.inflight++;
        return { relay, p, team, slot, q, elapsedMs: now - claimedAt };
      }),
    );
    const { relay, p, team, slot, q, elapsedMs } = claim;
    yield* Effect.gen(function* () {
      const cleaned = cleanAnswer(q, value);
      const results = yield* checkAnswer(runner, q, cleaned, isBlank(cleaned));
      const fraction = autoScore(q, cleaned, results);
      const earned = gameAnswerPoints({
        gamePoints: q.gamePoints,
        fraction,
        elapsedMs,
        limitMs: room.seconds * 1000,
        streak: 0,
        streakBonus: false,
      }).earned;
      const points = rescuePoints(earned, relay.rescuePoints);
      const correct = fraction === 1;
      yield* locked(
        room,
        Effect.gen(function* () {
          // A rescuer removed while the check ran has no attempt left to score on.
          if (room.players.get(p.attemptId) !== p) return;
          yield* repo.scoreRescue(team.id, questionId, p.attemptId, cleaned, correct, points, p.points + points);
          slot.rescueCorrect = correct;
          p.points += points;
          room.boardDirty = true;
          room.relayVersion++;
        }),
      );
    }).pipe(
      Effect.ensuring(
        locked(
          room,
          Effect.sync(() => {
            slot.scoring = false;
            room.inflight--;
          }),
        ),
      ),
    );
    yield* publish(room, { to: "all" });
  });

  // --- Team Relay: the password ---

  // Checks a guess for the team (the lock is held). Right: the team solved it. Wrong: one guess less.
  const checkGuess = Effect.fn("Room.checkGuess")(function* (room: Room, team: Team, by: Player, guess: string) {
    const now = Date.now();
    if (now - team.lastGuessAt < guessGapMs) return yield* new Conflict({ message: "Wait a moment before the next guess." });
    const text = guess.trim();
    const correct = team.password !== null && normalizePassword(text) === normalizePassword(team.password);
    team.lastGuessAt = now;
    team.proposal = null;
    team.lastGuess = { guess: text, by: by.name, correct };
    if (correct) team.solvedAt = now;
    else team.wrongGuesses++;
    room.relayVersion++;
    yield* repo.saveGuess(team.id, by.attemptId, text, correct, correct ? { solvedAt: now } : { wrongGuesses: team.wrongGuesses });
    yield* publish(room, { to: "all" });
  });

  // After a result that may end the game (the lock is not held).
  const endIfAllOver = (room: Room) => (relayAllOver(room) ? finish(room) : Effect.void);

  const submitPassword = Effect.fn("Room.submitPassword")(function* (room: Room, userId: string, guess: string) {
    yield* locked(
      room,
      Effect.gen(function* () {
        const { relay, p } = yield* relaySeat(room, userId);
        const team = yield* relayPlaying(room, p);
        if (normalizePassword(guess) === "") return yield* new Conflict({ message: "Type the password first." });
        if (team.proposal !== null) return yield* new Conflict({ message: "A guess is waiting for your teammates: confirm or reject it." });
        if (relay.requireConsensus && team.members.length > 1) {
          team.proposal = { guess: guess.trim(), by: p.attemptId, confirmed: [p.attemptId] };
          return yield* publish(room, { to: "all" });
        }
        yield* checkGuess(room, team, p, guess);
      }),
    );
    yield* endIfAllOver(room);
  });

  const confirmPassword = Effect.fn("Room.confirmPassword")(function* (room: Room, userId: string) {
    yield* locked(
      room,
      Effect.gen(function* () {
        const { p } = yield* relaySeat(room, userId);
        const team = yield* relayPlaying(room, p);
        const proposal = team.proposal;
        if (proposal === null) return yield* new Conflict({ message: "There's no guess to confirm." });
        if (proposal.confirmed.includes(p.attemptId)) return;
        if (Date.now() - team.lastGuessAt < guessGapMs) return yield* new Conflict({ message: "Wait a moment before the next guess." });
        proposal.confirmed.push(p.attemptId);
        if (team.members.every((id) => proposal.confirmed.includes(id))) {
          const by = room.players.get(proposal.by) ?? p;
          return yield* checkGuess(room, team, by, proposal.guess);
        }
        yield* publish(room, { to: "all" });
      }),
    );
    yield* endIfAllOver(room);
  });

  const rejectPassword = Effect.fn("Room.rejectPassword")(function* (room: Room, userId: string) {
    yield* locked(
      room,
      Effect.gen(function* () {
        const { p } = yield* relaySeat(room, userId);
        const team = yield* relayPlaying(room, p);
        if (team.proposal === null) return yield* new Conflict({ message: "There's no guess to reject." });
        team.proposal = null;
        yield* publish(room, { to: "all" });
      }),
    );
  });

  // --- The clock ---

  // What the clock does to a room, under the lock: students who ran out of time, rescues nobody answered, changed
  // standings. Returns what has to run after it lets go (closing and ending wait on answers).
  const sweep = (room: Room, now: number) =>
    Effect.gen(function* () {
      let closeIndex: number | null = null;
      let ends = false;
      let gone = false;
      if (room.pacing === "teacher" && room.phase === "question" && !room.closing && room.pausedAt === null && room.questionStartedAt !== null) {
        if (now >= room.questionStartedAt + room.seconds * 1000) closeIndex = room.index;
      }
      if (room.pacing === "student" && room.status === "running") {
        for (const p of room.players.values()) {
          if (p.finished || p.startedAt === null) continue;
          if (room.relay !== null) {
            const team = teamOf(room, p);
            if (!team || teamOver(room, team, now)) continue;
          }
          const q = paperOf(room, p)[p.index];
          if (!q || p.done.has(q.id) || now <= p.startedAt + room.seconds * 1000 + gameGraceMs) continue;
          p.done.set(q.id, { correct: false, earned: 0 });
          yield* storeAnswer(p, q, applyAnswer(room, p, q, null, room.seconds * 1000, true, null));
          yield* publish(room, aboutPlayer(room, p.userId));
        }
      }
      if (room.relay !== null && room.status === "running") {
        // A rescue nobody answered in time counts as wrong.
        for (const team of room.teams.values())
          for (const s of team.slots.values()) {
            if (s.rescuer === null || s.rescueCorrect !== null || s.scoring || s.rescueClaimedAt === null) continue;
            if (now <= s.rescueClaimedAt + room.seconds * 1000 + gameGraceMs) continue;
            s.rescueCorrect = false;
            room.relayVersion++;
            yield* repo.rescueTimedOut(team.id, s.questionId);
            yield* publish(room, { to: "all" });
          }
        // The round ended, or every team is done: the game is over.
        ends = relayAllOver(room);
      }
      if (room.pacing === "student" && room.boardDirty) {
        recomputeBoard(room);
        yield* publish(room, { to: "all" });
      } else if (room.presenterDirty) {
        yield* publish(room, { to: "presenter" });
      }
      room.presenterDirty = false;
      // The teacher ended it some other way (the session's End button).
      if (room.status !== "ended" && Math.floor(now / 500) % 20 === 0) {
        const status = yield* repo.sessionStatus(room.id);
        if (status === undefined) gone = true;
        else if (status === "ended") {
          room.status = "ended";
          room.phase = "ended";
          room.endedAt = now;
          recomputeBoard(room);
          yield* publish(room, { to: "all" });
        }
      }
      return { closeIndex, ends, gone };
    });

  // One beat of the clock for a room (twice a second): closes a question whose time is up, times out slow
  // players, ends a relay that is over, and sends the standings and answer counts that changed. A finished game
  // stays in memory for `keepEndedMs`, then `expired`; one whose session was deleted is `gone`.
  const tick = Effect.fn("Room.tick")(function* (room: Room, now: number, keepEndedMs: number) {
    if (room.phase === "ended") return room.endedAt !== null && now - room.endedAt > keepEndedMs ? ("expired" as Standing) : ("live" as Standing);
    const swept = yield* locked(room, sweep(room, now));
    // On their own fibers: waiting for answers in flight must not hold up the clocks of the other games.
    if (swept.closeIndex !== null)
      yield* close(room, swept.closeIndex).pipe(
        Effect.catchCause((cause) => Effect.logError("Closing the question failed", cause)),
        Effect.forkDetach,
      );
    if (swept.ends)
      yield* finish(room).pipe(
        Effect.catchCause((cause) => Effect.logError("Ending the relay failed", cause)),
        Effect.forkDetach,
      );
    return (swept.gone ? "gone" : "live") as Standing;
  });

  return {
    validate,
    canJoin,
    admit,
    answer,
    next,
    kick,
    allowRejoin,
    avatarChanged,
    openLobby,
    start,
    advance,
    pause,
    unpause,
    goTo,
    setSeconds,
    applySettings,
    end: finish,
    pickTeam,
    retry,
    claimRescue,
    rescue: rescueAnswer,
    submitPassword,
    confirmPassword,
    rejectPassword,
    assignTeam,
    dealTeams,
    levelTeams,
    addTeam,
    removeTeam,
    setStudentPick,
    tick,
  };
};
