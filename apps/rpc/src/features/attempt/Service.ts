// Grading and submitting an attempt: what the student page, the teacher's actions, the games and the background
// job all share.
import { DeviceApprovalRequired, OpenElsewhere } from "@examinus/contract/attempt";
import { Conflict, Forbidden, NotFound } from "@examinus/contract/errors";
import { type StudentEndReason } from "@examinus/contract/live";
import { type QuizPartWithQuestions } from "@examinus/contract/quiz";
import { kindOf } from "@examinus/domain/kinds";
import { type Question } from "@examinus/domain/question";
import {
  type AnswerValue,
  type AttemptStatus,
  type IntegrityEvent,
  type IntegrityEventType,
  type TypingEdits,
} from "@examinus/domain/quiz";
import { autoScore, type AttemptScore } from "@examinus/domain/scoring";
import { orderForAttempt } from "@examinus/domain/shuffle";
import { Context, Effect, Layer } from "effect";
import type { AnswerItem, AttemptItem, QuizItem, QuizSessionItem } from "../../database/schemas/index.ts";
import { attemptEvents, count } from "../../platform/Metrics.ts";
import { ipAllowed } from "../../platform/network.ts";
import { Runner } from "../../platform/Runner.ts";
import { checkAnswer } from "../../platform/checks.ts";
import { withinGrace } from "../exam/rules.ts";
import { LiveHub } from "../live/Service.ts";
import { QuizRepo } from "../quiz/Repo.ts";
import { attemptDeadline, graceMs } from "../session/rules.ts";
import {
  deviceApprovalMessage,
  otherDeviceMessage,
  questionGraceMs,
  attemptPaper,
  cleanAnswer,
  cleanEvents,
  disconnectGap,
  flatQuestions,
  isBlank,
  questionProgress,
  scoreOf,
  shownTimes,
  type QuestionProgress,
} from "./rules.ts";
import { AttemptRepo, type OwnedAttempt, type RosterRow } from "./Repo.ts";

const noAttempt = new NotFound({ message: "That attempt doesn't exist." });

export type SubmitInput = {
  attemptId: string;
  // Answers by question id, replacing what was autosaved; absent: submit what was saved.
  answers?: Readonly<Record<string, AnswerValue>>;
  typing?: Readonly<Record<string, TypingEdits>>;
  events?: readonly IntegrityEvent[];
  // Submitted by the server (time ran out, or the teacher ended the session), not by the student.
  auto: boolean;
  // Why the server submitted it, shown to the student.
  reason?: StudentEndReason;
};

export type Submitted = { status: AttemptStatus; score: AttemptScore | null };

export class AttemptService extends Context.Service<
  AttemptService,
  {
    // Grades and submits an in-progress attempt. An attempt already submitted is returned as it is.
    readonly submit: (input: SubmitInput) => Effect.Effect<Submitted | null>;
    // Logs an integrity event on the attempt and tells whoever watches it live.
    readonly notice: (attemptId: string, type: IntegrityEventType, at: Date, durationMs?: number) => Effect.Effect<void>;
    // The student's own attempt with its session and quiz, or NotFound.
    readonly ownAttempt: (attemptId: string, userId: string) => Effect.Effect<OwnedAttempt, NotFound>;
    readonly requireOpen: (attempt: AttemptItem, session: QuizSessionItem) => Effect.Effect<void, Conflict>;
    readonly requireWritable: (attempt: AttemptItem, session: QuizSessionItem) => Effect.Effect<void, Conflict>;
    // Refuses a call from another browser or network, and logs what it notices; see the implementation.
    readonly guard: (
      attempt: AttemptItem,
      session: QuizSessionItem,
      deviceId: string | undefined,
      ip: string | null,
      options?: { required?: boolean; network?: boolean },
    ) => Effect.Effect<void, Conflict | Forbidden | DeviceApprovalRequired | OpenElsewhere>;
    // Where the student is on a one-question-at-a-time paper; stores the move when time ran out.
    readonly syncProgress: (
      attempt: AttemptItem,
      session: QuizSessionItem,
      paper: readonly Question[],
      now: number,
    ) => Effect.Effect<QuestionProgress & { rows: AnswerItem[]; shown: number[]; limit: number | null; closed: boolean[] }>;
    // The latest submitted attempt of each roster session, with a way to score it.
    readonly latestScores: (
      rows: readonly RosterRow[],
      attemptRows: readonly AttemptItem[],
    ) => Effect.Effect<{
      parts: Map<string, QuizPartWithQuestions[]>;
      latest: Map<string, AttemptItem>;
      scoreOf: (attempt: AttemptItem, quiz: QuizItem) => AttemptScore;
    }>;
  }
