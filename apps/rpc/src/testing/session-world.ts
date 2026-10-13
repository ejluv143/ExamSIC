// An in-memory world for the session service tests: one teacher with a quiz, a class and sessions, behind a fake
// SessionRepo. Every write the services make is recorded, so a test can check what was (and was not) stored.
import { Conflict, NotFound } from "@examinus/contract/errors";
import type { StudentEndReason } from "@examinus/contract/live";
import type { IncidentKind } from "@examinus/contract/live";
import { Effect, Layer, References } from "effect";
import type { AnswerItem, AttemptItem, IncidentItem, QuestionItem, QuizItem, QuizSessionItem } from "../database/schemas/index.ts";
import { AttemptService, type SubmitInput } from "../features/attempt/Service.ts";
import { Game } from "../features/game/Service.ts";
import { LiveHub } from "../features/live/Service.ts";
import { QuizRepo } from "../features/quiz/Repo.ts";
import { SessionLifecycle } from "../features/session/Lifecycle.ts";
import { SessionLiveActions } from "../features/session/LiveActions.ts";
import { SessionReports } from "../features/session/Reports.ts";
import { SessionRepo, type SessionColumns } from "../features/session/Repo.ts";
import { SessionService } from "../features/session/Service.ts";
import { stub } from "./config.ts";
import { quizDetail, quizItem, sessionItem } from "./session-rows.ts";

export type SessionWorldOptions = {
  sessions?: QuizSessionItem[];
  attempts?: AttemptItem[];
  answers?: AnswerItem[];
  questions?: QuestionItem[];
  // Roster entries of every session.
  roster?: string[];
  // The classes the teacher owns.
  classes?: string[];
  // What the repo's `advance` reports as opened or ended.
  advanced?: string[];
  // Make the game fail to validate with this message.
  gameInvalid?: string;
};

