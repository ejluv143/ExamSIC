// What the student sees after submitting: the result page and the list of scores.
import { type MyResult, type MyScore } from "@examinus/contract/attempt";
import { NotFound } from "@examinus/contract/errors";
import { assetIdsIn } from "@examinus/domain/asset";
import { paperVersion } from "@examinus/domain/exam";
import { kindOf } from "@examinus/domain/kinds";
import { toRevealQuestion } from "@examinus/domain/question";
import { questionScore } from "@examinus/domain/scoring";
import { quizTotals } from "@examinus/domain/shuffle";
import { Context, Effect, Layer } from "effect";
import type { AttemptItem } from "../../database/schemas/index.ts";
import { Assets } from "../assets/Service.ts";
import { QuizRepo } from "../quiz/Repo.ts";
import { toSession } from "../session/mappers.ts";
import { resultsVisible } from "../session/rules.ts";
import { summary, toMeta } from "./mappers.ts";
import { AttemptRepo } from "./Repo.ts";
import { attemptPaper, flatQuestions, keepsHistory, scoreOf } from "./rules.ts";
import { AttemptService } from "./Service.ts";

const noSession = new NotFound({ message: "That session doesn't exist." });

// The student's latest submitted attempt (null: none yet) and the result page built from it.
export type LatestResult = { last: AttemptItem | undefined; result: MyResult };

export class Results extends Context.Service<
  Results,
  {
    // The latest submitted attempt as the result page shows it, with what the analytics need: time on each question
    // and how often a choice was switched.
    readonly latest: (sessionId: string, userId: string) => Effect.Effect<LatestResult, NotFound>;
    readonly myScores: (userId: string) => Effect.Effect<MyScore[]>;
  }
>()("examinus/api/AttemptResults") {
  static readonly layer = Layer.effect(
    Results,
    Effect.gen(function* () {
      const repo = yield* AttemptRepo;
      const attempt = yield* AttemptService;
      const quizRepo = yield* QuizRepo;
      const assets = yield* Assets;

      const latest = Effect.fn("Results.latest")(function* (sessionId: string, userId: string) {
        const { session, quiz } = (yield* repo.rosterSession(sessionId, userId)) ?? (yield* noSession);
        const s = toSession(session, Date.now());
        const tried = yield* repo.attemptsOf(sessionId, userId);
        const last = tried.find((a) => a.status !== "in_progress");
        const visible = !!last && resultsVisible(s);
        const base = {
          session: s,
          quiz: toMeta(quiz),
          attemptsUsed: tried.length,
          startedAt: last?.startedAt.toISOString() ?? null,
          submittedAt: last?.submittedAt?.toISOString() ?? null,
          paperVersion: last ? paperVersion(last.seed) : null,
          visible,
        };
        if (!last || !visible) return { last, result: { ...base, summary: null, items: [], assetUrls: {} } satisfies MyResult };
        const detail = yield* quizRepo.detail(quiz);
        const rows = yield* repo.answersOf(last.id);
        const history = keepsHistory(session.mode) ? yield* repo.history(last.id) : [];
        const byQuestion = new Map(rows.map((r) => [r.questionId, r]));
        const parts = attemptPaper(detail, last.seed);
        const paper = flatQuestions(parts);
        const assetUrls = yield* assets.paperUrls(userId, assetIdsIn(JSON.stringify([parts, rows.map((r) => r.value)])));
        // Switches between choices: each saved answer that differs from the one before it (the first pick isn't one).
        // Only for choice questions, where a save is a deliberate pick; null where nothing was recorded.
        const saves = new Map<string, string[]>();
        for (const h of history) saves.set(h.questionId, [...(saves.get(h.questionId) ?? []), JSON.stringify(h.value)]);
        const switches = (question: (typeof paper)[number]) => {
          if (!keepsHistory(session.mode) || !kindOf(question).optionKey) return null;
          const values = saves.get(question.id) ?? [];
          if (values.length === 0) return byQuestion.has(question.id) ? null : 0;
          return values.filter((v, i) => i > 0 && v !== values[i - 1]).length;
        };
        const result = {
          ...base,
          assetUrls,
          summary: summary(scoreOf(paper, rows)),
          items: parts.flatMap((part) =>
            part.questions.map((question) => {
              const row = byQuestion.get(question.id);
              return {
                partTitle: part.title,
                // The answers stay (this is the review), but not the grading secrets (issue #14).
                question: toRevealQuestion(question),
                answer: row?.value ?? null,
                // A question the student never touched scores 0; a graded-later one is null.
                points: row ? questionScore(question, row) : 0,
                feedback: row?.feedback ?? "",
                ...(session.mode === "mastery"
                  ? { mastery: { tries: row?.tries ?? 0, mastered: row ? row.correct : false } }
                  : {}),
                timeSpentMs: row?.timeSpentMs ?? null,
                answerChanges: switches(question),
              };
            }),
          ),
        } satisfies MyResult;
        return { last, result };
      });

      const myScores = Effect.fn("Results.myScores")(function* (userId: string) {
        const now = Date.now();
        const rows = yield* repo.roster(userId);
        if (rows.length === 0) return [];
        const submitted = yield* repo.attemptsIn(userId, rows.map((r) => r.session.id), true);
        const scores = yield* attempt.latestScores(rows, submitted);
        return rows.map(({ session, quiz }): MyScore => {
          const s = toSession(session, now);
          const last = scores.latest.get(session.id);
          const score = last ? scores.scoreOf(last, quiz) : null;
          const released = !!score && resultsVisible(s) && score.ungraded === 0;
          return {
            sessionId: session.id,
            quizId: quiz.id,
            classId: session.classId,
            title: quiz.title,
            mode: session.mode,
            period: quiz.header.period,
            opensAt: s.opensAt,
            closesAt: s.closesAt,
            countInRecord: session.countInRecord,
            maxScore: quizTotals(scores.parts.get(quiz.id) ?? []).totalPoints,
            closed: s.status === "ended",
            attempted: !!last,
            score: released ? score.score : null,
            pending: !!last && !released,
          };
        });
      });

      return Results.of({ latest, myScores });
    }),
  );
}
