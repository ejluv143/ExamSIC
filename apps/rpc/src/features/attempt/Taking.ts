// Taking an attempt: the student's sessions, the paper, starting it, and moving through it.
import {
  ComputersOnly,
  type DeviceApprovalRequired,
  type MySessionItem,
  type OpenElsewhere,
  type Paper,
  type PlayInGame,
} from "@examinus/contract/attempt";
import { Conflict, Forbidden, NotFound } from "@examinus/contract/errors";
import { assetIdsIn } from "@examinus/domain/asset";
import { toStudentQuestion } from "@examinus/domain/question";
import { type AnswerValue, type Attempt, type TypingEdits } from "@examinus/domain/quiz";
import { answerGiven, markLimitMessage, moveRefusal } from "@examinus/domain/review";
import { paperRandom, quizTotals } from "@examinus/domain/shuffle";
import { Context, Effect, Layer } from "effect";
import type { AttemptItem } from "../../database/schemas/index.ts";
import { Cache } from "../../platform/Cache.ts";
import { clientIp, ipAllowed } from "../../platform/network.ts";
import { Runner } from "../../platform/Runner.ts";
import { sampleFor } from "../../platform/sql-grader.ts";
import { Assets } from "../assets/Service.ts";
import { ExamRepo } from "../exam/Repo.ts";
import { isPhoneRefused, withAllowance } from "../exam/rules.ts";
import { LiveHub } from "../live/Service.ts";
import { QuizRepo } from "../quiz/Repo.ts";
import { toSession } from "../session/mappers.ts";
import { attemptDeadline, resultsVisible } from "../session/rules.ts";
import { reviewItems, summary, toAttempt, toMeta } from "./mappers.ts";
import { AttemptRepo } from "./Repo.ts";
import { attemptPaper, computersOnlyMessage, flatQuestions, refuseGame } from "./rules.ts";
import { AttemptService } from "./Service.ts";

const noSession = new NotFound({ message: "That session doesn't exist." });

// The request headers the web app forwards (network address, browser hints).
type Headers = Readonly<Record<string, string | undefined>>;

type Refusal = Conflict | Forbidden | NotFound;
// Refusals of a call that touches an attempt in progress (see `AttemptService.guard`).
type Guarded = Refusal | DeviceApprovalRequired | OpenElsewhere;

export class Taking extends Context.Service<
  Taking,
  {
    // Every session the student is on the roster of.
    readonly mine: (userId: string) => Effect.Effect<MySessionItem[]>;
    readonly paper: (
      userId: string,
      input: { sessionId: string; deviceId?: string | undefined },
      headers: Headers,
    ) => Effect.Effect<Paper, Guarded | PlayInGame | ComputersOnly>;
    // Starts an attempt, or returns the one in progress.
    readonly start: (
      userId: string,
      input: { sessionId: string; deviceId: string; roomPassword?: string | undefined; pledgeAccepted?: boolean | undefined },
      headers: Headers,
    ) => Effect.Effect<Attempt, Guarded | PlayInGame | ComputersOnly>;
    readonly goTo: (
      userId: string,
      input: { attemptId: string; deviceId: string; index: number },
      headers: Headers,
    ) => Effect.Effect<void, Guarded | PlayInGame>;
    readonly setMarked: (
      userId: string,
      input: { attemptId: string; deviceId: string; questionId: string; marked: boolean },
      headers: Headers,
    ) => Effect.Effect<void, Guarded>;
  }
