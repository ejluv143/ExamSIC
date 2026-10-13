// What a teacher does to an exam attempt: let a student back in on another device, grant a retake, and read the
// exam record (the attempt with everything that happened to it).
import { Conflict, NotFound, type AttemptDetail, type ExamRecord } from "@examinus/contract";
import { Context, Effect, Layer } from "effect";
import { LiveHub } from "../live/Service.ts";
import { toIncident } from "../live/rules.ts";
import { SessionRepo } from "../session/Repo.ts";
import { sessionStatus } from "../session/rules.ts";
import { ExamRepo } from "./Repo.ts";

export class ExamService extends Context.Service<
  ExamService,
  {
    // Lets a student whose attempt is in progress back in: the next browser to check in becomes the attempt's browser.
    readonly allowBackIn: (attemptId: string, teacherId: string) => Effect.Effect<void, NotFound | Conflict>;
    // Grants a student one more attempt in an exam session; the reason is kept in the record.
    readonly grantRetake: (attemptId: string, teacherId: string, reason: string) => Effect.Effect<void, NotFound | Conflict>;
    readonly record: (attemptId: string, teacherId: string) => Effect.Effect<ExamRecord, NotFound>;
  }
>()("examinus/api/ExamService") {
  static readonly layer = Layer.effect(
    ExamService,
    Effect.gen(function* () {
      const repo = yield* ExamRepo;
      const sessions = yield* SessionRepo;
      const hub = yield* LiveHub;

      const allowBackIn = Effect.fn("ExamService.allowBackIn")(function* (attemptId: string, teacherId: string) {
        const { attempt, session } = yield* sessions.ownAttemptOf(attemptId, teacherId);
        if (attempt.status !== "in_progress") return yield* new Conflict({ message: "That student already submitted." });
        const exam = session.mode === "exam";
        // The next browser to check in becomes the attempt's browser. In an exam the approval also restarts the
        // grace period, so the student isn't refused again for the time they waited.
        yield* repo.releaseDevice(attemptId, exam);
        yield* hub.record({
          sessionId: attempt.sessionId,
          attemptId,
          actorId: teacherId,
          kind: exam ? "device_switch_allowed" : "allow_back_in",
        });
        yield* hub.attemptChanged(attemptId);
      });

      const grantRetake = Effect.fn("ExamService.grantRetake")(function* (attemptId: string, teacherId: string, reason: string) {
        const { attempt, session } = yield* sessions.ownAttemptOf(attemptId, teacherId);
        if (session.mode !== "exam") return yield* new Conflict({ message: "Retakes are granted in exam sessions." });
        if (session.attemptsAllowed === null) return yield* new Conflict({ message: "This exam already allows unlimited attempts." });
        if (sessionStatus(session, Date.now()) === "ended") return yield* new Conflict({ message: "This session has ended." });
        if (reason.trim() === "") return yield* new Conflict({ message: "Give the reason for the retake." });
        const statuses = yield* repo.statusesOf(attempt.sessionId, attempt.studentId);
        if (statuses.some((s) => s === "in_progress")) return yield* new Conflict({ message: "That student is still taking the exam." });
        yield* hub.record({ sessionId: attempt.sessionId, attemptId, actorId: teacherId, kind: "retake_granted", message: reason.trim() });
        yield* hub.attemptChanged(attemptId);
      });

      const record = Effect.fn("ExamService.record")(function* (attemptId: string, teacherId: string) {
        const { session, quiz } = yield* sessions.ownAttemptOf(attemptId, teacherId);
        const [detail] = yield* sessions.attemptDetails(quiz, { attemptId });
        const { incidents, history, changes } = yield* repo.record(session.id, attemptId);
        return {
          detail: detail as AttemptDetail,
          incidents: incidents.map(toIncident),
          history: history.map((h) => ({ questionId: h.questionId, value: h.value ?? null, savedAt: h.savedAt.toISOString() })),
          gradeChanges: changes.map(({ change, questionId, by }) => ({
            id: change.id,
            questionId,
            changedBy: by,
            oldScore: change.oldScore,
            newScore: change.newScore,
            reason: change.reason,
            at: change.at.toISOString(),
          })),
        };
      });

      return ExamService.of({ allowBackIn, grantRetake, record });
    }),
  );
}
