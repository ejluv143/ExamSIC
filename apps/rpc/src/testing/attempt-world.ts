// An in-memory world for the attempt service tests: one quiz, one session and its roster, the attempts and answers
// students made, behind fakes of the repositories. Every write the services make is recorded so a test can check
// what was (and was not) stored; there is no database.
import type { Accommodations } from "@examinus/domain/accommodations";
import type { IntegrityEvent, IntegrityEventType } from "@examinus/domain/quiz";
import type { Question } from "@examinus/domain/question";
import { Effect, Layer, Option, References } from "effect";
import type { AnswerItem, AttemptItem, QuizSessionItem } from "../database/schemas/index.ts";
import { Ai } from "../features/ai/Service.ts";
import { Assets } from "../features/assets/Service.ts";
import { Checking } from "../features/attempt/Checking.ts";
import { AttemptRepo, type SubmitWrite } from "../features/attempt/Repo.ts";
import { AttemptService } from "../features/attempt/Service.ts";
import { Coach } from "../features/attempt/Coach.ts";
import { Results } from "../features/attempt/Results.ts";
import { Saving } from "../features/attempt/Saving.ts";
import { Taking } from "../features/attempt/Taking.ts";
import { Attestation } from "../features/client/Attestation.ts";
import { readAttestation } from "../features/client/rules.ts";
import { ExamRepo } from "../features/exam/Repo.ts";
import { LiveHub, type AttemptChange } from "../features/live/Service.ts";
import { QuizRepo } from "../features/quiz/Repo.ts";
import { Cache } from "./../platform/Cache.ts";
import { Runner } from "../platform/Runner.ts";
import { fakeRateLimiter } from "./rateLimiter.ts";
import { stub, testConfig, testSecret } from "./config.ts";
import { answerItem, attemptItem, choiceQuestion, essayQuestion, quizDetail, quizItem, sessionItem } from "./session-rows.ts";
import type { Player } from "../features/attempt/rules.ts";

export type WorldOptions = {
  session?: Partial<QuizSessionItem>;
  questions?: Question[];
  attempts?: AttemptItem[];
  answers?: AnswerItem[];
  // Retakes the teacher granted to student1 in the session.
  grantedRetakes?: number;
  // Students on the roster of the session.
  roster?: string[];
  // What the teacher set for student1 on the roster.
  accommodations?: Accommodations | null;
  // The code runner; without it, none is configured.
  runner?: Partial<Runner["Service"]>;
};

// Someone playing in the organization of the world's quiz (null: a guest, who has none).
export const player = (id = "student1", organizationId: string | null = quizItem().organizationId): Player => ({ id, organizationId });

