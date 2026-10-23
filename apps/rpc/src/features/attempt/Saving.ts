// Saving what the student does: answers, sample test runs, the submit, and the integrity telemetry.
import { type AttemptResult, type DeviceApprovalRequired, type OpenElsewhere, type PlayInGame } from "@examinus/contract/attempt";
import { Conflict, Forbidden, NotFound } from "@examinus/contract/errors";
import { type CodeTestResult } from "@examinus/domain/kinds/base";
import { kindOf } from "@examinus/domain/kinds";
import { type AnswerValue, type AttemptStatus, type IntegrityEvent, type TypingEdits } from "@examinus/domain/quiz";
import { Context, Effect, Layer } from "effect";
import { clientIp } from "../../platform/network.ts";
import { attemptEvents, count } from "../../platform/Metrics.ts";
import { limits, RateLimiter } from "../../platform/RateLimiter.ts";
import { Runner } from "../../platform/Runner.ts";
import { LiveHub } from "../live/Service.ts";
import { toSession } from "../session/mappers.ts";
import { resultsVisible } from "../session/rules.ts";
import { summary } from "./mappers.ts";
import { AttemptRepo } from "./Repo.ts";
import { attemptPaper, cleanAnswer, cleanEvents, flatQuestions, questionGraceMs, refuseGame, type Player } from "./rules.ts";
import { AttemptService } from "./Service.ts";
import { QuizRepo } from "../quiz/Repo.ts";

const noAttempt = new NotFound({ message: "That attempt doesn't exist." });

const maxCodeLength = 20000;

// The request headers the web app forwards (network address, browser hints).
type Headers = Readonly<Record<string, string | undefined>>;

type Refusal = Conflict | Forbidden | NotFound;
// Refusals of a call that touches an attempt in progress (see `AttemptService.guard`).
type Guarded = Refusal | DeviceApprovalRequired | OpenElsewhere;

export class Saving extends Context.Service<
  Saving,
  {
    // Autosave of one answer.
    readonly saveAnswer: (
      player: Player,
      input: {
        attemptId: string;
        deviceId: string;
        questionId: string;
        value: AnswerValue;
        typing?: TypingEdits | undefined;
        timeSpentMs?: number | undefined;
      },
      headers: Headers,
    ) => Effect.Effect<void, Guarded | PlayInGame>;
    // Runs a code answer against the question's sample tests. null: the runner isn't available.
    readonly runSampleTests: (
      player: Player,
      input: { attemptId: string; questionId: string; code: string },
    ) => Effect.Effect<CodeTestResult[] | null, Refusal | PlayInGame>;
    readonly submit: (
      player: Player,
      input: {
        attemptId: string;
        deviceId: string;
        answers: Readonly<Record<string, AnswerValue>>;
        events: readonly IntegrityEvent[];
        typing: Readonly<Record<string, TypingEdits>>;
      },
      headers: Headers,
    ) => Effect.Effect<{ status: AttemptStatus; result: AttemptResult | null }, Guarded | PlayInGame>;
    readonly recordEvents: (
      player: Player,
      input: { attemptId: string; deviceId: string; events: readonly IntegrityEvent[] },
      headers: Headers,
    ) => Effect.Effect<void, Guarded>;
    readonly heartbeat: (
      player: Player,
      input: { attemptId: string; deviceId: string },
      headers: Headers,
    ) => Effect.Effect<void, Guarded>;
  }