>()("examinus/api/AttemptService") {
  static readonly layer = Layer.effect(
    AttemptService,
    Effect.gen(function* () {
      const repo = yield* AttemptRepo;
      const quizRepo = yield* QuizRepo;
      const runner = yield* Runner;
      const hub = yield* LiveHub;

      // Checks one code or SQL answer against the question's tests. null: nothing could check it.
      const check = (q: Question, value: AnswerValue) => checkAnswer(runner, q, value, isBlank(value));

      // The score of an attempt that was already submitted.
      const finished = Effect.fn("AttemptService.finished")(function* (attempt: AttemptItem, quizId: string) {
        const quiz = yield* quizRepo.find(quizId);
        const detail = yield* quizRepo.detail(quiz!);
        const rows = yield* repo.answersOf(attempt.id);
        const score = scoreOf(flatQuestions(attemptPaper(detail, attempt.seed)), rows);
        return { status: attempt.status, score } satisfies Submitted;
      });

      // The student's own attempt with its session and quiz, or NotFound.
      const ownAttempt = Effect.fn("AttemptService.ownAttempt")(function* (attemptId: string, userId: string) {
        return (yield* repo.ownAttempt(attemptId, userId)) ?? (yield* noAttempt);
      });

      // The attempt must be in progress and inside its time (plus the grace). While the session is paused the
      // clock is stopped at the moment of the pause.
      const requireOpen = Effect.fn("AttemptService.requireOpen")(function* (attempt: AttemptItem, session: QuizSessionItem) {
        if (attempt.status !== "in_progress") return yield* new Conflict({ message: "This attempt was already submitted." });
        const deadline = attemptDeadline(session, attempt);
        const clock = session.pausedAt ? Math.min(Date.now(), session.pausedAt.getTime()) : Date.now();
        if (deadline !== null && clock > deadline + graceMs) return yield* new Conflict({ message: "Time is up." });
      });

      // Everything that changes the attempt: not while the teacher has paused the session or locked this attempt.
      const requireWritable = Effect.fn("AttemptService.requireWritable")(function* (attempt: AttemptItem, session: QuizSessionItem) {
        yield* requireOpen(attempt, session);
        if (session.pausedAt) return yield* new Conflict({ message: "Your teacher paused the session. Wait for it to resume." });
        if (attempt.locked) return yield* new Conflict({ message: "Your teacher locked your attempt. Wait for them to unlock it." });
      });

      const notice = (attemptId: string, type: IntegrityEventType, at: Date, durationMs?: number) =>
        repo.addEvent(attemptId, type, at, durationMs).pipe(
          Effect.andThen(
            hub.attemptChanged(attemptId, {
              events: [{ type, at: at.toISOString(), ...(durationMs === undefined ? {} : { durationMs }) }],
            }),
          ),
        );

      // Every call that touches an attempt in progress passes through here: it must come from the browser the attempt
      // started on (anything else is refused and logged), and from an allowed network. What it notices is logged:
      // a changed network address, and a gap since the last check-in. `required`: a missing token counts as another
      // browser (reading the paper); `network: false` skips the allowlist.
      const guard = Effect.fn("AttemptService.guard")(function* (
        attempt: AttemptItem,
        session: QuizSessionItem,
        deviceId: string | undefined,
        ip: string | null,
        options: { required?: boolean; network?: boolean } = {},
      ) {
        const now = new Date();
        // Exam sessions: another device, or the same one after being away longer than the grace period, waits for the
        // teacher's approval (`session.allowBackIn`). Other modes only refuse another device.
        const exam = session.mode === "exam";
        const otherDevice = attempt.deviceId !== null && deviceId !== attempt.deviceId && (deviceId !== undefined || options.required);
        const awayTooLong = exam && attempt.deviceId !== null && !withinGrace(session.exam, attempt.lastSeenAt, now);
        if (otherDevice || awayTooLong) {
          // One event a minute, however often the other browser retries.
          if (!(yield* repo.deviceChangedSince(attempt.id, new Date(now.getTime() - 60_000)))) yield* notice(attempt.id, "device_changed", now);
          return exam
            ? yield* new DeviceApprovalRequired({ message: deviceApprovalMessage })
            : yield* new OpenElsewhere({ message: otherDeviceMessage });
        }
        if (options.network !== false && !ipAllowed(ip, session.ipAllowlist))
          return yield* new Forbidden({ message: "This isn't on the network allowed for this session." });
        const gap = disconnectGap(attempt.lastSeenAt, now);
        if (gap) yield* notice(attempt.id, "disconnected", new Date(gap.at), gap.durationMs);
        const moved = attempt.ip !== null && ip !== null && ip !== attempt.ip;
        if (moved) yield* notice(attempt.id, "network_changed", now);
        yield* repo.checkIn(attempt.id, {
          lastSeenAt: now,
          ...(moved ? { ip } : {}),
          // An attempt from before devices were tracked adopts the first browser that checks in.
          ...(attempt.deviceId === null && deviceId !== undefined ? { deviceId } : {}),
        });
        yield* hub.seen(attempt.id);
      });

      // One question at a time: where the student is now (`questionProgress`), with the attempt's answer rows and which
      // questions can't be opened again because their time ran out. The first read after a question's time ran out
      // stores the move, and the time of every question that ran out as used up, so they stay closed.
      const syncProgress = Effect.fn("AttemptService.syncProgress")(function* (
        attempt: AttemptItem,
        session: QuizSessionItem,
        paper: readonly Question[],
        now: number,
      ) {
        const rows = yield* repo.answersOf(attempt.id);
        const shown = shownTimes(paper, rows);
        const at = questionProgress(session, attempt, shown, now);
        const limit = session.questionTimeLimitSeconds === null ? null : session.questionTimeLimitSeconds * 1000;
        if (at.timedOut.length > 0 || at.index !== attempt.questionIndex || at.furthest !== attempt.furthestIndex)
          yield* repo.moveTo(
            attempt.id,
            { questionIndex: at.index, furthestIndex: at.furthest, startedAt: new Date(at.startedAt) },
            at.timedOut.map((i) => ({ questionId: paper[i]!.id, shownMs: limit ?? 0 })),
          );
        const closed = shown.map((ms, i) => limit !== null && (ms >= limit || at.timedOut.includes(i)));
        return { ...at, rows, shown, limit, closed };
      });

      // Latest submitted attempt of each session with its score, for the student's lists.
      const latestScores = Effect.fn("AttemptService.latestScores")(function* (rows: readonly RosterRow[], attemptRows: readonly AttemptItem[]) {
        const parts = yield* quizRepo.parts([...new Set(rows.map((r) => r.quiz.id))]);
        const latest = new Map<string, AttemptItem>();
        for (const a of attemptRows) {
          if (a.status === "in_progress") continue;
          const prev = latest.get(a.sessionId);
          if (!prev || prev.submittedAt! < a.submittedAt!) latest.set(a.sessionId, a);
        }
        const answerRows = yield* repo.answersOfMany([...latest.values()].map((a) => a.id));
        const byAttempt = new Map<string, AnswerItem[]>();
        for (const r of answerRows) byAttempt.set(r.attemptId, [...(byAttempt.get(r.attemptId) ?? []), r]);
        return {
          parts,
          latest,
          scoreOf: (a: AttemptItem, quiz: QuizItem) =>
            scoreOf(flatQuestions(orderForAttempt(quiz.settings, parts.get(quiz.id) ?? [], a.seed)), byAttempt.get(a.id) ?? []),
        };
      });

      const submit = Effect.fn("AttemptService.submit")(function* (input: SubmitInput) {
        const now = new Date();
        const attempt = yield* repo.find(input.attemptId);
        if (!attempt) return null;
        const session = yield* repo.sessionOf(attempt.sessionId);
        const quiz = yield* quizRepo.find(session!.quizId);
        if (attempt.status !== "in_progress") return yield* finished(attempt, quiz!.id);

        const detail = yield* quizRepo.detail(quiz!);
        const paper = flatQuestions(attemptPaper(detail, attempt.seed));
        const saved = yield* repo.answersOf(attempt.id);
        const savedBy = new Map(saved.map((r) => [r.questionId, r]));
        // One question at a time: only the question the student is on may still change; the rest are locked.
        const progress = session!.oneQuestionAtATime
          ? questionProgress(session!, attempt, shownTimes(paper, saved), now.getTime())
          : null;
        const openQuestionId = progress ? paper[progress.index]?.id : undefined;
        const questionTimeUp =
          progress?.deadline != null && now.getTime() > progress.deadline + questionGraceMs;

        // Each question's final answer: the submitted one, else what was autosaved. Mastery answers were graded
        // when they were given, so they are kept as they are.
        const graded = yield* Effect.forEach(
          paper,
          (q) =>
            Effect.gen(function* () {
              if (session!.mode === "mastery") {
                const row = savedBy.get(q.id);
                return { q, value: row?.value ?? null, results: null, auto: row ? row.autoScore : autoScore(q, null, null) };
              }
              const mayChange = !progress || (q.id === openQuestionId && !questionTimeUp);
              const sent = mayChange && input.answers && Object.hasOwn(input.answers, q.id) ? input.answers[q.id] : undefined;
              const cleaned = cleanAnswer(q, sent === undefined ? (savedBy.get(q.id)?.value ?? null) : sent);
              const value = kindOf(q).answerPictures ? yield* repo.keepOwnPictures(attempt.studentId, cleaned) : cleaned;
              const results = yield* check(q, value);
              return { q, value, results, auto: autoScore(q, value, results) };
            }),
          { concurrency: 3 },
        );

        const events = cleanEvents(input.events ?? [], now);
        const limit = session!.timeLimitMinutes;
        if (input.auto) {
          events.push({ type: "auto_submitted", at: now.toISOString() });
          // Someone who left and never came back: the time since the last check-in.
          const gap = disconnectGap(attempt.lastSeenAt, now);
          if (gap) events.push(gap);
        } else if (limit !== null && now.getTime() - attempt.startedAt.getTime() > (limit + 1) * 60_000)
          events.push({ type: "late_submit", at: now.toISOString() });

        // Essays, and code nothing could check, wait for the teacher.
        const score = scoreOf(
          paper,
          graded.map((g) => ({ questionId: g.q.id, autoScore: g.auto, manualScore: savedBy.get(g.q.id)?.manualScore ?? null })),
        );
        const status: AttemptStatus = score.ungraded > 0 ? "needs_grading" : "graded";

        const won = yield* repo.submit({ attempt, session: session!, status, now, graded, saved: savedBy, typing: input.typing, events });
        if (!won) {
          const again = yield* repo.find(attempt.id);
          return yield* finished(again!, quiz!.id);
        }
        yield* count(attemptEvents, input.auto ? { event: "auto_submit", reason: input.reason ?? "time_up" } : { event: "submit" });
        yield* hub.attemptChanged(attempt.id, input.auto ? { events, ended: input.reason ?? "time_up" } : { events });
        return { status, score };
      });

      return AttemptService.of({ submit, notice, ownAttempt, requireOpen, requireWritable, guard, syncProgress, latestScores });
    }),
  );
}