export const attemptWorld = (options: WorldOptions = {}) => {
  const quiz = quizItem();
  const detail = quizDetail(options.questions ?? [choiceQuestion(), essayQuestion()], quiz);
  const state = {
    session: sessionItem(options.session),
    attempts: [...(options.attempts ?? [])],
    answers: [...(options.answers ?? [])],
    roster: options.roster ?? ["student1"],
    grants: options.grantedRetakes ?? 0,
    accommodations: options.accommodations ?? null,
    // What was stored or announced.
    submits: [] as SubmitWrite[],
    savedAnswers: [] as { questionId: string; value: unknown }[],
    events: [] as { attemptId: string; type: IntegrityEventType | "batch" }[],
    batches: [] as IntegrityEvent[][],
    checkIns: [] as { attemptId: string; ip?: string | null; deviceId?: string }[],
    created: [] as AttemptItem[],
    changes: [] as { attemptId: string; change: AttemptChange | undefined }[],
    seen: [] as string[],
    // Attempts the background code checks were started for.
    checksStarted: [] as string[],
    coachReports: [] as { attemptId: string; key: string }[],
    marks: [] as { questionId: string; marked: boolean }[],
    joined: [] as string[],
    sessionChanged: [] as string[],
  };
  const find = (id: string) => state.attempts.find((a) => a.id === id) ?? null;
  const mine = (sessionId: string, userId: string) =>
    state.attempts.filter((a) => a.sessionId === sessionId && a.studentId === userId).sort((a, b) => b.attemptNumber - a.attemptNumber);
  // A player without an organization (a guest) plays anywhere; the rest only in the organization of the quiz.
  const inOrganization = (player: Player) => player.organizationId === null || player.organizationId === quiz.organizationId;
  const onRoster = (sessionId: string, player: Player) =>
    sessionId === state.session.id && state.roster.includes(player.id) && inOrganization(player);

  const repo = Layer.succeed(
    AttemptRepo,
    stub<AttemptRepo["Service"]>("AttemptRepo", {
      find: (id) => Effect.succeed(find(id)),
      sessionOf: (id) => Effect.succeed(id === state.session.id ? state.session : null),
      answersOf: (attemptId) => Effect.succeed(state.answers.filter((a) => a.attemptId === attemptId)),
      answersOfMany: (ids) => Effect.succeed(state.answers.filter((a) => ids.includes(a.attemptId))),
      answersWithTyping: (attemptId) =>
        Effect.succeed(state.answers.filter((a) => a.attemptId === attemptId).map((answer) => ({ answer, edits: null }))),
      history: () => Effect.succeed([]),
      keepOwnPictures: (_student, value) => Effect.succeed(value),
      rosterSession: (sessionId, player) =>
        Effect.succeed(onRoster(sessionId, player) ? { session: state.session, quiz, accommodations: state.accommodations } : null),
      roster: (player) => Effect.succeed(onRoster(state.session.id, player) ? [{ session: state.session, quiz, accommodations: state.accommodations }] : []),
      markJoined: (sessionId, player) =>
        Effect.sync(() => {
          const key = `${sessionId}:${player.id}`;
          if (state.joined.includes(key)) return false;
          state.joined.push(key);
          return true;
        }),
      ownAttempt: (attemptId, player) => {
        const attempt = find(attemptId);
        return Effect.succeed(attempt && attempt.studentId === player.id && inOrganization(player) ? { attempt, session: state.session, quiz, accommodations: state.accommodations } : null);
      },
      attemptsOf: (sessionId, userId) => Effect.succeed(mine(sessionId, userId)),
      attemptsIn: (userId, sessionIds, submittedOnly) =>
        Effect.succeed(
          state.attempts.filter(
            (a) => a.studentId === userId && sessionIds.includes(a.sessionId) && (!submittedOnly || a.status !== "in_progress"),
          ),
        ),
      othersIn: (attempt) =>
        Effect.succeed(state.attempts.filter((a) => a.sessionId === attempt.sessionId && a.studentId !== attempt.studentId)),
      openOf: (sessionId, userId) => Effect.succeed(mine(sessionId, userId).find((a) => a.status === "in_progress") ?? null),
      create: (n) =>
        Effect.sync(() => {
          const created = attemptItem({
            id: `att-new-${state.attempts.length + 1}`,
            sessionId: n.sessionId,
            studentId: n.studentId,
            attemptNumber: n.attemptNumber,
            deviceId: n.deviceId ?? null,
            client: n.client,
            ip: n.ip,
            startedAt: n.now,
            lastSeenAt: n.now,
            pledgeAcceptedAt: n.pledgeAccepted ? n.now : null,
          });
          state.attempts.push(created);
          state.created.push(created);
          return created;
        }),
      deviceChangedSince: (attemptId) => Effect.succeed(state.events.some((e) => e.attemptId === attemptId && e.type === "device_changed")),
      addEvent: (attemptId, type) => Effect.sync(() => void state.events.push({ attemptId, type })),
      addEvents: (attemptId, events) =>
        Effect.sync(() => {
          state.batches.push([...events]);
          state.events.push({ attemptId, type: "batch" });
        }),
      // The time of a check-in is the clock's business; what a test cares about is what else changed.
      checkIn: (attemptId, { lastSeenAt: _at, ...change }) => Effect.sync(() => void state.checkIns.push({ attemptId, ...change })),
      moveTo: () => Effect.void,
      questionOf: (_quizId, questionId) =>
        Effect.succeed(detail.parts.flatMap((p) => p.questions).find((q) => q.id === questionId) ?? null),
      saveAnswer: (w) => Effect.sync(() => void state.savedAnswers.push({ questionId: w.question.id, value: w.value })),
      setMark: (w) =>
        Effect.sync(() => {
          const marked = state.answers.filter((a) => a.attemptId === w.attemptId && a.markedForReview && w.onPaper.has(a.questionId));
          if (w.marked && w.max !== null && marked.length >= w.max) return false;
          state.marks.push({ questionId: w.questionId, marked: w.marked });
          return true;
        }),
      saveCoachReport: (attemptId, report) => Effect.sync(() => void state.coachReports.push({ attemptId, key: report.key })),
      // Whoever flips the status first submits; the rest see false.
      submit: (w) =>
        Effect.sync(() => {
          const current = find(w.attempt.id);
          if (!current || current.status !== "in_progress") return false;
          state.submits.push(w);
          current.status = w.status;
          current.submittedAt = w.now;
          for (const g of w.graded) {
            state.answers = state.answers.filter((a) => !(a.attemptId === current.id && a.questionId === g.q.id));
            state.answers.push(
              answerItem(current.id, g.q.id, {
                value: g.value,
                autoScore: g.auto,
                manualScore: w.saved.get(g.q.id)?.manualScore ?? null,
              }),
            );
          }
          return true;
        }),
    }),
  );

  const quizzes = Layer.succeed(
    QuizRepo,
    stub<QuizRepo["Service"]>("QuizRepo", {
      find: () => Effect.succeed(quiz),
      detail: () => Effect.succeed(detail),
      parts: () => Effect.succeed(new Map([[quiz.id, [...detail.parts]]])),
    }),
  );
  const hub = Layer.succeed(
    LiveHub,
    stub<LiveHub["Service"]>("LiveHub", {
      attemptChanged: (attemptId, change) => Effect.sync(() => void state.changes.push({ attemptId, change })),
      seen: (attemptId) => Effect.sync(() => void state.seen.push(attemptId)),
      sessionChanged: (sessionId) => Effect.sync(() => void state.sessionChanged.push(sessionId)),
    }),
  );
  const runner = Layer.succeed(Runner, stub<Runner["Service"]>("Runner", { configured: false, runTests: () => Effect.succeed(null), ...options.runner }));
  const checking = Layer.succeed(
    Checking,
    stub<Checking["Service"]>("Checking", {
      checkDue: (attemptId) => Effect.sync(() => void (attemptId && state.checksStarted.push(attemptId))),
    }),
  );
  const exams = Layer.succeed(
    ExamRepo,
    stub<ExamRepo["Service"]>("ExamRepo", {
      grantedRetakes: (_student, ids) => Effect.succeed(new Map(ids.map((id) => [id, state.grants]))),
    }),
  );
  const assets = Layer.succeed(Assets, stub<Assets["Service"]>("Assets", { paperUrls: () => Effect.succeed({}) }));
  const cache = Layer.succeed(Cache, stub<Cache["Service"]>("Cache", {}));
  const limiter = fakeRateLimiter();
  // The AI coach is only reached by Coach; tests change this to make it answer or fail.
  const ai = { coach: undefined as Ai["Service"]["coach"] | undefined };
  const aiLayer = Layer.succeed(
    Ai,
    stub<Ai["Service"]>("Ai", {
      coach: (organizationId, context) =>
        ai.coach ? ai.coach(organizationId, context) : Effect.die(new Error("Ai.coach was used but the test gave none")),
    }),
  );

  // Attestations are the real signed tokens (a test signs one with `signAttestation(testSecret, …)`); only the platform
  // checks and the nonce store behind `client.attest` are left out.
  const attestation = Layer.succeed(
    Attestation,
    stub<Attestation["Service"]>("Attestation", {
      verify: (token, userId, deviceId) =>
        Effect.sync(() =>
          token === undefined || deviceId === undefined
            ? Option.none()
            : Option.filter(readAttestation(testSecret, token, Date.now()), (c) => c.uid === userId && c.did === deviceId),
        ),
    }),
  );

  const deps = Layer.mergeAll(repo, quizzes, hub, runner, checking, exams, assets, cache, limiter.layer, aiLayer, attestation, testConfig);
  const attemptService = AttemptService.layer.pipe(Layer.provide(deps));
  const base = Layer.mergeAll(deps, attemptService);
  const services = Layer.mergeAll(Taking.layer, Saving.layer, Results.layer).pipe(Layer.provideMerge(base));
  // The services log what they swallow (a failed model, an auto-submit); a test run doesn't need to read it.
  const layer = Coach.layer.pipe(Layer.provideMerge(services), Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, "Error")));
  return { layer, state, limiter, ai, quiz, detail };
};
