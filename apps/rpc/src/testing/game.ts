// An in-memory game world for the Game service tests: a fake GameRepo that keeps the session, roster and attempts
// in memory (and records what the service wrote), around the real RoomStore and Game services.
import type { Question } from "@examinus/domain/question";
import type { RelaySettings } from "@examinus/domain/quiz";
import type { SessionUser } from "@examinus/domain/user";
import { Effect, Layer } from "effect";
import type { AttemptItem, QuizSessionItem } from "../database/schemas/index.ts";
import { AttemptService } from "../features/attempt/Service.ts";
import { Assets } from "../features/assets/Service.ts";
import { Game } from "../features/game/Service.ts";
import { GameRepo, type OpenGame } from "../features/game/Repo.ts";
import { RoomStore } from "../features/game/RoomStore.ts";
import { GameViews } from "../features/game/Views.ts";
import { LiveHub } from "../features/live/Service.ts";
import { Cache } from "../platform/Cache.ts";
import { LiveBus } from "../platform/LiveBus.ts";
import { Runner } from "../platform/Runner.ts";
import { harness, stub } from "./config.ts";
import { memoryBus, memoryCache } from "./live.ts";
import { attemptRow, sessionRow } from "./rows.ts";
import { quizDetail, quizItem } from "./session-rows.ts";

// A true/false question worth a standard game question.
export const trueFalse = (id: string, answer: boolean): Question => ({
  id,
  prompt: `Question ${id}`,
  points: 1,
  gamePoints: "standard",
  partialCredit: false,
  type: "true_false",
  answer,
});

export const essay = (id: string): Question => ({
  id,
  prompt: `Essay ${id}`,
  points: 5,
  gamePoints: "standard",
  partialCredit: false,
  type: "essay",
  rubric: [],
});

// A user who works in `organizationId` (null for a guest, who has none).
export const user = (id: string, role: "student" | "guest" = "student", organizationId: string | null = "org1"): SessionUser => ({
  id,
  role: role === "guest" ? "guest" : "user",
  name: id,
  email: `${id}@x.ph`,
  department: null,
  plan: "free",
  organization:
    role === "guest" || organizationId === null
      ? null
      : { id: organizationId, name: "School", slug: "school", roles: ["student"], permissions: {} },
  memberships: [],
});

export const relaySettings = (over: Partial<RelaySettings> = {}): RelaySettings => ({
  teamSize: 2,
  teamCount: 2,
  studentPick: true,
  pieceKind: "letter",
  passwordAttempts: 5,
  solveBonus: 1000,
  roundMinutes: 10,
  requireConsensus: false,
  retry: false,
  retryLimit: 1,
  retryPenalty: 50,
  rescue: false,
  rescuePoints: 50,
  ...over,
});

export type GameOptions = {
  // The game's session row; mode is always "game" unless overridden.
  session?: Partial<QuizSessionItem>;
  questions?: Question[];
  // The open session a join key finds (undefined: no key matches).
  byKey?: OpenGame;
  // Students who already have a roster entry (an account that joined a class), and the roster entries that are
  // members of a class: "classId:rosterId".
  entries?: string[];
  classMembers?: string[];
  // Players already in the game when its room is first loaded.
  roster?: string[];
  attempts?: Partial<AttemptItem>[];
  // No such game at all.
  missing?: boolean;
};

