// Game mode: Kahoot-style (teacher-paced) and Wayground-style (student-paced) live games, and Team Relay.
//
// The service is the flow: it checks who may do what, changes the room (RoomStore.ts) under its lock using the rules
// in Engine.ts, writes the change through GameRepo, and tells the screens (a `Signal` on the game's bus), which
// build their view with Views.ts. Screens never see more than their role allows.
import { Conflict, Forbidden, NotFound } from "@examinus/contract/errors";
import { type GalleryItem, type GameStanding, type GameStandings, type GameView } from "@examinus/contract/game";
import { assetIdsIn } from "@examinus/domain/asset";
import { type Avatar } from "@examinus/domain/avatar";
import { gameAnswerPoints, gameGraceMs, gameQuestionProblems } from "@examinus/domain/game";
import { normalizeJoinKey } from "@examinus/domain/join-key";
import { kindOf } from "@examinus/domain/kinds";
import { type Question } from "@examinus/domain/question";
import { guestsMayJoin, relayLimits, type AnswerValue, type RelaySettings, type SessionMode, type SessionStatus } from "@examinus/domain/quiz";
import { normalizePassword, rescuePoints, balanceTeams, randomizeTeams } from "@examinus/domain/relay";
import { autoScore } from "@examinus/domain/scoring";
import { type SessionUser } from "@examinus/domain/user";
import { Context, Effect, Layer, Schedule, Stream } from "effect";
import { Assets } from "../assets/Service.ts";
import { attemptPaper, cleanAnswer, flatQuestions, isBlank } from "../attempt/rules.ts";
import { AttemptService } from "../attempt/Service.ts";
import { avatarOf } from "../auth/avatar.ts";
import { LiveHub } from "../live/Service.ts";
import { LiveBus } from "../../platform/LiveBus.ts";
import { Cache } from "../../platform/Cache.ts";
import { Runner } from "../../platform/Runner.ts";
import { checkAnswer } from "../../platform/checks.ts";
import {
  applyRelayStart,
  applyTeams,
  blankTeam,
  handOver,
  lobbyProblem,
  membership,
  memberRowsOf,
  membersOf,
  newTeamRows,
  nextIndex,
  paperOf,
  pickLateTeam,
  placeIn,
  planRelayStart,
  playingTeam,
  promptOf,
  rankedTeams,
  recomputeBoard,
  relayAllOver,
  releaseSlots,
  slotStateOf,
  scoreAnswer,
  tallyKeys,
  teamOf,
  teamOver,
  unlockedPieces,
} from "./Engine.ts";
import { GameRepo } from "./Repo.ts";
import {
  channelOf,
  checkWaitMs,
  guessGapMs,
  inflightPollMs,
  inflightWaitMs,
  keepEndedMs,
  presenceEveryMs,
  presenceOf,
  presenceTtlMs,
  type Player,
  type Room,
  type Signal,
  type Team,
  type Viewer,
} from "./Room.ts";
import { RoomStore } from "./RoomStore.ts";
import { GameViews } from "./Views.ts";

const noGame = new NotFound({ message: "That game doesn't exist." });

