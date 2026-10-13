// The quiz tables: parts and questions of quizzes, read as the contract's quiz detail.
import type { Question, QuizDetail, QuizPartWithQuestions } from "@examinus/contract";
import { asc, eq, inArray } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Database, type Db } from "../../platform/Database.ts";
import { questions, quizParts, quizzes, type QuizItem } from "../../database/schemas/index.ts";
import { toPart, toQuestion, toQuiz } from "./mappers.ts";

// Plain functions for code that already holds a `Db` (a transaction, say); `QuizRepo` wraps them as effects.
export async function loadParts(d: Db, quizIds: readonly string[]): Promise<Map<string, QuizPartWithQuestions[]>> {
  const byQuiz = new Map<string, QuizPartWithQuestions[]>();
  if (quizIds.length === 0) return byQuiz;
  const partRows = await d
    .select()
    .from(quizParts)
    .where(inArray(quizParts.quizId, [...quizIds]))
    .orderBy(asc(quizParts.position));
  const questionRows = partRows.length
    ? await d
        .select()
        .from(questions)
        .where(inArray(questions.partId, partRows.map((p) => p.id)))
        .orderBy(asc(questions.position))
    : [];
  const byPart = new Map<string, Question[]>();
  for (const q of questionRows) {
    const list = byPart.get(q.partId) ?? [];
    list.push(toQuestion(q));
    byPart.set(q.partId, list);
  }
  for (const p of partRows) {
    const list = byQuiz.get(p.quizId) ?? [];
    list.push({ ...toPart(p), questions: byPart.get(p.id) ?? [] });
    byQuiz.set(p.quizId, list);
  }
  return byQuiz;
}

export async function loadQuizDetail(d: Db, quiz: QuizItem): Promise<QuizDetail> {
  const parts = (await loadParts(d, [quiz.id])).get(quiz.id) ?? [];
  return { quiz: toQuiz(quiz), parts };
}

export class QuizRepo extends Context.Service<
  QuizRepo,
  {
    // The quiz row, or null.
    readonly find: (quizId: string) => Effect.Effect<QuizItem | null>;
    // The parts (with their questions, in order) of each quiz; quizzes without parts are absent.
    readonly parts: (quizIds: readonly string[]) => Effect.Effect<Map<string, QuizPartWithQuestions[]>>;
    readonly detail: (quiz: QuizItem) => Effect.Effect<QuizDetail>;
  }
>()("examinus/api/QuizRepo") {
  static readonly layer = Layer.effect(
    QuizRepo,
    Effect.gen(function* () {
      const db = yield* Database;
      return QuizRepo.of({
        find: Effect.fn("QuizRepo.find")(function* (quizId) {
          const [quiz] = yield* db.query((d) => d.select().from(quizzes).where(eq(quizzes.id, quizId)));
          return quiz ?? null;
        }),
        parts: Effect.fn("QuizRepo.parts")(function* (quizIds) {
          return yield* db.query((d) => loadParts(d, quizIds));
        }),
        detail: Effect.fn("QuizRepo.detail")(function* (quiz) {
          return yield* db.query((d) => loadQuizDetail(d, quiz));
        }),
      });
    }),
  );
}