>()("examinus/api/AttemptTaking") {
  static readonly layer = Layer.effect(
    Taking,
    Effect.gen(function* () {
      const repo = yield* AttemptRepo;
      const attempt = yield* AttemptService;
      const quizRepo = yield* QuizRepo;
      const examRepo = yield* ExamRepo;
      const hub = yield* LiveHub;
      const assets = yield* Assets;
      const runner = yield* Runner;
      const cache = yield* Cache;

      // A session the signed-in student is on the roster of, or NotFound.
      const rosterSession = Effect.fn("Taking.rosterSession")(function* (sessionId: string, userId: string) {
        return (yield* repo.rosterSession(sessionId, userId)) ?? (yield* noSession);
      });

      const mine = Effect.fn("Taking.mine")(function* (userId: string) {
        const now = Date.now();
        const rows = yield* repo.roster(userId);
        if (rows.length === 0) return [];
        const sessionIds = rows.map((r) => r.session.id);
        const tried = yield* repo.attemptsIn(userId, sessionIds, false);
        const scores = yield* attempt.latestScores(rows, tried);
        const grants = yield* examRepo.grantedRetakes(userId, sessionIds);
        return rows.map(({ session, quiz }): MySessionItem => {
          const s = withAllowance(toSession(session, now), grants.get(session.id) ?? 0);
          const inSession = tried.filter((a) => a.sessionId === session.id);
          const last = scores.latest.get(session.id);
          return {
            session: s,
            quizTitle: quiz.title,
            ...quizTotals(scores.parts.get(quiz.id) ?? []),
            attemptsUsed: inSession.length,
            inProgress: inSession.some((a) => a.status === "in_progress"),
            lastSubmittedAt: last?.submittedAt?.toISOString() ?? null,
            result: last && resultsVisible(s) ? summary(scores.scoreOf(last, quiz)) : null,
          };
        });
      });

      const paper = Effect.fn("Taking.paper")(function* (
        userId: string,
        { sessionId, deviceId }: { sessionId: string; deviceId?: string | undefined },
        headers: Headers,
      ) {
        const ip = clientIp(headers);
        const { session, quiz } = yield* rosterSession(sessionId, userId);
        yield* refuseGame(session);
        if (isPhoneRefused(session.mode, session.exam, headers)) return yield* new ComputersOnly({ message: computersOnlyMessage });
        const granted = (yield* examRepo.grantedRetakes(userId, [sessionId])).get(sessionId) ?? 0;
        const now = Date.now();
        const s = withAllowance(toSession(session, now), granted);
        const tried = yield* repo.attemptsOf(sessionId, userId);
        const open = tried.find((a) => a.status === "in_progress");
        const detail = yield* quizRepo.detail(quiz);
        // The intro screen shows how big the paper is before the attempt starts.
        const base = {
          session: s,
          quiz: toMeta(quiz),
          attemptsUsed: tried.length,
          codeRunner: runner.configured,
          ...quizTotals(detail.parts),
        };

        if (!open) {
          if (s.status !== "running") return yield* new Conflict({ message: "This session isn't open." });
          if (s.attemptsAllowed !== null && tried.length >= s.attemptsAllowed)
            return yield* new Conflict({ message: "You've used all your attempts." });
          return { ...base, parts: [], attempt: null, answers: {}, typing: {}, deadline: null, progress: null, review: [], paused: false, locked: false, assetUrls: {} } satisfies Paper;
        }
        yield* attempt.requireOpen(open, session);
        yield* attempt.guard(open, session, deviceId, ip, { required: true });

        // Mastery mode serves its questions one by one through `attempt.masteryState`.
        const saved = session.mode === "mastery" ? [] : yield* repo.answersWithTyping(open.id);
        // One question at a time: only the question the student is on leaves the server.
        const ordered = session.mode === "mastery" ? [] : attemptPaper(detail, open.seed);
        const flat = flatQuestions(ordered);
        const at = session.oneQuestionAtATime && session.mode !== "mastery" ? yield* attempt.syncProgress(open, session, flat, now) : null;
        const servedId = at ? flat[at.index]?.id : undefined;
        const served = at
          ? ordered
              .map((part) => ({ ...part, questions: part.questions.filter((q) => q.id === servedId) }))
              .filter((part) => part.questions.length > 0)
          : ordered;
        // Students see what the answer query returns on the sample data, never the query itself.
        const parts = yield* Effect.forEach(served, (part) =>
          Effect.forEach(part.questions, (q) => {
            const student = toStudentQuestion(q, paperRandom(detail.quiz.settings, open.seed, q.id));
            return sampleFor(cache, q).pipe(
              Effect.map((sample) => ({ ...student, ...(sample ? { sampleResult: sample } : {}) })),
              Effect.catchDefect(() => Effect.succeed(student)),
            );
          }).pipe(Effect.map((questions) => ({ ...part, questions }))),
        );
        const typing: Record<string, TypingEdits> = {};
        const values: Record<string, AnswerValue> = {};
        for (const { answer, edits } of saved) {
          if (servedId !== undefined && answer.questionId !== servedId) continue;
          values[answer.questionId] = answer.value ?? null;
          if (edits) typing[answer.questionId] = edits;
        }
        const deadline = attemptDeadline(session, open);
        const assetUrls = yield* assets.paperUrls(userId, assetIdsIn(JSON.stringify([quiz.description, parts, values])));
        return {
          ...base,
          parts,
          attempt: toAttempt(open),
          answers: values,
          typing,
          deadline: deadline === null ? null : new Date(deadline).toISOString(),
          progress: at
            ? { index: at.index, furthest: at.furthest, deadline: at.deadline === null ? null : new Date(at.deadline).toISOString() }
            : null,
          review: reviewItems(flat, saved.map((s) => s.answer), at?.closed ?? []),
          paused: session.pausedAt !== null,
          locked: open.locked,
          assetUrls,
        } satisfies Paper;
      });

      // Flags a student who starts from the browser (or network address) another student of the session used.
      const flagSharing = Effect.fn("Taking.flagSharing")(function* (created: AttemptItem, now: Date) {
        const others = yield* repo.othersIn(created);
        const sameDevice = others.filter((o) => created.deviceId !== null && o.deviceId === created.deviceId);
        if (sameDevice.length > 0) {
          yield* attempt.notice(created.id, "shared_device", now);
          for (const o of sameDevice) yield* attempt.notice(o.id, "shared_device", now);
        }
        if (created.ip !== null && others.some((o) => o.ip === created.ip)) yield* attempt.notice(created.id, "shared_network", now);
      });

      const start = Effect.fn("Taking.start")(function* (
        userId: string,
        { sessionId, deviceId, roomPassword, pledgeAccepted }: { sessionId: string; deviceId: string; roomPassword?: string | undefined; pledgeAccepted?: boolean | undefined },
        headers: Headers,
      ) {
        const { session } = yield* rosterSession(sessionId, userId);
        yield* refuseGame(session);
        if (isPhoneRefused(session.mode, session.exam, headers)) return yield* new ComputersOnly({ message: computersOnlyMessage });
        const ip = clientIp(headers);
        const tried = yield* repo.attemptsOf(sessionId, userId);
        // Starting again (another browser, a reload) resumes the attempt and keeps its first start time.
        const open = tried.find((a) => a.status === "in_progress");
        if (open) {
          yield* attempt.requireOpen(open, session);
          yield* attempt.guard(open, session, deviceId, ip);
          return toAttempt(open);
        }
        const granted = (yield* examRepo.grantedRetakes(userId, [sessionId])).get(sessionId) ?? 0;
        const s = withAllowance(toSession(session, Date.now()), granted);
        if (s.status !== "running") return yield* new Conflict({ message: "This session isn't open." });
        if (s.attemptsAllowed !== null && tried.length >= s.attemptsAllowed)
          return yield* new Conflict({ message: "You've used all your attempts." });
        if (session.mode === "exam" && pledgeAccepted !== true)
          return yield* new Conflict({ message: "Accept the honor pledge before you start the exam." });
        if (session.lateJoinMinutes !== null && s.startedAt !== null && Date.now() > Date.parse(s.startedAt) + session.lateJoinMinutes * 60_000)
          return yield* new Conflict({ message: `It's too late to join: students could start in the first ${session.lateJoinMinutes} minutes.` });
        if (session.roomPassword !== null && (roomPassword ?? "").trim() !== session.roomPassword)
          return yield* new Forbidden({ message: "That room password isn't right." });
        if (!ipAllowed(ip, session.ipAllowlist))
          return yield* new Forbidden({ message: "This isn't on the network allowed for this session." });
        const now = new Date();
        const created = yield* repo.create({
          sessionId,
          studentId: userId,
          attemptNumber: tried.length + 1,
          deviceId,
          ip,
          now,
          pledgeAccepted: session.mode === "exam",
        });
        if (created) {
          yield* flagSharing(created, now);
          yield* hub.attemptChanged(created.id);
          return toAttempt(created);
        }
        // A second request started it first.
        const again = yield* repo.openOf(sessionId, userId);
        return again ? toAttempt(again) : yield* new Conflict({ message: "Couldn't start the attempt. Try again." });
      });

      const goTo = Effect.fn("Taking.goTo")(function* (
        userId: string,
        { attemptId, deviceId, index }: { attemptId: string; deviceId: string; index: number },
        headers: Headers,
      ) {
        const { attempt: row, session, quiz } = yield* attempt.ownAttempt(attemptId, userId);
        yield* refuseGame(session);
        yield* attempt.requireWritable(row, session);
        yield* attempt.guard(row, session, deviceId, clientIp(headers));
        if (!session.oneQuestionAtATime || session.mode === "mastery")
          return yield* new Conflict({ message: "This session shows every question at once." });
        const detail = yield* quizRepo.detail(quiz);
        const paper = flatQuestions(attemptPaper(detail, row.seed));
        const now = Date.now();
        const at = yield* attempt.syncProgress(row, session, paper, now);
        const byQuestion = new Map(at.rows.map((r) => [r.questionId, r]));
        const current = paper[at.index];
        const here = current ? byQuestion.get(current.id) : undefined;
        const target = paper[index];
        const refusal = moveRefusal({
          navigation: session.navigation,
          from: at.index,
          to: index,
          furthest: at.furthest,
          total: paper.length,
          target: { marked: !!(target && byQuestion.get(target.id)?.markedForReview), closed: at.closed[index] ?? false },
          current: {
            answered: !!current && answerGiven(current, here?.value ?? undefined),
            marked: here?.markedForReview ?? false,
            timeUp: at.deadline !== null && now > at.deadline,
          },
        });
        if (refusal !== null) return yield* new Conflict({ message: refusal });
        if (index === at.index) return;
        yield* repo.moveTo(
          attemptId,
          { questionIndex: index, furthestIndex: Math.max(at.furthest, index), startedAt: new Date(now) },
          // With a limit per question, the time used on the question being left counts against it next time.
          at.limit !== null && current
            ? [{ questionId: current.id, shownMs: Math.min(at.limit, (at.shown[at.index] ?? 0) + now - at.startedAt) }]
            : [],
        );
        yield* hub.attemptChanged(attemptId);
      });

      const setMarked = Effect.fn("Taking.setMarked")(function* (
        userId: string,
        { attemptId, deviceId, questionId, marked }: { attemptId: string; deviceId: string; questionId: string; marked: boolean },
        headers: Headers,
      ) {
        const { attempt: row, session, quiz } = yield* attempt.ownAttempt(attemptId, userId);
        yield* attempt.requireWritable(row, session);
        yield* attempt.guard(row, session, deviceId, clientIp(headers));
        if (session.mode === "mastery" || session.mode === "game")
          return yield* new Conflict({ message: "This session has no marking for review." });
        if (marked && session.maxMarked === 0)
          return yield* new Conflict({ message: "Marking questions for review is off for this session." });
        const detail = yield* quizRepo.detail(quiz);
        const paper = flatQuestions(attemptPaper(detail, row.seed));
        const index = paper.findIndex((q) => q.id === questionId);
        if (index < 0) return yield* new NotFound({ message: "That question isn't on your paper." });
        // One question at a time, a mark is what lets a student come back, so only the question they are on can get one.
        if (marked && session.oneQuestionAtATime) {
          const at = yield* attempt.syncProgress(row, session, paper, Date.now());
          if (at.index !== index) return yield* new Conflict({ message: "You can only mark the question you're on." });
        }
        const max = session.maxMarked;
        const done = yield* repo.setMark({ attemptId, questionId, marked, onPaper: new Set(paper.map((q) => q.id)), max });
        if (!done) return yield* new Conflict({ message: markLimitMessage(max ?? 0) });
        yield* hub.attemptChanged(attemptId);
      });

      return Taking.of({ mine, paper, start, goTo, setMarked });
    }),
  );
}