export class Game extends Context.Service<
  Game,
  {
    // Fails with Conflict listing what stops this quiz from being a game with this pacing.
    readonly validate: (quizId: string, pacing: "teacher" | "student", relay?: boolean) => Effect.Effect<void, Conflict>;
    // The open session a join key opens, or NotFound. `guestsAllowed`: a guest may take it (a game, quiz or exam
    // without a class whose teacher allowed guests).
    readonly lookup: (code: string) => Effect.Effect<{ sessionId: string; title: string; guestsAllowed: boolean }, NotFound>;
    readonly find: (user: SessionUser, code: string) => Effect.Effect<
      { sessionId: string; title: string; mode: SessionMode; pacing: "teacher" | "student"; status: SessionStatus },
      NotFound | Conflict
    >;
    readonly isRostered: (sessionId: string, userId: string) => Effect.Effect<boolean>;
    readonly join: (userId: string, sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly answer: (userId: string, sessionId: string, questionId: string, value: AnswerValue) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly next: (userId: string, sessionId: string) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly openLobby: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly start: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly advance: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly pause: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly unpause: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly goTo: (sessionId: string, index: number) => Effect.Effect<void, NotFound | Conflict>;
    readonly setSeconds: (sessionId: string, seconds: number) => Effect.Effect<void, NotFound | Conflict>;
    readonly applySettings: (sessionId: string) => Effect.Effect<void>;
    readonly end: (sessionId: string) => Effect.Effect<void, NotFound>;
    readonly kick: (sessionId: string, attemptId: string) => Effect.Effect<void, NotFound>;
    readonly allowRejoin: (sessionId: string, userId: string) => Effect.Effect<void, NotFound>;
    // --- Team Relay: players ---
    readonly pickTeam: (userId: string, sessionId: string, teamId: string) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly retry: (userId: string, sessionId: string) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly claimRescue: (userId: string, sessionId: string, questionId: string) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly rescue: (userId: string, sessionId: string, questionId: string, value: AnswerValue) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly submitPassword: (userId: string, sessionId: string, guess: string) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly confirmPassword: (userId: string, sessionId: string) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    readonly rejectPassword: (userId: string, sessionId: string) => Effect.Effect<void, Forbidden | NotFound | Conflict>;
    // --- Team Relay: the teacher, in the lobby ---
    readonly assignTeam: (sessionId: string, attemptId: string, teamId: string | null) => Effect.Effect<void, NotFound | Conflict>;
    readonly randomizeTeams: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly balanceTeams: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly addTeam: (sessionId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly removeTeam: (sessionId: string, teamId: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly setStudentPick: (sessionId: string, allowed: boolean) => Effect.Effect<void, NotFound | Conflict>;
    // A player saved a new avatar: the games they're in show it.
    readonly avatarChanged: (userId: string, avatar: Avatar) => Effect.Effect<void>;
    readonly standings: (sessionId: string, userId: string | null) => Effect.Effect<GameStandings, NotFound>;
    readonly gallery: (
      sessionId: string,
      questionId: string,
      teacher: SessionUser,
    ) => Effect.Effect<{ items: GalleryItem[]; assetUrls: Record<string, string> }, NotFound>;
    readonly stream: (sessionId: string, viewer: Viewer) => Stream.Stream<GameView>;
    // Background job (twice a second): closes questions whose time is up, times out slow players, and sends the
    // standings and the answer counts that changed.
    readonly tick: Effect.Effect<void>;
    // Loads the games that were running when the API stopped.
    readonly resume: Effect.Effect<void>;
  }
>()("examinus/api/Game") {
  static readonly layer = Layer.effect(
    Game,
    Effect.gen(function* () {
      const repo = yield* GameRepo;
      const rooms = yield* RoomStore;
      const views = yield* GameViews;
      const attemptService = yield* AttemptService;
      const bus = yield* LiveBus;
      const runner = yield* Runner;
      const assets = yield* Assets;
      const hub = yield* LiveHub;
      const cache = yield* Cache;

      const publish = (room: Room, signal: Signal) => bus.publish(channelOf(room.id), signal);

      // --- The stream of a screen ---

      const stream = (sessionId: string, viewer: Viewer): Stream.Stream<GameView> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const room = yield* rooms.get(sessionId);
            if (!room) return Stream.empty;
            // Subscribe before the first view is built, so nothing in between is lost.
            const signals = yield* bus.subscribe<Signal>(channelOf(room.id));
            // A player's screen counts as online for as long as its stream runs (the same scope as the subscription):
            // a presence entry per screen, refreshed while it is open and removed when it closes.
            if (viewer.kind === "player") {
              const member = `${viewer.userId}:${crypto.randomUUID()}`;
              const key = presenceOf(room.id);
              yield* Effect.acquireRelease(
                cache.touch(key, member, presenceTtlMs).pipe(Effect.andThen(publish(room, { to: "presenter" }))),
                () => cache.leave(key, member).pipe(Effect.andThen(publish(room, { to: "presenter" }))),
              );
              yield* cache.touch(key, member, presenceTtlMs).pipe(
                Effect.repeat(Schedule.spaced(`${presenceEveryMs} millis`)),
                Effect.forkScoped,
              );
            }
            let lastSent = "";
            const relevant = (s: Signal) =>
              s.to === "all" || (viewer.kind === "presenter" ? s.to === "presenter" : s.to === "user" && s.userId === viewer.userId);
            // A view is the whole screen, so signals that piled up while one was being built need only one more:
            // each batch the subscription hands over becomes at most one view.
            return Stream.concat(Stream.make<Signal[]>({ to: "all" }), signals).pipe(
              Stream.chunks,
              Stream.filter((batch) => batch.some(relevant)),
              Stream.mapEffect(() =>
                views.view(room, viewer).pipe(
                  Effect.map((view): GameView | null => {
                    const key = JSON.stringify({ ...view, serverNow: "" });
                    if (key === lastSent) return null;
                    lastSent = key;
                    return view;
                  }),
                ),
              ),
              Stream.filter((v): v is GameView => v !== null),
            );
          }).pipe(Effect.catchCause((cause) => Effect.logError("Game stream failed", cause).pipe(Effect.as(Stream.empty)))),
        );

      // --- Teacher-paced flow ---

      const persistPosition = (room: Room) =>
        repo.persistPosition(room.id, {
          phase: room.phase,
          index: room.index,
          questionStartedAt: room.questionStartedAt,
          pausedAt: room.pausedAt,
        });

      const openQuestion = Effect.fn("Game.openQuestion")(function* (room: Room, index: number) {
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
      const closeQuestion = (room: Room, index: number) =>
        room.lock.withPermits(1)(
          Effect.gen(function* () {
            if (room.phase !== "question" || room.index !== index || room.closing) return;
            room.closing = true;
            const q = room.questions[index]!;
            // Answers already on their way finish first, so none is left out of the split. Code and SQL are checked
            // by a runner or grader, which takes a while: the presenter sees "Checking answers…" meanwhile.
            // An answer that finishes after this wait still stores its score (settle) but earns no game points.
            const limit = kindOf(q).checker === undefined ? inflightWaitMs : checkWaitMs;
            if (room.inflight > 0 && limit === checkWaitMs) yield* publish(room, { to: "all" });
            for (let waited = 0; room.inflight > 0 && waited < limit; waited += inflightPollMs) yield* Effect.sleep(`${inflightPollMs} millis`);
            const missed = [...room.players.values()].filter((p) => !room.answeredNow.has(p.attemptId));
            const breaksStreak = missed.filter((p) => q.gamePoints !== "none" && !kindOf(q).gameUnscored && p.streak > 0);
            for (const p of missed) room.lastResult.set(p.attemptId, { correct: false, answered: false, earned: 0 });
            for (const p of breaksStreak) p.streak = 0;
            room.phase = "reveal";
            room.pausedAt = null;
            room.closing = false;
            recomputeBoard(room);
            // The reveal shows at once; the database catches up behind it (see openQuestion).
            yield* publish(room, { to: "all" });
            if (breaksStreak.length > 0) yield* repo.resetStreaks(breaksStreak.map((p) => p.attemptId));
            yield* persistPosition(room);
          }),
        );

      // Submits every attempt still open, so the normal results (score, grading queue, class record) exist.
      const gradeAll = Effect.fn("Game.gradeAll")(
        function* (room: Room) {
          const open = yield* repo.openAttempts(room.id);
          yield* Effect.forEach(open, (a) => attemptService.submit({ attemptId: a.id, auto: false }), { concurrency: 6, discard: true });
          yield* hub.sessionChanged(room.id);
        },
        Effect.catchCause((cause) => Effect.logError("Grading the game failed", cause)),
      );

      const finish = (room: Room) =>
        room.lock.withPermits(1)(
          Effect.gen(function* () {
            if (room.phase === "ended" && room.status === "ended") return;
            // A question in flight stops here; what was answered stays.
            for (let waited = 0; room.inflight > 0 && waited < 100; waited++) yield* Effect.sleep("20 millis");
            room.phase = "ended";
            room.status = "ended";
            room.endedAt = Date.now();
            recomputeBoard(room);
            yield* repo.markEnded(room.id, room.endedAt);
            yield* publish(room, { to: "all" });
            // Grading takes a while with a big room: the screens already show the podium.
            yield* gradeAll(room).pipe(Effect.forkDetach);
          }),
        );

      // --- Answers ---

      // Checks one code or SQL answer against the question's tests. null: nothing could check it.
      const check = (q: Question, value: AnswerValue) => checkAnswer(runner, q, value, isBlank(value));

      // Scores and stores one answer (or, with `value` null and `timedOut`, a question that ran out of time).
      const settle = Effect.fn("Game.settle")(function* (
        room: Room,
        p: Player,
        q: Question,
        value: AnswerValue,
        elapsedMs: number,
        timedOut: boolean,
      ) {
        const results = timedOut ? null : yield* check(q, value);
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
          room.lastResult.set(p.attemptId, { correct, answered: true, earned });
          for (const key of tallyKeys(q, value, fraction)) room.tally.set(key, (room.tally.get(key) ?? 0) + 1);
        }
        yield* repo.storeAnswer(
          p.attemptId,
          q.id,
          {
            value: timedOut ? null : value,
            correct,
            autoScore: fraction,
            timeMs: timedOut ? null : Math.round(elapsedMs),
            gamePointsEarned: earned,
          },
          p.points,
          p.streak,
        );
        room.boardDirty = true;
        room.relayVersion++;
      });

      const answer = Effect.fn("Game.answer")(function* (userId: string, sessionId: string, questionId: string, value: AnswerValue) {
        const room = yield* rooms.need(sessionId);
        const p = room.byUser.get(userId);
        if (!p) return yield* new Forbidden({ message: "Join the game first." });
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
        // Reserve the answer at once, so a double tap can't count twice.
        if (room.pacing === "teacher") room.answeredNow.add(p.attemptId);
        else p.done.set(q.id, { correct: null, earned: 0 });
        room.inflight++;
        const question = q;
        yield* Effect.gen(function* () {
          const cleaned =
            kindOf(question).answerPictures ? yield* repo.ownPictures(userId, cleanAnswer(question, value)) : cleanAnswer(question, value);
          yield* settle(room, p, question, cleaned, now - openedAt, false);
        }).pipe(Effect.ensuring(Effect.sync(() => void room.inflight--)));
        if (room.pacing === "teacher") room.presenterDirty = true;
        // The player's screen locks ("Answer locked in"); teacher-paced, the result waits for the clock.
        yield* publish(room, room.relay !== null ? { to: "all" } : { to: "user", userId });
      });

      const next = Effect.fn("Game.next")(function* (userId: string, sessionId: string) {
        const room = yield* rooms.need(sessionId);
        if (room.pacing !== "student") return yield* new Conflict({ message: "The teacher moves this game along." });
        const p = room.byUser.get(userId);
        if (!p) return yield* new Forbidden({ message: "Join the game first." });
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
            yield* attemptService.submit({ attemptId: p.attemptId, auto: false }).pipe(Effect.forkDetach);
            yield* publish(room, room.relay !== null ? { to: "all" } : { to: "user", userId });
            return;
          }
          p.index++;
        }
        p.startedAt = now;
        yield* repo.setQuestion(p.attemptId, p.index, now);
        yield* publish(room, room.relay !== null ? { to: "all" } : { to: "user", userId });
      });

      // --- Joining ---

      const isRostered = (sessionId: string, userId: string) => repo.rosterState(sessionId, userId).pipe(Effect.map((s) => s === "on"));

      const removed = new Conflict({ message: "You were removed from this session." });

      // The open session a join key opens.
      const lookup = Effect.fn("Game.lookup")(function* (code: string) {
        const key = normalizeJoinKey(code);
        if (key === null) return yield* new NotFound({ message: "A join key has 7 letters and numbers, like ABC-DEFG." });
        const open = yield* repo.openByKey(key);
        if (!open) return yield* new NotFound({ message: "That key doesn't match an open session." });
        return open;
      });

      // The session a join key opens. A classless session puts the student on its roster (unless it is too late
      // to join); a class session only opens for the students on it, and for members of its class who weren't
      // on it yet (they joined the class after it was created). A guest only gets into sessions that allow guests.
      const find = Effect.fn("Game.find")(function* (user: SessionUser, code: string) {
        const userId = user.id;
        const session = yield* lookup(code);
        // A key only opens sessions of the organization the user is working in (a guest plays in the session's).
        if (user.role !== "guest" && session.organizationId !== user.organization?.id)
          return yield* new NotFound({ message: "That key doesn't match an open session." });
        if (user.role === "guest" && !guestsMayJoin(session))
          return yield* new NotFound({ message: "That key doesn't match a session that guests can join." });
        const state = yield* repo.rosterState(session.id, userId);
        if (state === "removed") return yield* removed;
        // Teachers see students by roster entry (`students`), which an account gets when it first joins a class
        // (a guest gets theirs here, in the organization of the game).
        let onRoster = yield* repo.rosterEntry(userId, session.organizationId);
        if (!onRoster && user.role === "guest") {
          yield* repo.addRosterEntry({ organizationId: session.organizationId, userId, firstName: user.name, email: user.email });
          onRoster = yield* repo.rosterEntry(userId, session.organizationId);
        }
        if (session.classId === null) {
          if (!onRoster)
            return yield* new Conflict({ message: "Join one of your classes first (Classes, then Join with a code), so your teacher knows who you are." });
          const late = session.lateJoinMinutes;
          if (late !== null && session.startedAt !== null && Date.now() > session.startedAt + late * 60_000)
            return yield* new Conflict({ message: `It's too late to join: students could join in the first ${late} minutes.` });
          if (state === "none") yield* repo.addToRoster(session.id, userId);
        } else if (state === "none") {
          const member = onRoster ? yield* repo.isClassMember(session.classId, onRoster.id) : false;
          if (!member) return yield* new NotFound({ message: "That key doesn't match a session you're on the roster of." });
          yield* repo.addToRoster(session.id, userId);
        }
        return { sessionId: session.id, title: session.title, mode: session.mode, pacing: session.pacing, status: session.status };
      });

      const join = Effect.fn("Game.join")(function* (userId: string, sessionId: string) {
        const state = yield* repo.rosterState(sessionId, userId);
        if (state === "removed") return yield* removed;
        if (state === "none") return yield* new NotFound({ message: "That game doesn't exist." });
        const room = yield* rooms.need(sessionId);
        if (room.byUser.has(userId)) return;
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
        const user = yield* repo.profile(userId);
        const { attempt, created } = yield* repo.ensureAttempt(sessionId, userId, room.pacing === "teacher" ? room.seed : null);
        // Two requests can join the same student at once: the first to set the player wins.
        if (room.byUser.has(userId)) return;
        const p: Player = {
          attemptId: attempt.id,
          userId,
          name: user?.name ?? "Player",
          avatar: avatarOf(userId, user?.avatar ?? null),
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
        if (room.relay !== null && room.status === "running") return yield* lateJoin(room, p, created);
        room.players.set(p.attemptId, p);
        room.byUser.set(userId, p);
        room.presenterDirty = true;
        room.boardDirty = true;
        yield* publish(room, { to: "user", userId });
      });

      const kick = Effect.fn("Game.kick")(function* (sessionId: string, attemptId: string) {
        const room = yield* rooms.need(sessionId);
        const remove = Effect.gen(function* () {
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
          yield* repo.removePlayer(sessionId, attemptId, p.userId, updates);
          room.presenterDirty = true;
          room.boardDirty = true;
          yield* publish(room, room.relay !== null ? { to: "all" } : { to: "user", userId: p.userId });
        });
        // A relay's teams change under the room lock; a classic game is not held up by it.
        yield* room.relay !== null ? room.lock.withPermits(1)(remove) : remove;
      });

      const allowRejoin = Effect.fn("Game.allowRejoin")(function* (sessionId: string, userId: string) {
        const room = yield* rooms.need(sessionId);
        if (!room.removed.has(userId)) return yield* new NotFound({ message: "That player wasn't removed." });
        yield* repo.allowRejoin(sessionId, userId);
        room.removed.delete(userId);
        // The player's screen offers to join again.
        yield* publish(room, { to: "presenter" });
        yield* publish(room, { to: "user", userId });
      });

      const avatarChanged = Effect.fn("Game.avatarChanged")(function* (userId: string, avatar: Avatar) {
        for (const [, room] of yield* rooms.all) {
          const p = room.byUser.get(userId);
          if (!p) continue;
          p.avatar = avatar;
          // Only the picture changes: the standings stay as of the last closed question.
          room.board = room.board.map((row) => (row.attemptId === p.attemptId ? { ...row, avatar } : row));
          yield* publish(room, { to: "all" });
        }
      });

      // --- The teacher's controls ---

      const validate = Effect.fn("Game.validate")(function* (quizId: string, pacing: "teacher" | "student", relay = false) {
        const detail = yield* repo.quizDetail(quizId);
        if (!detail) return yield* new Conflict({ message: "That quiz doesn't exist." });
        const flat = flatQuestions(detail.parts);
        const problems = gameQuestionProblems(pacing, flat, relay);
        if (relay && flat.length < 2) problems.push("A Team Relay needs at least 2 questions.");
        if (problems.length > 0) return yield* new Conflict({ message: problems.join(" ") });
      });

      const openLobby = Effect.fn("Game.openLobby")(function* (sessionId: string) {
        const room = yield* rooms.need(sessionId);
        if (room.status === "ended") return yield* new Conflict({ message: "This game is over." });
        if (room.status !== "scheduled") return;
        yield* validate(room.detail.quiz.id, room.pacing, room.relay !== null);
        if (room.relay !== null && room.teams.size === 0) yield* makeTeams(room, room.relay.teamCount);
        room.status = "lobby";
        room.phase = "lobby";
        yield* repo.setLobby(sessionId);
        yield* publish(room, { to: "all" });
        yield* hub.sessionChanged(sessionId);
      });

      const start = Effect.fn("Game.start")(function* (sessionId: string) {
        const room = yield* rooms.need(sessionId);
        if (room.relay !== null) return yield* startRelay(room);
        if (room.status === "ended") return yield* new Conflict({ message: "This game is over." });
        if (room.status === "running" && (room.pacing === "student" || room.phase !== "lobby"))
          return yield* new Conflict({ message: "The game already started." });
        yield* validate(room.detail.quiz.id, room.pacing);
        if (room.players.size === 0) return yield* new Conflict({ message: "Wait for at least one player to join." });
        const now = new Date();
        room.status = "running";
        room.startedAt = now.getTime();
        yield* repo.setRunning(sessionId, now);
        if (room.pacing === "teacher") yield* room.lock.withPermits(1)(openQuestion(room, 0));
        else yield* publish(room, { to: "all" });
        yield* hub.sessionChanged(sessionId);
      });

      const advance = Effect.fn("Game.advance")(function* (sessionId: string) {
        const room = yield* rooms.need(sessionId);
        if (room.pacing !== "teacher") return yield* new Conflict({ message: "Players move through a student-paced game themselves." });
        const next = nextIndex(room);
        switch (room.phase) {
          case "question":
            return yield* closeQuestion(room, room.index);
          case "reveal": {
            if (next === null) return yield* finish(room);
            if (!room.leaderboard) return yield* room.lock.withPermits(1)(openQuestion(room, next));
            return yield* room.lock.withPermits(1)(
              Effect.gen(function* () {
                if (room.phase !== "reveal") return;
                room.phase = "leaderboard";
                yield* publish(room, { to: "all" });
                yield* persistPosition(room);
              }),
            );
          }
          case "leaderboard":
            return next === null ? yield* finish(room) : yield* room.lock.withPermits(1)(openQuestion(room, next));
          default:
            return yield* new Conflict({ message: "The game isn't running." });
        }
      });

      const openTeacherPaced = Effect.fn("Game.openTeacherPaced")(function* (sessionId: string) {
        const room = yield* rooms.need(sessionId);
        if (room.pacing !== "teacher") return yield* new Conflict({ message: "Only a teacher-paced game has a clock the teacher controls." });
        if (room.status !== "running" || room.phase === "ended") return yield* new Conflict({ message: "The game isn't running." });
        return room;
      });

      const pause = Effect.fn("Game.pause")(function* (sessionId: string) {
        const room = yield* openTeacherPaced(sessionId);
        if (room.phase !== "question") return yield* new Conflict({ message: "There's no question open to pause." });
        if (room.pausedAt !== null) return yield* new Conflict({ message: "The game is already paused." });
        room.pausedAt = Date.now();
        yield* publish(room, { to: "all" });
        yield* persistPosition(room);
      });

      const unpause = Effect.fn("Game.unpause")(function* (sessionId: string) {
        const room = yield* openTeacherPaced(sessionId);
        if (room.pausedAt === null) return yield* new Conflict({ message: "The game isn't paused." });
        // The question keeps the time it had left: its start moves on by the time paused.
        if (room.questionStartedAt !== null) room.questionStartedAt += Date.now() - room.pausedAt;
        room.pausedAt = null;
        yield* publish(room, { to: "all" });
        yield* persistPosition(room);
      });

      const goTo = Effect.fn("Game.goTo")(function* (sessionId: string, index: number) {
        const room = yield* openTeacherPaced(sessionId);
        if (room.phase === "question") return yield* new Conflict({ message: "Close the open question first." });
        if (!Number.isInteger(index) || index < 0 || index >= room.questions.length)
          return yield* new Conflict({ message: "There's no such question." });
        if (room.played.has(index)) return yield* new Conflict({ message: "That question was already played." });
        yield* room.lock.withPermits(1)(openQuestion(room, index));
      });

      // Applies a new question length to the room (an open question keeps its start and closes at once if the new
      // length has already passed), and tells every screen.
      const applySeconds = Effect.fn("Game.applySeconds")(function* (room: Room, seconds: number) {
        room.seconds = seconds;
        const clock = room.pausedAt ?? Date.now();
        if (room.phase === "question" && room.pausedAt === null && room.questionStartedAt !== null && clock >= room.questionStartedAt + seconds * 1000)
          return yield* closeQuestion(room, room.index);
        yield* publish(room, { to: "all" });
      });

      const setSeconds = Effect.fn("Game.setSeconds")(function* (sessionId: string, seconds: number) {
        const room = yield* openTeacherPaced(sessionId);
        yield* repo.setSeconds(room.id, seconds);
        yield* applySeconds(room, seconds);
      });

      // The session's settings were edited (session.update): the room takes the ones a game reads while it runs.
      const applySettings = Effect.fn("Game.applySettings")(function* (sessionId: string) {
        const room = yield* rooms.peek(sessionId);
        if (!room) return;
        const row = yield* repo.settings(sessionId);
        if (!row) return;
        room.leaderboard = row.leaderboard;
        room.streakBonus = row.streakBonus;
        room.lateJoinMinutes = row.lateJoinMinutes;
        // The relay settings only change before the game starts (a started game refuses the edit).
        if (room.startedAt === null && room.status !== "ended") {
          room.relay = row.relay;
          room.relayPassword = row.relayPassword;
          room.relayClues = row.relayClues;
          room.questions = flatQuestions(row.relay ? room.detail.parts : attemptPaper(room.detail, room.seed));
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
        yield* applySeconds(room, row.seconds);
      });

      const end = Effect.fn("Game.end")(function* (sessionId: string) {
        const room = yield* rooms.need(sessionId);
        yield* finish(room);
      });

      // --- Team Relay: the lobby ---

      const makeTeams = Effect.fn("Game.makeTeams")(function* (room: Room, count: number) {
        const rows = newTeamRows(room, count);
        if (rows.length === 0) return;
        const created = yield* repo.insertTeams(rows);
        for (const t of created) room.teams.set(t.id, blankTeam(t));
      });

      // Writes the teams of the given players to the database.
      const saveMembers = (room: Room, attemptIds: string[]) => repo.saveMembers(attemptIds, memberRowsOf(room, attemptIds));

      const lobbyCheck = (room: Room): Effect.Effect<RelaySettings, Conflict> =>
        Effect.suspend(() => {
          const problem = lobbyProblem(room);
          return problem === null ? Effect.succeed(room.relay!) : Effect.fail(new Conflict({ message: problem }));
        });

      // Runs a lobby change under the room lock, refusing it outside the lobby of a relay.
      const inLobby = Effect.fn("Game.inLobby")(function* <A, E>(
        sessionId: string,
        body: (room: Room, relay: RelaySettings) => Effect.Effect<A, E>,
      ) {
        const room = yield* rooms.need(sessionId);
        return yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
            const relay = yield* lobbyCheck(room);
            return yield* body(room, relay);
          }),
        );
      });

      const assignTeam = Effect.fn("Game.assignTeam")(function* (sessionId: string, attemptId: string, teamId: string | null) {
        return yield* inLobby(sessionId, (room, relay) =>
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

      const dealTeams = Effect.fn("Game.dealTeams")(function* (sessionId: string) {
        return yield* inLobby(sessionId, (room, relay) =>
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

      const levelTeams = Effect.fn("Game.levelTeams")(function* (sessionId: string) {
        return yield* inLobby(sessionId, (room, relay) =>
          Effect.gen(function* () {
            const unassigned = [...room.players.values()].filter((p) => p.teamId === null).map((p) => p.attemptId);
            const level = balanceTeams(membership(room), unassigned, relay.teamSize);
            applyTeams(room, level.teams);
            yield* saveMembers(room, [...room.players.keys()]);
            yield* publish(room, { to: "all" });
          }),
        );
      });

      const addTeam = Effect.fn("Game.addTeam")(function* (sessionId: string) {
        return yield* inLobby(sessionId, (room) =>
          Effect.gen(function* () {
            if (room.teams.size >= relayLimits.teamCount.maximum)
              return yield* new Conflict({ message: `A relay has at most ${relayLimits.teamCount.maximum} teams.` });
            yield* makeTeams(room, 1);
            yield* publish(room, { to: "all" });
          }),
        );
      });

      const removeTeam = Effect.fn("Game.removeTeam")(function* (sessionId: string, teamId: string) {
        return yield* inLobby(sessionId, (room) =>
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

      const setStudentPick = Effect.fn("Game.setStudentPick")(function* (sessionId: string, allowed: boolean) {
        return yield* inLobby(sessionId, (room, relay) =>
          Effect.gen(function* () {
            const changed = { ...relay, studentPick: allowed };
            yield* repo.setRelay(room.id, changed);
            room.relay = changed;
            yield* publish(room, { to: "all" });
          }),
        );
      });

      // A student takes (or switches to) a team of their own choice, when the teacher allows it.
      const pickTeam = Effect.fn("Game.pickTeam")(function* (userId: string, sessionId: string, teamId: string) {
        const room = yield* rooms.need(sessionId);
        const p = room.byUser.get(userId);
        if (!p) return yield* new Forbidden({ message: "Join the game first." });
        yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
            const relay = yield* lobbyCheck(room);
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

      // --- Team Relay: the start ---

      const startRelay = Effect.fn("Game.startRelay")(function* (room: Room) {
        yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
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
          }),
        );
        yield* hub.sessionChanged(room.id);
      });

      // --- Team Relay: players arriving and leaving ---

      const lateJoin = Effect.fn("Game.lateJoin")(function* (room: Room, p: Player, created: boolean) {
        yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
            if (room.byUser.has(p.userId)) return;
            const team = pickLateTeam(room);
            if (team === null) {
              if (created) yield* repo.deleteAttempt(p.attemptId);
              return yield* new Conflict({ message: "Every team is full." });
            }
            room.players.set(p.attemptId, p);
            room.byUser.set(p.userId, p);
            const updates = handOver(room, team, p);
            yield* repo.joinTeam(p.attemptId, team.id, updates);
            room.presenterDirty = true;
            room.boardDirty = true;
            room.relayVersion++;
            yield* publish(room, { to: "all" });
          }),
        );
      });

      // --- Team Relay: playing ---

      const relayPlayer = Effect.fn("Game.relayPlayer")(function* (userId: string, sessionId: string) {
        const room = yield* rooms.need(sessionId);
        if (room.relay === null) return yield* new Conflict({ message: "This isn't a Team Relay game." });
        const p = room.byUser.get(userId);
        if (!p) return yield* new Forbidden({ message: "Join the game first." });
        return { room, relay: room.relay, p };
      });

      // The player's team while its round is on.
      const relayPlaying = (room: Room, p: Player): Effect.Effect<Team, Conflict> =>
        Effect.suspend(() => {
          const playing = playingTeam(room, p);
          return "problem" in playing ? Effect.fail(new Conflict({ message: playing.problem })) : Effect.succeed(playing.team);
        });

      // Another try at the question on screen after a wrong answer.
      const retry = Effect.fn("Game.retry")(function* (userId: string, sessionId: string) {
        const { room, relay, p } = yield* relayPlayer(userId, sessionId);
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
      });

      // A player who finished their own questions takes a teammate's locked one (the first to ask gets it).
      const claimRescue = Effect.fn("Game.claimRescue")(function* (userId: string, sessionId: string, questionId: string) {
        const { room, relay, p } = yield* relayPlayer(userId, sessionId);
        if (!relay.rescue) return yield* new Conflict({ message: "Rescues are off in this game." });
        yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
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
      // the owner's answer or grade.
      const rescueAnswer = Effect.fn("Game.rescue")(function* (userId: string, sessionId: string, questionId: string, value: AnswerValue) {
        const { room, relay, p } = yield* relayPlayer(userId, sessionId);
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
        yield* Effect.gen(function* () {
          const cleaned = cleanAnswer(q, value);
          const results = yield* check(q, cleaned);
          const fraction = autoScore(q, cleaned, results);
          const earned = gameAnswerPoints({
            gamePoints: q.gamePoints,
            fraction,
            elapsedMs: now - claimedAt,
            limitMs: room.seconds * 1000,
            streak: 0,
            streakBonus: false,
          }).earned;
          const points = rescuePoints(earned, relay.rescuePoints);
          const correct = fraction === 1;
          yield* repo.scoreRescue(team.id, questionId, p.attemptId, cleaned, correct, points, p.points + points);
          slot.rescueCorrect = correct;
          p.points += points;
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              slot.scoring = false;
              room.inflight--;
            }),
          ),
        );
        room.boardDirty = true;
        room.relayVersion++;
        yield* publish(room, { to: "all" });
      });

      // --- Team Relay: the password ---

      // Checks a guess for the team (the room lock is held). Right: the team solved it. Wrong: one guess less.
      const checkGuess = Effect.fn("Game.checkGuess")(function* (room: Room, team: Team, by: Player, guess: string) {
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

      // After a result that may end the game (the room lock is not held).
      const endIfAllOver = (room: Room) => (relayAllOver(room) ? finish(room) : Effect.void);

      const submitPassword = Effect.fn("Game.submitPassword")(function* (userId: string, sessionId: string, guess: string) {
        const { room, relay, p } = yield* relayPlayer(userId, sessionId);
        yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
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

      const confirmPassword = Effect.fn("Game.confirmPassword")(function* (userId: string, sessionId: string) {
        const { room, p } = yield* relayPlayer(userId, sessionId);
        yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
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

      const rejectPassword = Effect.fn("Game.rejectPassword")(function* (userId: string, sessionId: string) {
        const { room, p } = yield* relayPlayer(userId, sessionId);
        yield* room.lock.withPermits(1)(
          Effect.gen(function* () {
            const team = yield* relayPlaying(room, p);
            if (team.proposal === null) return yield* new Conflict({ message: "There's no guess to reject." });
            team.proposal = null;
            yield* publish(room, { to: "all" });
          }),
        );
      });

      // --- Results ---

      const standings = Effect.fn("Game.standings")(function* (sessionId: string, userId: string | null) {
        const head = yield* repo.head(sessionId);
        if (!head || head.session.mode !== "game") return yield* noGame;
        const rows = yield* repo.standingRows(sessionId);
        const stats = yield* repo.answerStats(sessionId);
        const room = yield* rooms.need(sessionId);
        const byAttempt = new Map(stats.map((s) => [s.attemptId, s]));
        // Team Relay: each player's team, and the teammates' questions they rescued.
        const teamNames = new Map<string, string>();
        const rescues = new Map<string, number>();
        for (const team of room.teams.values()) {
          for (const id of team.members) teamNames.set(id, team.name);
          for (const s of team.slots.values())
            if (s.rescuer !== null && s.rescueCorrect === true) rescues.set(s.rescuer, (rescues.get(s.rescuer) ?? 0) + 1);
        }
        const sorted = [...rows].sort((a, b) => b.attempt.points - a.attempt.points || a.name.localeCompare(b.name));
        let rank = 0;
        let previous = -1;
        const list: GameStanding[] = sorted.map((r, i) => {
          if (r.attempt.points !== previous) {
            rank = i + 1;
            previous = r.attempt.points;
          }
          const s = byAttempt.get(r.attempt.id);
          return {
            rank,
            attemptId: r.attempt.id,
            studentId: r.studentId,
            name: r.name,
            avatar: avatarOf(r.attempt.studentId, r.avatar),
            points: r.attempt.points,
            correct: s?.correct ?? 0,
            answered: s?.answered ?? 0,
            averageMs: s?.averageMs ?? null,
            team: teamNames.get(r.attempt.id) ?? null,
            rescues: rescues.get(r.attempt.id) ?? 0,
          };
        });
        const mine = userId === null ? null : (rows.find((r) => r.attempt.studentId === userId)?.attempt.id ?? null);
        const relay = room.relay !== null;
        // The questions most often answered wrong (a timeout counts as wrong).
        const misses = relay ? yield* repo.misses(sessionId) : [];
        return {
          title: head.quiz.title,
          questionCount: flatQuestions(room.detail.parts).length,
          ended: head.session.status === "ended",
          standings: list,
          myAttemptId: mine,
          teams: relay
            ? rankedTeams(room)
                .filter(({ team }) => team.members.length > 0)
                .map(({ team, points, rank }) => ({
                  rank,
                  name: team.name,
                  members: membersOf(room, team).map((m) => m.name),
                  points,
                  solvedMs: team.solvedAt === null || room.startedAt === null ? null : team.solvedAt - room.startedAt,
                  wrongGuesses: team.wrongGuesses,
                  unlocked: unlockedPieces(room, team),
                  pieces: team.pieces.length,
                  password: team.password ?? "",
                }))
            : [],
          missed: misses
            .filter((m) => m.wrong > 0 && room.byId.has(m.questionId))
            .sort((a, b) => b.wrong - a.wrong)
            .slice(0, 10)
            .map((m) => ({ questionId: m.questionId, prompt: promptOf(room.byId.get(m.questionId)!), wrong: m.wrong, answered: m.answered })),
        } satisfies GameStandings;
      });

      const gallery = Effect.fn("Game.gallery")(function* (sessionId: string, questionId: string, teacher: SessionUser) {
        const rows = yield* repo.gallery(sessionId, questionId);
        const items: GalleryItem[] = rows.map((r) => ({ attemptId: r.attemptId, name: r.name, value: r.value }));
        const ids = assetIdsIn(JSON.stringify(items.map((i) => i.value)));
        const visible = yield* assets.visible(teacher, ids);
        const assetUrls = yield* assets.sign(visible).pipe(Effect.catch(() => Effect.succeed({} as Record<string, string>)));
        return { items, assetUrls };
      });

      // --- Background job ---

      const tick = Effect.gen(function* () {
        const now = Date.now();
        for (const [id, room] of yield* rooms.all) {
          if (room.phase === "ended") {
            if (room.endedAt !== null && now - room.endedAt > keepEndedMs) yield* rooms.drop(id);
            continue;
          }
          if (room.pacing === "teacher" && room.phase === "question" && !room.closing && room.pausedAt === null && room.questionStartedAt !== null) {
            // On its own fiber: waiting for answers in flight must not hold up the clocks of the other games.
            if (now >= room.questionStartedAt + room.seconds * 1000)
              yield* closeQuestion(room, room.index).pipe(
                Effect.catchCause((cause) => Effect.logError("Closing the question failed", cause)),
                Effect.forkDetach,
              );
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
              yield* settle(room, p, q, null, room.seconds * 1000, true);
              yield* publish(room, room.relay !== null ? { to: "all" } : { to: "user", userId: p.userId });
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
            if (relayAllOver(room))
              yield* finish(room).pipe(
                Effect.catchCause((cause) => Effect.logError("Ending the relay failed", cause)),
                Effect.forkDetach,
              );
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
            const status = yield* repo.sessionStatus(id);
            if (status === undefined) yield* rooms.drop(id);
            else if (status === "ended") {
              room.status = "ended";
              room.phase = "ended";
              room.endedAt = now;
              recomputeBoard(room);
              yield* publish(room, { to: "all" });
            }
          }
        }
      }).pipe(Effect.catchCause((cause) => Effect.logError("Game tick failed", cause)));

      const resume = Effect.gen(function* () {
        const open = yield* repo.openGameIds();
        yield* Effect.forEach(open, (s) => rooms.get(s.id), { discard: true });
      }).pipe(Effect.catchCause((cause) => Effect.logError("Resuming games failed", cause)));

      return Game.of({
        validate,
        lookup: (code) =>
          Effect.map(lookup(code), (open) => ({ sessionId: open.id, title: open.title, guestsAllowed: guestsMayJoin(open) })),
        find,
        isRostered,
        join,
        answer,
        next,
        openLobby,
        start,
        advance,
        pause,
        unpause,
        goTo,
        setSeconds,
        applySettings,
        end,
        kick,
        allowRejoin,
        pickTeam,
        retry,
        claimRescue,
        rescue: rescueAnswer,
        submitPassword,
        confirmPassword,
        rejectPassword,
        assignTeam,
        randomizeTeams: dealTeams,
        balanceTeams: levelTeams,
        addTeam,
        removeTeam,
        setStudentPick,
        avatarChanged,
        standings,
        gallery,
        stream,
        tick,
        resume,
      });
    }),
  );
}
