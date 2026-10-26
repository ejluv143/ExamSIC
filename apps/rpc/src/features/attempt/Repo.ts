// The attempt tables: attempts, their answers, code results, typing and integrity events.
import { type Accommodations } from "@examinus/domain/accommodations";
import { type CoachResult } from "@examinus/domain/analytics";
import { drawingAssetIds, encodeDrawingAnswer, parseDrawingAnswer } from "@examinus/domain/drawing";
import { type AttemptClient } from "@examinus/domain/client";
import { tooFastMs } from "@examinus/domain/integrity";
import { kindOf } from "@examinus/domain/kinds";
import { type CodeTestResult } from "@examinus/domain/kinds/base";
import { type Question } from "@examinus/domain/question";
import {
  type AnswerValue,
  type AttemptStatus,
  type IntegrityEvent,
  type IntegrityEventType,
  type TypingEdits,
  hasAnswer,
} from "@examinus/domain/quiz";
import { and, asc, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database, type Db } from "../../platform/Database.ts";
import { count, integrityEvents as integrityEventCount } from "../../platform/Metrics.ts";
import {
  answerHistory,
  answers,
  assets,
  attempts,
  codeResults,
  integrityEvents,
  questions,
  quizParts,
  quizSessions,
  quizzes,
  sessionStudents,
  typingEdits,
  type AnswerItem,
  type AttemptItem,
  type QuizItem,
  type QuizSessionItem,
} from "../../database/schemas/index.ts";
import { toQuestion } from "../quiz/mappers.ts";
import { cleanTyping, keepsHistory, toEventRow, type Player } from "./rules.ts";

// Stores the time used on one question, keeping its answer and mark.
const setShown = (tx: Db, attemptId: string, questionId: string, shownMs: number) =>
  tx
    .insert(answers)
    .values({ attemptId, questionId, value: null, shownMs })
    .onConflictDoUpdate({ target: [answers.attemptId, answers.questionId], set: { shownMs } });

// A player without an organization (a guest) plays quizzes of any organization; the rest only those of theirs. Players
// in the personal space also pass here: a personal-space quiz is reached only through its session, which `game.find` gates.
const inOrganization = (player: Player) => (player.organizationId === null ? undefined : eq(quizzes.organizationId, player.organizationId));

// A drawing answer keeps only the pictures the student uploaded and confirmed themselves.
export async function keepOwnPictures(d: Db, player: Player, value: AnswerValue): Promise<AnswerValue> {
  if (typeof value !== "string") return value;
  const drawing = parseDrawingAnswer(value);
  const ids = drawingAssetIds(drawing);
  if (ids.length === 0) return value;
  const rows = await d
    .select({ id: assets.id })
    .from(assets)
    .where(
      and(
        inArray(assets.id, ids),
        eq(assets.ownerId, player.id),
        player.organizationId === null ? undefined : eq(assets.organizationId, player.organizationId),
        eq(assets.purpose, "answer"),
        eq(assets.status, "ready"),
      ),
    );
  const own = new Set(rows.map((r) => r.id));
  const kept = {
    strokes: drawing.strokes,
    assetId: drawing.assetId !== null && own.has(drawing.assetId) ? drawing.assetId : null,
    photos: drawing.photos.filter((id) => own.has(id)),
  };
  return kept.strokes.length === 0 && kept.assetId === null && kept.photos.length === 0 ? null : encodeDrawingAnswer(kept);
}

// One question's final answer, as `AttemptService.submit` settled it.
export type GradedAnswer = {
  q: Question;
  value: AnswerValue;
  results: CodeTestResult[] | null;
  auto: number | null;
};

export type SubmitWrite = {
  attempt: AttemptItem;
  session: QuizSessionItem;
  status: AttemptStatus;
  now: Date;
  graded: readonly GradedAnswer[];
  // What was autosaved before, by question id.
  saved: ReadonlyMap<string, AnswerItem>;
  typing: Readonly<Record<string, TypingEdits>> | undefined;
  events: readonly IntegrityEvent[];
};