>()("examinus/api/AttemptSaving") {
  static readonly layer = Layer.effect(
    Saving,
    Effect.gen(function* () {
      const repo = yield* AttemptRepo;
      const attempt = yield* AttemptService;
      const quizRepo = yield* QuizRepo;
      const runner = yield* Runner;
      const hub = yield* LiveHub;
      const limiter = yield* RateLimiter;

      const saveAnswer = Effect.fn("Saving.saveAnswer")(function* (
        player: Player,
        { attemptId, deviceId, questionId, value, typing, timeSpentMs }: {
          attemptId: string;
          deviceId: string;
          questionId: string;
          value: AnswerValue;
          typing?: TypingEdits | undefined;
          timeSpentMs?: number | undefined;
        },
        headers: Headers,
      ) {
        const { attempt: row, session, quiz, accommodations } = yield* attempt.ownAttempt(attemptId, player);
        yield* refuseGame(session);
        yield* attempt.requireWritable(row, session, accommodations);
        yield* attempt.guard(row, session, deviceId, clientIp(headers));
        if (session.mode === "mastery") return yield* new Conflict({ message: "Mastery answers are graded one at a time." });
        const question = yield* repo.questionOf(quiz.id, questionId);
        if (!question) return yield* new NotFound({ message: "That question isn't in this quiz." });
        if (session.oneQuestionAtATime) {
          const detail = yield* quizRepo.detail(quiz);
          const paper = flatQuestions(attemptPaper(detail, row.seed));
          const now = Date.now();
          const at = yield* attempt.syncProgress(row, session, paper, now);
          if (paper[at.index]?.id !== questionId) return yield* new Conflict({ message: "You can only answer the question you're on." });
          if (at.deadline !== null && now > at.deadline + questionGraceMs)
            return yield* new Conflict({ message: "Time for this question is up." });
        }
        const cleaned =
          kindOf(question).answerPictures
            ? yield* repo.keepOwnPictures(player, cleanAnswer(question, value))
            : cleanAnswer(question, value);
        const spent = timeSpentMs === undefined ? null : Math.min(Math.max(0, timeSpentMs), 24 * 3600_000);
        yield* repo.saveAnswer({ attemptId, mode: session.mode, question, value: cleaned, typing, spentMs: spent, now: new Date() });
        yield* count(attemptEvents, { event: "save" });
        yield* hub.attemptChanged(attemptId, { answer: { questionId, value: cleaned } });
      });

      const runSampleTests = Effect.fn("Saving.runSampleTests")(function* (
        player: Player,
        { attemptId, questionId, code }: { attemptId: string; questionId: string; code: string },
      ) {
        const { attempt: row, session, quiz, accommodations } = yield* attempt.ownAttempt(attemptId, player);
        yield* refuseGame(session);
        yield* attempt.requireWritable(row, session, accommodations);
        const question = yield* repo.questionOf(quiz.id, questionId);
        if (question?.type !== "code") return yield* new Conflict({ message: "That isn't a code question." });
        if (code.length > maxCodeLength) return yield* new Conflict({ message: "Your code is too long." });
        const samples = question.tests.filter((t) => !t.hidden);
        if (samples.length === 0) return yield* new Conflict({ message: "This question has no sample tests to run." });

        yield* limiter.hit(limits.codeRun, player.id).pipe(Effect.mapError((e) => new Conflict({ message: e.message })));
        return (yield* runner.runTests(question, code, samples)) as CodeTestResult[] | null;
      });

      const submit = Effect.fn("Saving.submit")(function* (
        player: Player,
        { attemptId, deviceId, answers, events, typing }: {
          attemptId: string;
          deviceId: string;
          answers: Readonly<Record<string, AnswerValue>>;
          events: readonly IntegrityEvent[];
          typing: Readonly<Record<string, TypingEdits>>;
        },
        headers: Headers,
      ) {
        const { attempt: row, session, accommodations } = yield* attempt.ownAttempt(attemptId, player);
        yield* refuseGame(session);
        // An attempt that is already in comes back as it is, whatever the time.
        if (row.status === "in_progress") {
          yield* attempt.requireWritable(row, session, accommodations);
          // The network allowlist isn't checked here: handing in what the student has is always safe.
          yield* attempt.guard(row, session, deviceId, clientIp(headers), { network: false });
        }
        const done = yield* attempt.submit({ attemptId, answers, typing, events, auto: false });
        if (!done) return yield* noAttempt;
        const fresh = yield* repo.sessionOf(session.id);
        const visible = resultsVisible(toSession(fresh!, Date.now()));
        return { status: done.status, result: visible && done.score ? summary(done.score) : null };
      });

      const recordEvents = Effect.fn("Saving.recordEvents")(function* (
        player: Player,
        { attemptId, deviceId, events }: { attemptId: string; deviceId: string; events: readonly IntegrityEvent[] },
        headers: Headers,
      ) {
        const { attempt: row, session } = yield* attempt.ownAttempt(attemptId, player);
        // Events that arrive after the submit (a late flush) are dropped.
        if (row.status !== "in_progress") return;
        yield* attempt.guard(row, session, deviceId, clientIp(headers));
        const cleaned = cleanEvents(events, new Date());
        if (cleaned.length === 0) return;
        yield* repo.addEvents(attemptId, cleaned);
        yield* hub.attemptChanged(attemptId, { events: cleaned });
      });

      const heartbeat = Effect.fn("Saving.heartbeat")(function* (
        player: Player,
        { attemptId, deviceId }: { attemptId: string; deviceId: string },
        headers: Headers,
      ) {
        const { attempt: row, session } = yield* attempt.ownAttempt(attemptId, player);
        if (row.status !== "in_progress") return;
        yield* attempt.guard(row, session, deviceId, clientIp(headers));
        yield* count(attemptEvents, { event: "heartbeat" });
      });

      return Saving.of({ saveAnswer, runSampleTests, submit, recordEvents, heartbeat });
    }),
  );
}
