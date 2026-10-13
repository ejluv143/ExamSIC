// The attempt tables: attempts, their answers, code results, typing and integrity events.
import {
  drawingAssetIds,
  encodeDrawingAnswer,
  parseDrawingAnswer,
  type AnswerValue,
  type AttemptStatus,
  type CodeTestResult,
  type IntegrityEvent,
  type Question,
  type TypingEdits,
} from "@examinus/contract";
import { and, eq, inArray } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database, type Db } from "../../platform/Database.ts";
import {
  answerHistory,
  answers,
  assets,
  attempts,
  codeResults,
  integrityEvents,
  quizSessions,
  typingEdits,
  type AnswerItem,
  type AttemptItem,
  type QuizSessionItem,
} from "../../database/schemas/index.ts";
import { keepsHistory, cleanTyping, keepsTyping, toEventRow } from "./rules.ts";

// A drawing answer keeps only the pictures the student uploaded and confirmed themselves.
export async function keepOwnPictures(d: Db, studentId: string, value: AnswerValue): Promise<AnswerValue> {
  if (typeof value !== "string") return value;
  const drawing = parseDrawingAnswer(value);
  const ids = drawingAssetIds(drawing);
  if (ids.length === 0) return value;
  const rows = await d
    .select({ id: assets.id })
    .from(assets)
    .where(and(inArray(assets.id, ids), eq(assets.ownerId, studentId), eq(assets.purpose, "answer"), eq(assets.status, "ready")));
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

export class AttemptRepo extends Context.Service<
  AttemptRepo,
  {
    readonly find: (attemptId: string) => Effect.Effect<AttemptItem | null>;
    // The session an attempt belongs to.
    readonly sessionOf: (sessionId: string) => Effect.Effect<QuizSessionItem | null>;
    readonly answersOf: (attemptId: string) => Effect.Effect<AnswerItem[]>;
    readonly keepOwnPictures: (studentId: string, value: AnswerValue) => Effect.Effect<AnswerValue>;
    // Stores a submission in one transaction. Whoever flips the status first submits; false: someone else already did,
    // and nothing was written.
    readonly submit: (write: SubmitWrite) => Effect.Effect<boolean>;
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
        keepOwnPictures: Effect.fn("AttemptRepo.keepOwnPictures")(function* (studentId, value) {
          return yield* db.query((d) => keepOwnPictures(d, studentId, value));
        }),
        submit: Effect.fn("AttemptRepo.submit")(function* ({ attempt, session, status, now, graded, saved, typing, events }) {
          return yield* db.query((d) =>
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
                if (keepsTyping(g.q.type) && edits) {
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
        }),
      });
    }),
  );
}
