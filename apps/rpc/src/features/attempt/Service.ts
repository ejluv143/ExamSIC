// Grading and submitting an attempt: what the student page, the teacher's actions, the games and the background
// job all share.
import {
  autoScore,
  type AnswerValue,
  type AttemptScore,
  type AttemptStatus,
  type CodeTestResult,
  type IntegrityEvent,
  type Question,
  type StudentEndReason,
  type TypingEdits,
} from "@examinus/contract";
import { Context, Effect, Layer } from "effect";
import type { AttemptItem } from "../../database/schemas/index.ts";
import { Runner } from "../../platform/Runner.ts";
import { runSqlChecks } from "../../platform/sql-grader.ts";
import { LiveHub } from "../live/Service.ts";
import { QuizRepo } from "../quiz/Repo.ts";
import { questionGraceMs, attemptPaper, cleanAnswer, cleanEvents, disconnectGap, flatQuestions, isBlank, questionProgress, scoreOf, shownTimes } from "./rules.ts";
import { AttemptRepo } from "./Repo.ts";

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
      const check = (q: Question, value: AnswerValue): Effect.Effect<CodeTestResult[] | null> => {
        if (q.type !== "code" && q.type !== "sql") return Effect.succeed(null);
        if (isBlank(value)) return Effect.succeed([{ testId: "blank", passed: false, output: "", error: "No answer" }]);
        const code = value as string;
        return q.type === "code"
          ? runner.runTests(q, code)
          : Effect.promise(() => runSqlChecks(q, code)).pipe(
              Effect.catch(() => Effect.succeed(null)),
              Effect.catchDefect(() => Effect.succeed(null)),
            );
      };

      // The score of an attempt that was already submitted.
      const finished = Effect.fn("AttemptService.finished")(function* (attempt: AttemptItem, quizId: string) {
        const quiz = yield* quizRepo.find(quizId);
        const detail = yield* quizRepo.detail(quiz!);
        const rows = yield* repo.answersOf(attempt.id);
        const score = scoreOf(flatQuestions(attemptPaper(detail, attempt.seed)), rows);
        return { status: attempt.status, score } satisfies Submitted;
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
              const value = q.type === "drawing" ? yield* repo.keepOwnPictures(attempt.studentId, cleaned) : cleaned;
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
        yield* hub.attemptChanged(attempt.id, input.auto ? { events, ended: input.reason ?? "time_up" } : { events });
        return { status, score };
      });

      return AttemptService.of({ submit });
    }),
  );
}
