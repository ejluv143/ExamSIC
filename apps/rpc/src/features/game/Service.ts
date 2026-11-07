// Game mode: Kahoot-style (teacher-paced) and Wayground-style (student-paced) live games, and Team Relay.
//
// The service decides who may do what (roster, removal, host) and builds the screens' streams. Every change to a
// room is a transition in Transitions.ts, which owns the room's lock and chooses who is told; screens build their
// view with Views.ts and never see more than their role allows.
import { Conflict, Forbidden, NotFound } from "@examinus/contract/errors";
import { type GalleryItem, type GameStanding, type GameStandings, type GameView } from "@examinus/contract/game";
import { assetIdsIn } from "@examinus/domain/asset";
import { type Avatar } from "@examinus/domain/avatar";
import { normalizeJoinKey } from "@examinus/domain/join-key";
import { guestsMayJoin, type AnswerValue, type SessionMode, type SessionStatus } from "@examinus/domain/quiz";
import { type SessionUser } from "@examinus/domain/user";
import { Context, Effect, Layer, Schedule, Stream } from "effect";
import { Assets } from "../assets/Service.ts";
import { authoredQuestions } from "../attempt/paper.ts";
import { AttemptService } from "../attempt/Service.ts";
import { avatarOf } from "../auth/avatar.ts";
import { LiveHub } from "../live/Service.ts";
import { LiveBus } from "../../platform/LiveBus.ts";
import { Cache } from "../../platform/Cache.ts";
import { Runner } from "../../platform/Runner.ts";
import { membersOf, promptOf, rankedTeams, unlockedPieces } from "./Engine.ts";
import { GameRepo } from "./Repo.ts";
import { channelOf, keepEndedMs, presenceEveryMs, presenceOf, presenceTtlMs, type Room, type Signal, type Viewer } from "./Room.ts";
import { RoomStore } from "./RoomStore.ts";
import { roomTransitions } from "./Transitions.ts";
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
      const bus = yield* LiveBus;
      const assets = yield* Assets;
      const cache = yield* Cache;
      const t = roomTransitions({
        repo,
        bus,
        attempts: yield* AttemptService,
        hub: yield* LiveHub,
        views,
        runner: yield* Runner,
      });

      const publish = (id: string, signal: Signal) => bus.publish(channelOf(id), signal);

      // --- The stream of a screen ---
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
                cache.touch(key, member, presenceTtlMs).pipe(Effect.andThen(publish(room.id, { to: "presenter" }))),
                () => cache.leave(key, member).pipe(Effect.andThen(publish(room.id, { to: "presenter" }))),
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

      // --- Joining ---

      const removed = new Conflict({ message: "You were removed from this session." });

      // The open session a join key opens.
      const lookup = Effect.fn("Game.lookup")(function* (code: string) {
        const key = normalizeJoinKey(code);
        if (key === null) return yield* new NotFound({ message: "A join key has 7 letters and numbers, like ABC-DEFG." });
        const open = yield* repo.openByKey(key);
        if (!open) return yield* new NotFound({ message: "That key doesn't match an open session." });
        return open;
      });

      const isRostered = (sessionId: string, userId: string) => repo.rosterState(sessionId, userId).pipe(Effect.map((s) => s === "on"));

      // The session a join key opens. A classless session puts the student on its roster (unless it is too late
      // to join); a class session only opens for the students on it, and for members of its class who weren't
      // on it yet (they joined the class after it was created). A guest only gets into sessions that allow guests.
      const find = Effect.fn("Game.find")(function* (user: SessionUser, code: string) {
        const userId = user.id;
        const session = yield* lookup(code);
        // A key only opens sessions of the organization the user is working in, or of their personal space when they
        // have none (a guest plays in the session's).
        if (user.role !== "guest" && session.organizationId !== (user.organization?.id ?? null))
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
        if (yield* t.canJoin(room, userId)) return;
        const profile = yield* repo.profile(userId);
        const { attempt, created } = yield* repo.ensureAttempt(sessionId, userId, room.pacing === "teacher" ? room.seed : null);
        yield* t.admit(room, { userId, attempt, created, profile });
      });

      const avatarChanged = Effect.fn("Game.avatarChanged")(function* (userId: string, avatar: Avatar) {
        for (const [, room] of yield* rooms.all) yield* t.avatarChanged(room, userId, avatar);
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
          questionCount: authoredQuestions(room.detail).length,
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
          const standing = yield* t.tick(room, now, keepEndedMs);
          if (standing !== "live") yield* rooms.drop(id);
        }
      }).pipe(Effect.catchCause((cause) => Effect.logError("Game tick failed", cause)));

      const resume = Effect.gen(function* () {
        const open = yield* repo.openGameIds();
        yield* Effect.forEach(open, (s) => rooms.get(s.id), { discard: true });
      }).pipe(Effect.catchCause((cause) => Effect.logError("Resuming games failed", cause)));

      // The room of a session, for a transition.
      const inRoom = <A, E>(sessionId: string, transition: (room: Room) => Effect.Effect<A, E>) =>
        Effect.flatMap(rooms.need(sessionId), transition);

      return Game.of({
        validate: t.validate,
        lookup: (code) =>
          Effect.map(lookup(code), (open) => ({ sessionId: open.id, title: open.title, guestsAllowed: guestsMayJoin(open) })),
        find,
        isRostered,
        join,
        answer: (userId, sessionId, questionId, value) => inRoom(sessionId, (room) => t.answer(room, userId, questionId, value)),
        next: (userId, sessionId) => inRoom(sessionId, (room) => t.next(room, userId)),
        openLobby: (sessionId) => inRoom(sessionId, t.openLobby),
        start: (sessionId) => inRoom(sessionId, t.start),
        advance: (sessionId) => inRoom(sessionId, t.advance),
        pause: (sessionId) => inRoom(sessionId, t.pause),
        unpause: (sessionId) => inRoom(sessionId, t.unpause),
        goTo: (sessionId, index) => inRoom(sessionId, (room) => t.goTo(room, index)),
        setSeconds: (sessionId, seconds) => inRoom(sessionId, (room) => t.setSeconds(room, seconds)),
        applySettings: (sessionId) =>
          Effect.flatMap(rooms.peek(sessionId), (room) => (room ? t.applySettings(room) : Effect.void)),
        end: (sessionId) => inRoom(sessionId, t.end),
        kick: (sessionId, attemptId) => inRoom(sessionId, (room) => t.kick(room, attemptId)),
        allowRejoin: (sessionId, userId) => inRoom(sessionId, (room) => t.allowRejoin(room, userId)),
        pickTeam: (userId, sessionId, teamId) => inRoom(sessionId, (room) => t.pickTeam(room, userId, teamId)),
        retry: (userId, sessionId) => inRoom(sessionId, (room) => t.retry(room, userId)),
        claimRescue: (userId, sessionId, questionId) => inRoom(sessionId, (room) => t.claimRescue(room, userId, questionId)),
        rescue: (userId, sessionId, questionId, value) => inRoom(sessionId, (room) => t.rescue(room, userId, questionId, value)),
        submitPassword: (userId, sessionId, guess) => inRoom(sessionId, (room) => t.submitPassword(room, userId, guess)),
        confirmPassword: (userId, sessionId) => inRoom(sessionId, (room) => t.confirmPassword(room, userId)),
        rejectPassword: (userId, sessionId) => inRoom(sessionId, (room) => t.rejectPassword(room, userId)),
        assignTeam: (sessionId, attemptId, teamId) => inRoom(sessionId, (room) => t.assignTeam(room, attemptId, teamId)),
        randomizeTeams: (sessionId) => inRoom(sessionId, t.dealTeams),
        balanceTeams: (sessionId) => inRoom(sessionId, t.levelTeams),
        addTeam: (sessionId) => inRoom(sessionId, t.addTeam),
        removeTeam: (sessionId, teamId) => inRoom(sessionId, (room) => t.removeTeam(room, teamId)),
        setStudentPick: (sessionId, allowed) => inRoom(sessionId, (room) => t.setStudentPick(room, allowed)),
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