// A student's attempt with the session it belongs to and that session's quiz.
export type OwnedAttempt = { attempt: AttemptItem; session: QuizSessionItem; quiz: QuizItem; accommodations: Accommodations | null };

// A session the student is on the roster of, with its quiz.
export type RosterRow = { session: QuizSessionItem; quiz: QuizItem; accommodations: Accommodations | null };

export type NewAttempt = {
  sessionId: string;
  studentId: string;
  attemptNumber: number;
  deviceId: string | undefined;
  client: AttemptClient;
  ip: string | null;
  now: Date;
  pledgeAccepted: boolean;
};

// The attempt's check-in: what changed besides the time.
export type CheckIn = { lastSeenAt: Date; ip?: string | null; deviceId?: string };

// One answer save from the student's page.
export type SaveAnswerWrite = {
  attemptId: string;
  mode: QuizSessionItem["mode"];
  question: Question;
  value: AnswerValue;
  typing: TypingEdits | undefined;
  spentMs: number | null;
  now: Date;
};

export type MarkWrite = {
  attemptId: string;
  questionId: string;
  marked: boolean;
  // The questions on the student's paper, and the limit on marked ones (null: no limit).
  onPaper: ReadonlySet<string>;
  max: number | null;
};

export class AttemptRepo extends Context.Service<
  AttemptRepo,
  {
    readonly find: (attemptId: string) => Effect.Effect<AttemptItem | null>;
    // The session an attempt belongs to.
    readonly sessionOf: (sessionId: string) => Effect.Effect<QuizSessionItem | null>;
    readonly answersOf: (attemptId: string) => Effect.Effect<AnswerItem[]>;
    // The answers of several attempts at once.
    readonly answersOfMany: (attemptIds: readonly string[]) => Effect.Effect<AnswerItem[]>;
    // The answers with the typing recorded for each (null: none).
    readonly answersWithTyping: (attemptId: string) => Effect.Effect<{ answer: AnswerItem; edits: TypingEdits | null }[]>;
    // Every saved version of the attempt's answers, oldest first.
    readonly history: (attemptId: string) => Effect.Effect<{ questionId: string; value: AnswerValue }[]>;
    readonly keepOwnPictures: (player: Player, value: AnswerValue) => Effect.Effect<AnswerValue>;
    // Stores a submission in one transaction. Whoever flips the status first submits; false: someone else already did,
    // and nothing was written.
    readonly submit: (write: SubmitWrite) => Effect.Effect<boolean>;
    // A session the student is on the roster of, or null.
    readonly rosterSession: (sessionId: string, player: Player) => Effect.Effect<RosterRow | null>;
    // Records the student's first visit to a session (the lobby, or the paper). True the first time.
    readonly markJoined: (sessionId: string, player: Player, now: Date) => Effect.Effect<boolean>;
    // Every session the student is on the roster of, by closing time.
    readonly roster: (player: Player) => Effect.Effect<RosterRow[]>;
    // The student's own attempt with its session and quiz, or null.
    readonly ownAttempt: (attemptId: string, player: Player) => Effect.Effect<OwnedAttempt | null>;
    // The student's attempts in one session, latest submission first.
    readonly attemptsOf: (sessionId: string, userId: string) => Effect.Effect<AttemptItem[]>;
    // The student's attempts in these sessions; `submittedOnly` leaves out the one in progress.
    readonly attemptsIn: (userId: string, sessionIds: readonly string[], submittedOnly: boolean) => Effect.Effect<AttemptItem[]>;
    // The attempts of the session's other students.
    readonly othersIn: (attempt: AttemptItem) => Effect.Effect<AttemptItem[]>;
    // The attempt in progress, or null.
    readonly openOf: (sessionId: string, userId: string) => Effect.Effect<AttemptItem | null>;
    // Creates the attempt; null when a second request created it first.
    readonly create: (attempt: NewAttempt) => Effect.Effect<AttemptItem | null>;
    // Whether a `device_changed` event was logged since then.
    readonly deviceChangedSince: (attemptId: string, since: Date) => Effect.Effect<boolean>;
    readonly addEvent: (attemptId: string, type: IntegrityEventType, at: Date, durationMs?: number) => Effect.Effect<void>;
    readonly addEvents: (attemptId: string, events: readonly IntegrityEvent[]) => Effect.Effect<void>;
    readonly checkIn: (attemptId: string, change: CheckIn) => Effect.Effect<void>;
    // Stores where the student is, and the time used up on the questions that ran out (`shown`: ms by question id).
    readonly moveTo: (
      attemptId: string,
      at: { questionIndex: number; furthestIndex: number; startedAt: Date },
      shown: readonly { questionId: string; shownMs: number }[],
    ) => Effect.Effect<void>;
    // The question, when it belongs to the quiz.
    readonly questionOf: (quizId: string, questionId: string) => Effect.Effect<Question | null>;
    readonly saveAnswer: (write: SaveAnswerWrite) => Effect.Effect<void>;
    // Marks or unmarks a question for review; false: the limit of marked questions is reached.
    readonly setMark: (write: MarkWrite) => Effect.Effect<boolean>;
    readonly saveCoachReport: (attemptId: string, report: { key: string; result: CoachResult }) => Effect.Effect<void>;
  }