export const sessionWorld = (options: SessionWorldOptions = {}) => {
  const quiz: QuizItem = quizItem();
  const state = {
    sessions: new Map((options.sessions ?? [sessionItem()]).map((s) => [s.id, s])),
    attempts: [...(options.attempts ?? [])],
    answers: [...(options.answers ?? [])],
    questions: options.questions ?? [],
    inserted: [] as SessionColumns[],
    updates: [] as { sessionId: string; set: SessionColumns }[],
    syncs: [] as { sessionId: string; classId: string; replace: boolean }[],
    removed: [] as string[],
    ended: [] as string[],
    attemptUpdates: [] as { attemptId: string; set: Partial<AttemptItem> }[],
    shifts: [] as { sessionId: string; ms: number; shiftQuestions: boolean; set: { pausedAt?: null } }[],
    grades: [] as { questionId: string; manualScore: number | null; feedback: string | null; change: { changedBy: string; oldScore: number | null; newScore: number | null; reason: string } | null }[],
    // What the hub was asked to tell or store.
    incidents: [] as { sessionId: string; attemptId: string | null; actorId: string; kind: IncidentKind; message?: string; seconds?: number }[],
    sessionChanged: [] as string[],
    attemptChanges: [] as { attemptId: string; state: boolean | undefined }[],
    warnings: [] as { attemptId: string; message: string }[],
    // What the game was asked to do, and what attempts were submitted by the server.
    game: [] as string[],
    submitted: [] as { attemptId: string; auto: boolean; reason: StudentEndReason | undefined }[],
    incidentRows: [] as IncidentItem[],
  };
  const teacher = "teacher1";
  const classes = new Set(options.classes ?? ["class1"]);
  const session = (id: string) => state.sessions.get(id);
  const ownedAttempt = (attemptId: string, userId: string) => {
    const attempt = state.attempts.find((a) => a.id === attemptId);
    const s = attempt && session(attempt.sessionId);
    return attempt && s && userId === teacher ? { attempt, session: s, quiz } : undefined;
  };
  const nothing = (message: string) => new NotFound({ message });
  let nextId = 1;

  const repo = Layer.succeed(
    SessionRepo,
    stub<SessionRepo["Service"]>("SessionRepo", {
      ownSession: (sessionId, userId) => {
        const s = session(sessionId);
        return s && userId === teacher ? Effect.succeed({ session: s, quiz }) : Effect.fail(nothing("That session doesn't exist."));
      },
      ownAttemptOf: (attemptId, userId) => {
        const owned = ownedAttempt(attemptId, userId);
        return owned ? Effect.succeed(owned) : Effect.fail(nothing("That attempt doesn't exist."));
      },
      ownClass: (classId, userId) =>
        classes.has(classId) && userId === teacher ? Effect.void : Effect.fail(nothing("That class doesn't exist.")),
      ownQuiz: (quizId, userId) => (quizId === quiz.id && userId === teacher ? Effect.void : Effect.fail(nothing("That quiz doesn't exist."))),
      find: (sessionId) => Effect.sync(() => session(sessionId)!),
      insert: (values) =>
        Effect.sync(() => {
          state.inserted.push(values);
          const row = sessionItem({ ...values, id: `new${nextId++}`, joinCode: "NEWCODE" } as Partial<QuizSessionItem>);
          state.sessions.set(row.id, row);
          return row;
        }),
      update: (sessionId, set) =>
        Effect.sync(() => {
          state.updates.push({ sessionId, set });
          state.sessions.set(sessionId, { ...session(sessionId)!, ...(set as Partial<QuizSessionItem>) });
        }),
      remove: (sessionId) => Effect.sync(() => void state.removed.push(sessionId)),
      syncRoster: (sessionId, classId, replace) => Effect.sync(() => void state.syncs.push({ sessionId, classId, replace })),
      rosterIds: () => Effect.succeed(options.roster ?? []),
      list: () =>
        Effect.succeed(
          [...state.sessions.values()].map((s) => ({ session: s, quizTitle: quiz.title, studentCount: 3, submittedCount: 1, needsGrading: 0 })),
        ),
      markEnded: (sessionId, now) =>
        Effect.sync(() => {
          state.ended.push(sessionId);
          state.sessions.set(sessionId, { ...session(sessionId)!, status: "ended", endedAt: now });
        }),
      inProgress: (sessionId) =>
        Effect.succeed(state.attempts.filter((a) => a.sessionId === sessionId && a.status === "in_progress").map((a) => ({ id: a.id }))),
      advance: () => Effect.succeed((options.advanced ?? []).map((id) => ({ id }))),
      openAttempts: Effect.sync(() =>
        state.attempts
          .filter((a) => a.status === "in_progress" && session(a.sessionId) && !session(a.sessionId)!.pausedAt)
          .map((attempt) => ({ attempt, session: session(attempt.sessionId)! })),
      ),
      updateAttempt: (attemptId, set) =>
        Effect.sync(() => {
          state.attemptUpdates.push({ attemptId, set });
          const i = state.attempts.findIndex((a) => a.id === attemptId);
          if (i >= 0) state.attempts[i] = { ...state.attempts[i]!, ...set };
        }),
      shiftClocks: (s, ms, shiftQuestions, set) => Effect.sync(() => void state.shifts.push({ sessionId: s.id, ms, shiftQuestions, set })),
      questionOf: (_quizId, questionId) => {
        const row = state.questions.find((q) => q.id === questionId);
        return row ? Effect.succeed(row) : Effect.fail(nothing("That question doesn't exist."));
      },
      answerOf: (attemptId, questionId) =>
        Effect.succeed(state.answers.find((a) => a.attemptId === attemptId && a.questionId === questionId)),
      saveGrade: (input) =>
        Effect.sync(() => {
          state.grades.push({ questionId: input.questionId, manualScore: input.manualScore, feedback: input.feedback, change: input.change });
          return { status: "graded" as const };
        }),
      incidentsOf: () => Effect.succeed(state.incidentRows),
      attemptDetails: () => Effect.succeed([]),
      // Roster ids are "roster-" and the account id.
      classScoreData: () =>
        Effect.succeed({
          rows: [...state.sessions.values()].map((s) => ({ session: s, quiz })),
          parts: new Map([[quiz.id, [...quizDetail(undefined, quiz).parts]]]),
          done: state.attempts.filter((a) => a.status !== "in_progress").map((attempt) => ({ attempt, rosterId: `roster-${attempt.studentId}` })),
          answerRows: state.answers,
        }),
    }),
  );
  const hub = Layer.succeed(
    LiveHub,
    stub<LiveHub["Service"]>("LiveHub", {
      record: (input) => Effect.sync(() => void state.incidents.push(input)),
      sessionChanged: (sessionId) => Effect.sync(() => void state.sessionChanged.push(sessionId)),
      attemptChanged: (attemptId, change) => Effect.sync(() => void state.attemptChanges.push({ attemptId, state: change?.state })),
      warn: (attemptId, message) => Effect.sync(() => void state.warnings.push({ attemptId, message })),
    }),
  );
  const attemptService = Layer.succeed(
    AttemptService,
    stub<AttemptService["Service"]>("AttemptService", {
      submit: (input: SubmitInput) =>
        Effect.sync(() => {
          state.submitted.push({ attemptId: input.attemptId, auto: input.auto, reason: input.reason });
          const i = state.attempts.findIndex((a) => a.id === input.attemptId);
          if (i >= 0) state.attempts[i] = { ...state.attempts[i]!, status: "graded", submittedAt: new Date() };
          return { status: "graded" as const, score: null };
        }),
    }),
  );
  const game = Layer.succeed(
    Game,
    stub<Game["Service"]>("Game", {
      validate: (quizId, pacing) =>
        options.gameInvalid === undefined
          ? Effect.sync(() => void state.game.push(`validate:${quizId}:${pacing}`))
          : Effect.fail(new Conflict({ message: options.gameInvalid })),
      openLobby: (sessionId) => Effect.sync(() => void state.game.push(`openLobby:${sessionId}`)),
      end: (sessionId) => Effect.sync(() => void state.game.push(`end:${sessionId}`)),
      applySettings: (sessionId) => Effect.sync(() => void state.game.push(`applySettings:${sessionId}`)),
    }),
  );
  const quizzes = Layer.succeed(QuizRepo, stub<QuizRepo["Service"]>("QuizRepo", { detail: () => Effect.succeed(quizDetail([], quiz)) }));

  const deps = Layer.mergeAll(repo, hub, attemptService, game, quizzes);
  const service = SessionService.layer.pipe(Layer.provide(deps));
  const base = Layer.mergeAll(deps, service);
  const layer = Layer.mergeAll(SessionLifecycle.layer, SessionLiveActions.layer, SessionReports.layer).pipe(
    Layer.provideMerge(base),
    // The sweep logs what it did; a test run doesn't need to read it.
    Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, "Error")),
  );
  return { layer, state, quiz, teacher };
};
