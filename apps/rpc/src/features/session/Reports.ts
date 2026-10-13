// What the teacher reads and writes after the attempts are in: every attempt of a session, one student's
// attempt with its incidents, a class's scores, and the manual grading of an answer.
import {
  Conflict,
  NotFound,
  attemptScore,
  orderForAttempt,
  questionScore,
  quizTotals,
  type AttemptDetail,
  type AttemptStatus,
  type ClassSessionScores,
  type Incident,
} from "@examinus/contract";
import { Context, Effect, Layer } from "effect";
import { flatQuestions } from "../attempt/rules.ts";
import { toIncident } from "../live/rules.ts";
import { toQuestion } from "../quiz/mappers.ts";
import { toSession } from "./mappers.ts";
import { SessionRepo } from "./Repo.ts";
import { resultsVisible } from "./rules.ts";

export class SessionReports extends Context.Service<
  SessionReports,
  {
    // Every attempt of the session, submitted or not.
    readonly attempts: (userId: string, sessionId: string) => Effect.Effect<AttemptDetail[], NotFound>;
    // One attempt as the teacher sees it while it runs, with what the teacher did to it.
    readonly liveAttempt: (
      userId: string,
      attemptId: string,
    ) => Effect.Effect<{ detail: AttemptDetail; incidents: Incident[] }, NotFound>;
    // The sessions linked to a class and each student's score, for the class record.
    readonly classScores: (userId: string, classId: string) => Effect.Effect<ClassSessionScores[]>;
    // Sets (or clears, with null) the teacher's score in points and the feedback for one answer, then updates
    // the attempt's status: graded once nothing is left waiting.
    readonly grade: (
      userId: string,
      input: { attemptId: string; questionId: string; manualScore: number | null; feedback: string | null; reason?: string | undefined },
    ) => Effect.Effect<{ status: AttemptStatus }, NotFound | Conflict>;
  }
>()("examinus/api/SessionReports") {
  static readonly layer = Layer.effect(
    SessionReports,
    Effect.gen(function* () {
      const repo = yield* SessionRepo;

      const attempts = Effect.fn("SessionReports.attempts")(function* (userId: string, sessionId: string) {
        const { quiz } = yield* repo.ownSession(sessionId, userId);
        return yield* repo.attemptDetails(quiz, { sessionId });
      });

      const liveAttempt = Effect.fn("SessionReports.liveAttempt")(function* (userId: string, attemptId: string) {
        const { session, quiz } = yield* repo.ownAttemptOf(attemptId, userId);
        const [detail] = yield* repo.attemptDetails(quiz, { attemptId });
        const rows = yield* repo.incidentsOf(session.id, attemptId);
        return { detail: detail!, incidents: rows.map(toIncident) };
      });

      const classScores = Effect.fn("SessionReports.classScores")(function* (userId: string, classId: string) {
        const now = Date.now();
        const { rows, parts, done, answerRows } = yield* repo.classScoreData(userId, classId);
        return rows.map(({ session, quiz }): ClassSessionScores => {
          const paperParts = parts.get(quiz.id) ?? [];
          const s = toSession(session, now);
          // Each student's latest submitted attempt.
          const latest = new Map<string, (typeof done)[number]>();
          for (const x of done) {
            if (x.attempt.sessionId !== session.id || !x.rosterId) continue;
            const prev = latest.get(x.rosterId);
            if (!prev || prev.attempt.submittedAt! < x.attempt.submittedAt!) latest.set(x.rosterId, x);
          }
          return {
            sessionId: session.id,
            quizId: quiz.id,
            title: quiz.title,
            mode: session.mode,
            period: quiz.header.period,
            status: s.status,
            maxScore: quizTotals(paperParts).totalPoints,
            opensAt: s.opensAt,
            closesAt: s.closesAt,
            endedAt: s.endedAt,
            countInRecord: session.countInRecord,
            scores: [...latest].map(([studentId, { attempt }]) => {
              const paper = flatQuestions(orderForAttempt(quiz.settings, paperParts, attempt.seed));
              const score = attemptScore(paper, new Map(answerRows.filter((a) => a.attemptId === attempt.id).map((a) => [a.questionId, a])));
              return {
                studentId,
                score: score.ungraded > 0 ? null : score.score,
                submittedAt: attempt.submittedAt!.toISOString(),
              };
            }),
          };
        });
      });

      const grade = Effect.fn("SessionReports.grade")(function* (
        userId: string,
        { attemptId, questionId, manualScore, feedback, reason }: { attemptId: string; questionId: string; manualScore: number | null; feedback: string | null; reason?: string | undefined },
      ) {
        const { attempt, session, quiz } = yield* repo.ownAttemptOf(attemptId, userId);
        const question = toQuestion(yield* repo.questionOf(quiz.id, questionId));
        const before = yield* repo.answerOf(attemptId, questionId);
        // Points can't go below 0 or above what the question is worth.
        const score = manualScore === null ? null : Math.min(Math.max(manualScore, 0), question.points);
        // Exam sessions: once the results are out, every score change is logged and needs a reason.
        const released =
          session.mode === "exam" && attempt.status !== "in_progress" && resultsVisible(toSession(session, Date.now()));
        const oldScore = before ? questionScore(question, before) : 0;
        const newScore = questionScore(question, { autoScore: before?.autoScore ?? null, manualScore: score });
        const changed = oldScore !== newScore;
        if (released && changed && (reason ?? "").trim() === "")
          return yield* new Conflict({ message: "The results are released. Give the reason for changing this score." });
        return yield* repo.saveGrade({
          attempt,
          quiz,
          questionId,
          manualScore: score,
          feedback: feedback === null || feedback.trim() === "" ? null : feedback,
          change: released && changed ? { changedBy: userId, oldScore, newScore, reason: reason!.trim() } : null,
        });
      });

      return SessionReports.of({ attempts, liveAttempt, classScores, grade });
    }),
  );
}