>()("examinus/api/AttemptRepo") {
  static readonly layer = Layer.effect(
    AttemptRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return AttemptRepo.of({
        find: Effect.fn("AttemptRepo.find")(function* (attemptId) {
          const [attempt] = yield* db.query((d) => d.select().from(attempts).where(eq(attempts.id, attemptId)));
          return attempt ?? null;
        }),
        sessionOf: Effect.fn("AttemptRepo.sessionOf")(function* (sessionId) {
          const [session] = yield* db.query((d) => d.select().from(quizSessions).where(eq(quizSessions.id, sessionId)));
          return session ?? null;
        }),
        answersOf: Effect.fn("AttemptRepo.answersOf")(function* (attemptId) {
          return yield* db.query((d) => d.select().from(answers).where(eq(answers.attemptId, attemptId)));
        }),
        keepOwnPictures: Effect.fn("AttemptRepo.keepOwnPictures")(function* (player, value) {
          return yield* db.query((d) => keepOwnPictures(d, player, value));
        }),
        answersOfMany: Effect.fn("AttemptRepo.answersOfMany")(function* (attemptIds) {
          if (attemptIds.length === 0) return [];
          return yield* db.query((d) => d.select().from(answers).where(inArray(answers.attemptId, [...attemptIds])));
        }),
        answersWithTyping: Effect.fn("AttemptRepo.answersWithTyping")(function* (attemptId) {
          const rows = yield* db.query((d) =>
            d
              .select({ answer: answers, edits: typingEdits.edits })
              .from(answers)
              .leftJoin(typingEdits, eq(typingEdits.answerId, answers.id))
              .where(eq(answers.attemptId, attemptId)),
          );
          return rows;
        }),
        history: Effect.fn("AttemptRepo.history")(function* (attemptId) {
          return yield* db.query((d) =>
            d.select().from(answerHistory).where(eq(answerHistory.attemptId, attemptId)).orderBy(asc(answerHistory.savedAt)),
          );
        }),
        rosterSession: Effect.fn("AttemptRepo.rosterSession")(function* (sessionId, player) {
          const [row] = yield* db.query((d) =>
            d
              .select({ session: quizSessions, quiz: quizzes, accommodations: sessionStudents.accommodations })
              .from(sessionStudents)
              .innerJoin(quizSessions, eq(sessionStudents.sessionId, quizSessions.id))
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .where(and(eq(sessionStudents.studentId, player.id), isNull(sessionStudents.removedAt), eq(quizSessions.id, sessionId), inOrganization(player))),
          );
          return row ?? null;
        }),
        markJoined: Effect.fn("AttemptRepo.markJoined")(function* (sessionId, player, now) {
          const rows = yield* db.query((d) =>
            d
              .update(sessionStudents)
              .set({ joinedAt: now })
              .where(and(eq(sessionStudents.sessionId, sessionId), eq(sessionStudents.studentId, player.id), isNull(sessionStudents.joinedAt)))
              .returning({ sessionId: sessionStudents.sessionId }),
          );
          return rows.length > 0;
        }),
        roster: Effect.fn("AttemptRepo.roster")(function* (player) {
          return yield* db.query((d) =>
            d
              .select({ session: quizSessions, quiz: quizzes, accommodations: sessionStudents.accommodations })
              .from(sessionStudents)
              .innerJoin(quizSessions, eq(sessionStudents.sessionId, quizSessions.id))
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .where(and(eq(sessionStudents.studentId, player.id), isNull(sessionStudents.removedAt), inOrganization(player)))
              .orderBy(asc(quizSessions.closesAt), desc(quizSessions.createdAt)),
          );
        }),
        ownAttempt: Effect.fn("AttemptRepo.ownAttempt")(function* (attemptId, player) {
          const [row] = yield* db.query((d) =>
            d
              .select({ attempt: attempts, session: quizSessions, quiz: quizzes, accommodations: sessionStudents.accommodations })
              .from(attempts)
              .leftJoin(sessionStudents, and(eq(sessionStudents.sessionId, attempts.sessionId), eq(sessionStudents.studentId, attempts.studentId)))
              .innerJoin(quizSessions, eq(attempts.sessionId, quizSessions.id))
              .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
              .where(and(eq(attempts.id, attemptId), eq(attempts.studentId, player.id), inOrganization(player))),
          );
          return row ?? null;
        }),
        attemptsOf: Effect.fn("AttemptRepo.attemptsOf")(function* (sessionId, userId) {
          return yield* db.query((d) =>
            d
              .select()
              .from(attempts)
              .where(and(eq(attempts.sessionId, sessionId), eq(attempts.studentId, userId)))
              .orderBy(desc(attempts.submittedAt)),
          );
        }),
        attemptsIn: Effect.fn("AttemptRepo.attemptsIn")(function* (userId, sessionIds, submittedOnly) {
          if (sessionIds.length === 0) return [];
          return yield* db.query((d) =>
            d
              .select()
              .from(attempts)
              .where(
                and(
                  eq(attempts.studentId, userId),
                  inArray(attempts.sessionId, [...sessionIds]),
                  submittedOnly ? ne(attempts.status, "in_progress") : undefined,
                ),
              ),
          );
        }),
        othersIn: Effect.fn("AttemptRepo.othersIn")(function* (attempt) {
          return yield* db.query((d) =>
            d
              .select()
              .from(attempts)
              .where(and(eq(attempts.sessionId, attempt.sessionId), ne(attempts.studentId, attempt.studentId))),
          );
        }),
        openOf: Effect.fn("AttemptRepo.openOf")(function* (sessionId, userId) {
          const [row] = yield* db.query((d) =>
            d
              .select()
              .from(attempts)
              .where(and(eq(attempts.sessionId, sessionId), eq(attempts.studentId, userId), eq(attempts.status, "in_progress"))),
          );
          return row ?? null;
        }),
        create: Effect.fn("AttemptRepo.create")(function* (attempt) {
          const [created] = yield* db.query((d) =>
            d
              .insert(attempts)
              .values({
                sessionId: attempt.sessionId,
                studentId: attempt.studentId,
                attemptNumber: attempt.attemptNumber,
                deviceId: attempt.deviceId,
                client: attempt.client,
                ip: attempt.ip,
                lastSeenAt: attempt.now,
                questionStartedAt: attempt.now,
                pledgeAcceptedAt: attempt.pledgeAccepted ? attempt.now : null,
              })
              .onConflictDoNothing()
              .returning(),
          );
          return created ?? null;
        }),
        deviceChangedSince: Effect.fn("AttemptRepo.deviceChangedSince")(function* (attemptId, since) {
          const [recent] = yield* db.query((d) =>
            d
              .select({ id: integrityEvents.id })
              .from(integrityEvents)
              .where(and(eq(integrityEvents.attemptId, attemptId), eq(integrityEvents.type, "device_changed"), gt(integrityEvents.at, since))),
          );
          return recent !== undefined;
        }),
        addEvent: Effect.fn("AttemptRepo.addEvent")(function* (attemptId, type, at, durationMs) {
          yield* db.query((d) => d.insert(integrityEvents).values({ attemptId, type, at, durationMs: durationMs ?? null }));
          yield* count(integrityEventCount, { type });
        }),
        addEvents: Effect.fn("AttemptRepo.addEvents")(function* (attemptId, events) {
          yield* db.query((d) => d.insert(integrityEvents).values(events.map((e) => toEventRow(attemptId, e))));
          // By type: a fixed set, so safe as a metric label.
          yield* Effect.forEach(events, (e) => count(integrityEventCount, { type: e.type }), { discard: true });
        }),
        checkIn: Effect.fn("AttemptRepo.checkIn")(function* (attemptId, change) {
          yield* db.query((d) =>
            d
              .update(attempts)
              .set({
                lastSeenAt: change.lastSeenAt,
                ...(change.ip === undefined ? {} : { ip: change.ip }),
                ...(change.deviceId === undefined ? {} : { deviceId: change.deviceId }),
              })
              .where(eq(attempts.id, attemptId)),
          );
        }),
        moveTo: Effect.fn("AttemptRepo.moveTo")(function* (attemptId, at, shown) {
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              await tx
                .update(attempts)
                .set({ questionIndex: at.questionIndex, furthestIndex: at.furthestIndex, questionStartedAt: at.startedAt })
                .where(eq(attempts.id, attemptId));
              for (const s of shown) await setShown(tx, attemptId, s.questionId, s.shownMs);
            }),
          );
        }),
        questionOf: Effect.fn("AttemptRepo.questionOf")(function* (quizId, questionId) {
          const [row] = yield* db.query((d) =>
            d
              .select({ question: questions })
              .from(questions)
              .innerJoin(quizParts, eq(questions.partId, quizParts.id))
              .where(and(eq(questions.id, questionId), eq(quizParts.quizId, quizId))),
          );
          return row ? toQuestion(row.question) : null;
        }),
        saveAnswer: Effect.fn("AttemptRepo.saveAnswer")(function* ({ attemptId, mode, question, value, typing, spentMs, now }) {
          const questionId = question.id;
          const [before] = yield* db.query((d) =>
            d.select({ value: answers.value }).from(answers).where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId))),
          );
          yield* db.query((d) =>
            d.transaction(async (tx) => {
              const [saved] = await tx
                .insert(answers)
                .values({ attemptId, questionId, value, answeredAt: now, timeSpentMs: spentMs })
                .onConflictDoUpdate({
                  target: [answers.attemptId, answers.questionId],
                  set: { value, answeredAt: now, ...(spentMs === null ? {} : { timeSpentMs: spentMs }) },
                })
                .returning({ id: answers.id });
              // Exam and quiz sessions keep every save: the integrity report shows how an answer changed, and the result
              // page counts how often a choice was switched.
              if (keepsHistory(mode)) await tx.insert(answerHistory).values({ attemptId, questionId, value, savedAt: now });
              if (typing && kindOf(question).typing) {
                const edits = cleanTyping(typing);
                await tx
                  .insert(typingEdits)
                  .values({ answerId: saved!.id, edits })
                  .onConflictDoUpdate({ target: typingEdits.answerId, set: { edits } });
              }
              // The first answer to a question that came faster than anyone can read it.
              if (!(before && hasAnswer(before.value ?? null)) && spentMs !== null && spentMs < tooFastMs && hasAnswer(value))
                await tx.insert(integrityEvents).values({ attemptId, type: "too_fast", at: now, durationMs: spentMs });
            }),
          );
        }),
        setMark: Effect.fn("AttemptRepo.setMark")(function* ({ attemptId, questionId, marked, onPaper, max }) {
          return yield* db.query((d) =>
            d.transaction(async (tx) => {
              if (!marked) {
                await tx
                  .update(answers)
                  .set({ markedForReview: false })
                  .where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId)));
                return true;
              }
              // The attempt's row is locked so two marks at once can't both slip under the limit.
              await tx.select({ id: attempts.id }).from(attempts).where(eq(attempts.id, attemptId)).for("update");
              if (max !== null) {
                const others = await tx
                  .select({ questionId: answers.questionId })
                  .from(answers)
                  .where(and(eq(answers.attemptId, attemptId), eq(answers.markedForReview, true), ne(answers.questionId, questionId)));
                if (others.filter((r) => onPaper.has(r.questionId)).length >= max) return false;
              }
              await tx
                .insert(answers)
                .values({ attemptId, questionId, value: null, markedForReview: true })
                .onConflictDoUpdate({ target: [answers.attemptId, answers.questionId], set: { markedForReview: true } });
              return true;
            }),
          );
        }),
        saveCoachReport: Effect.fn("AttemptRepo.saveCoachReport")(function* (attemptId, report) {
          yield* db.query((d) => d.update(attempts).set({ coachReport: report }).where(eq(attempts.id, attemptId)));
        }),
        submit: Effect.fn("AttemptRepo.submit")(function* ({ attempt, session, status, now, graded, saved, typing, events }) {
          const won = yield* db.query((d) =>
            d.transaction(async (tx) => {
              // Whoever flips the status first submits; a second submit (or the job) changes nothing.
              const flipped = await tx
                .update(attempts)
                .set({ status, submittedAt: now })
                .where(and(eq(attempts.id, attempt.id), eq(attempts.status, "in_progress")))
                .returning({ id: attempts.id });
              if (flipped.length === 0) return false;
              for (const g of graded) {
                const [row] = await tx
                  .insert(answers)
                  .values({
                    attemptId: attempt.id,
                    questionId: g.q.id,
                    value: g.value,
                    correct: g.auto === null ? null : g.auto === 1,
                    autoScore: g.auto,
                    answeredAt: now,
                  })
                  .onConflictDoUpdate({
                    target: [answers.attemptId, answers.questionId],
                    set: { value: g.value, correct: g.auto === null ? null : g.auto === 1, autoScore: g.auto },
                  })
                  .returning({ id: answers.id });
                // Exam and quiz sessions keep every version of an answer; the final one may differ from the last autosave.
                if (keepsHistory(session.mode) && JSON.stringify(g.value) !== JSON.stringify(saved.get(g.q.id)?.value ?? null))
                  await tx.insert(answerHistory).values({ attemptId: attempt.id, questionId: g.q.id, value: g.value, savedAt: now });
                if (g.results) {
                  await tx
                    .insert(codeResults)
                    .values({ answerId: row!.id, results: g.results })
                    .onConflictDoUpdate({ target: codeResults.answerId, set: { results: g.results } });
                }
                const edits = typing?.[g.q.id];
                if (kindOf(g.q).typing && edits) {
                  await tx
                    .insert(typingEdits)
                    .values({ answerId: row!.id, edits: cleanTyping(edits) })
                    .onConflictDoUpdate({ target: typingEdits.answerId, set: { edits: cleanTyping(edits) } });
                }
              }
              if (events.length) await tx.insert(integrityEvents).values(events.map((e) => toEventRow(attempt.id, e)));
              return true;
            }),
          );
          if (won) yield* Effect.forEach(events, (e) => count(integrityEventCount, { type: e.type }), { discard: true });
          return won;
        }),
      });
    }),
  );
}