// The attempts of the game that are still in progress are what `grading` submits when the game ends.
export const gameWorld = (options: GameOptions = {}) => {
  const detail = quizDetail(options.questions ?? [trueFalse("q1", true), trueFalse("q2", false)], quizItem());
  const session: { row: QuizSessionItem } = {
    row: sessionRow({ id: "g1", quizId: "quiz1", mode: "game", pacing: "teacher", status: "scheduled", ...options.session }),
  };
  const roster = new Map<string, "on" | "removed">((options.roster ?? []).map((id) => [id, "on"]));
  const entries = new Set(options.entries ?? []);
  const classMembers = new Set(options.classMembers ?? []);
  const attempts = new Map<string, AttemptItem>(
    (options.attempts ?? []).map((a, i) => {
      const row = attemptRow({ id: `a${i + 1}`, sessionId: "g1", ...a });
      return [row.id, row];
    }),
  );
  const log = {
    addedToRoster: [] as string[],
    // Roster entries made for guests: `userId@organizationId`.
    addedEntries: [] as string[],
    ensured: [] as Array<{ userId: string; seed: number | null }>,
    positions: [] as Array<{ phase: string | null; index: number; questionStartedAt: number | null; pausedAt: number | null }>,
    stored: [] as Array<{ attemptId: string; questionId: string; correct: boolean | null; earned: number; value: unknown; points: number; streak: number }>,
    resetStreaks: [] as string[][],
    removed: [] as Array<{ attemptId: string; userId: string }>,
    allowed: [] as string[],
    lobby: 0,
    running: 0,
    ended: [] as number[],
    seconds: [] as number[],
    questionsShown: [] as Array<{ attemptId: string; index: number }>,
    teamsInserted: [] as string[],
    deletedTeams: [] as string[],
    savedMembers: [] as Array<{ attemptIds: string[]; rows: Array<{ attemptId: string; teamId: string }> }>,
    startedRelay: [] as Array<{ empty: string[]; plans: Array<{ teamId: string; members: string[]; password: string }> }>,
    guesses: [] as Array<{ teamId: string; guess: string; correct: boolean }>,
    submitted: [] as string[],
    sessionChanged: 0,
  };
  const names = (id: string) => ({ name: `Name ${id}`, avatar: null });
  const at = new Date("2026-10-13T08:00:00.000Z");

  const repo = stub<GameRepo["Service"]>("GameRepo", {
    roomHead: () => Effect.succeed(options.missing ? undefined : { session: session.row, quiz: quizItem(), detail }),
    head: () => Effect.succeed(options.missing ? undefined : { session: session.row, quiz: quizItem() }),
    players: () => Effect.succeed([...attempts.values()].map((attempt) => ({ attempt, ...names(attempt.studentId) }))),
    scored: () => Effect.succeed([]),
    removedPlayers: () =>
      Effect.succeed([...roster].filter(([, s]) => s === "removed").map(([userId]) => ({ userId, ...names(userId) }))),
    questionAnswers: () => Effect.succeed([]),
    teams: () => Effect.succeed(null),
    openGameIds: () => Effect.succeed(session.row.status === "lobby" || session.row.status === "running" ? [{ id: "g1" }] : []),
    sessionStatus: () => Effect.succeed(session.row.status),

    rosterState: (_sessionId, userId) => Effect.succeed(roster.get(userId) ?? "none"),
    openByKey: () => Effect.succeed(options.byKey),
    rosterEntry: (userId) => Effect.succeed(entries.has(userId) ? { id: `r-${userId}` } : undefined),
    addRosterEntry: ({ userId, organizationId }) => Effect.sync(() => void (log.addedEntries.push(`${userId}@${organizationId}`), entries.add(userId))),
    isClassMember: (classId, rosterId) => Effect.succeed(classMembers.has(`${classId}:${rosterId}`)),
    addToRoster: (_sessionId, userId) => Effect.sync(() => void (log.addedToRoster.push(userId), roster.set(userId, "on"))),
    profile: (userId) => Effect.succeed(names(userId)),
    ensureAttempt: (sessionId, userId, seed) =>
      Effect.sync(() => {
        log.ensured.push({ userId, seed });
        const known = [...attempts.values()].find((a) => a.studentId === userId);
        if (known) return { attempt: known, created: false };
        const attempt = attemptRow({ id: `a${attempts.size + 1}`, sessionId, studentId: userId, seed: seed ?? 7 });
        attempts.set(attempt.id, attempt);
        return { attempt, created: true };
      }),
    deleteAttempt: (attemptId) => Effect.sync(() => void attempts.delete(attemptId)),
    removePlayer: (_sessionId, attemptId, userId) =>
      Effect.sync(() => {
        log.removed.push({ attemptId, userId });
        attempts.delete(attemptId);
        roster.set(userId, "removed");
      }),
    allowRejoin: (_sessionId, userId) => Effect.sync(() => void (log.allowed.push(userId), roster.set(userId, "on"))),

    quizDetail: () => Effect.succeed(detail),
    setLobby: () => Effect.sync(() => void (log.lobby++, (session.row = { ...session.row, status: "lobby" }))),
    setRunning: (_id, now) =>
      Effect.sync(() => void (log.running++, (session.row = { ...session.row, status: "running", startedAt: now }))),
    persistPosition: (_id, position) => Effect.sync(() => void log.positions.push(position)),
    resetStreaks: (ids) => Effect.sync(() => void log.resetStreaks.push(ids)),
    markEnded: (_id, endedAt) =>
      Effect.sync(() => void (log.ended.push(endedAt), (session.row = { ...session.row, status: "ended", endedAt: new Date(endedAt) }))),
    openAttempts: () => Effect.succeed([...attempts.values()].filter((a) => a.status === "in_progress").map((a) => ({ id: a.id }))),
    ownPictures: (_userId, value) => Effect.succeed(value),
    storeAnswer: (attemptId, questionId, row, points, streak) =>
      Effect.sync(() => {
        log.stored.push({ attemptId, questionId, correct: row.correct, earned: row.gamePointsEarned, value: row.value, points, streak });
        const attempt = attempts.get(attemptId);
        if (attempt) attempts.set(attemptId, { ...attempt, points, gameStreak: streak });
      }),
    setQuestion: (attemptId, index) => Effect.sync(() => void log.questionsShown.push({ attemptId, index })),
    setSeconds: (_id, seconds) => Effect.sync(() => void log.seconds.push(seconds)),
    settings: () =>
      Effect.succeed({
        seconds: session.row.gameQuestionSeconds,
        leaderboard: session.row.gameLeaderboard,
        streakBonus: session.row.gameStreakBonus,
        lateJoinMinutes: session.row.lateJoinMinutes,
        relay: session.row.relay,
        relayPassword: session.row.relayPassword,
        relayClues: session.row.relayClues,
      }),

    insertTeams: (rows) =>
      Effect.sync(() =>
        rows.map((row, i) => {
          const id = `team${log.teamsInserted.length + i + 1}`;
          return { id, sessionId: row.sessionId, name: row.name, position: row.position, password: null, wrongGuesses: 0, solvedAt: null, createdAt: at, updatedAt: at };
        }).map((team) => (log.teamsInserted.push(team.name), team)),
      ),
    deleteTeams: () => Effect.void,
    deleteTeam: (teamId) => Effect.sync(() => void log.deletedTeams.push(teamId)),
    saveMembers: (attemptIds, rows) => Effect.sync(() => void log.savedMembers.push({ attemptIds, rows })),
    setRelay: (_id, relay) => Effect.sync(() => void (session.row = { ...session.row, relay })),
    startRelay: (_id, now, empty, plans) =>
      Effect.sync(() => {
        log.startedRelay.push({ empty, plans: plans.map((p) => ({ teamId: p.teamId, members: p.members, password: p.password })) });
        session.row = { ...session.row, status: "running", startedAt: now };
      }),
    saveGuess: (teamId, _attemptId, guess, correct) => Effect.sync(() => void log.guesses.push({ teamId, guess, correct })),
    misses: () => Effect.succeed([]),
    standingRows: () =>
      Effect.succeed([...attempts.values()].map((attempt) => ({ attempt, ...names(attempt.studentId), studentId: `r-${attempt.studentId}` }))),
    answerStats: () => Effect.succeed([]),
  });

  const cache = memoryCache();
  const bus = memoryBus();
  const attemptService = Layer.succeed(
    AttemptService,
    stub<AttemptService["Service"]>("AttemptService", { submit: (input) => Effect.sync(() => (log.submitted.push(input.attemptId), null)) }),
  );
  const hub = Layer.succeed(
    LiveHub,
    stub<LiveHub["Service"]>("LiveHub", { sessionChanged: () => Effect.sync(() => void log.sessionChanged++) }),
  );
  const views = Layer.succeed(
    GameViews,
    stub<GameViews["Service"]>("GameViews", { extras: () => Effect.succeed({ sample: null, urls: {} }), view: () => Effect.die("view not built in tests") }),
  );

  const layer = Game.layer.pipe(
    Layer.provideMerge(RoomStore.layer),
    Layer.provide([
      Layer.succeed(GameRepo, repo),
      views,
      attemptService,
      hub,
      Layer.succeed(LiveBus, bus.service),
      Layer.succeed(Cache, cache.service),
      Layer.succeed(Runner, stub<Runner["Service"]>("Runner", { configured: false })),
      Layer.succeed(Assets, stub<Assets["Service"]>("Assets", {})),
    ]),
  );

  return { ...harness(layer), log, session, bus, attempts, roster, signals: () => bus.published.map((p) => p.message) };
};
