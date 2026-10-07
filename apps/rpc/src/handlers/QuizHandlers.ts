import { NotFound, QuizRpcs, quizTotals, type Question, type QuizDraft } from "@examora/contract";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { Effect } from "effect";
import { Database, type Drizzle } from "../Database.ts";
import { bankQuestions, questions, quizParts, quizSessions, quizzes, type NewQuestion } from "../database/schemas/index.ts";
import { newId } from "../database/schemas/_helpers.ts";
import { loadParts, loadQuizDetail, toQuiz, toSession } from "../Quizzes.ts";
import { requirePermission } from "../Session.ts";

const notFound = new NotFound({ message: "That quiz doesn't exist." });

// A question as its row: the base fields have columns, the rest is the body.
const questionRow = (q: Question, id: string, partId: string, position: number): NewQuestion => {
  const { id: _id, prompt, points, topic, ...body } = q;
  return { id, partId, position, type: q.type, prompt, points, topic: topic ?? null, body: body as NewQuestion["body"] };
};

export const QuizHandlers = QuizRpcs.toLayer(
  Effect.gen(function* () {
    const db = yield* Database;

    // The signed-in teacher's own quiz, or NotFound.
    const ownQuiz = Effect.fn("ownQuiz")(function* (quizId: string, userId: string) {
      const [quiz] = yield* db.query((d) =>
        d
          .select()
          .from(quizzes)
          .where(and(eq(quizzes.id, quizId), eq(quizzes.ownerId, userId))),
      );
      return quiz ?? (yield* notFound);
    });

    // Inserts or updates a quiz with its parts and questions in one transaction. Ids the quiz already has
    // are kept; anything else gets a fresh id (a client's own ids may collide with other quizzes' rows).
    const write = (d: Drizzle, ownerId: string, draft: QuizDraft, existing: string | null) =>
      d.transaction(async (tx) => {
        const fields = {
          title: draft.title,
          description: draft.description,
          subject: draft.subject,
          subjectArea: draft.subjectArea,
          header: draft.header,
          paper: draft.paper,
          settings: draft.settings,
        };
        let quizId: string;
        const oldParts = new Set<string>();
        const oldQuestions = new Set<string>();
        if (existing) {
          quizId = existing;
          await tx.update(quizzes).set(fields).where(eq(quizzes.id, quizId));
          const parts = await tx.select({ id: quizParts.id }).from(quizParts).where(eq(quizParts.quizId, quizId));
          for (const p of parts) oldParts.add(p.id);
          if (parts.length) {
            const qs = await tx
              .select({ id: questions.id })
              .from(questions)
              .where(inArray(questions.partId, [...oldParts]));
            for (const q of qs) oldQuestions.add(q.id);
          }
        } else {
          const [row] = await tx.insert(quizzes).values({ ownerId, ...fields }).returning({ id: quizzes.id });
          quizId = row!.id;
        }

        const keptParts = new Set<string>();
        const keptQuestions = new Set<string>();
        for (const [position, part] of draft.parts.entries()) {
          const partId = oldParts.has(part.id) && !keptParts.has(part.id) ? part.id : newId("part");
          keptParts.add(partId);
          const values = {
            quizId,
            position,
            title: part.title,
            instructions: part.instructions,
            shuffleQuestions: part.shuffleQuestions,
            poolSize: part.poolSize,
          };
          await tx
            .insert(quizParts)
            .values({ id: partId, ...values })
            .onConflictDoUpdate({ target: quizParts.id, set: values });
          for (const [qPosition, q] of part.questions.entries()) {
            const id = oldQuestions.has(q.id) && !keptQuestions.has(q.id) ? q.id : newId("q");
            keptQuestions.add(id);
            const row = questionRow(q, id, partId, qPosition);
            await tx.insert(questions).values(row).onConflictDoUpdate({ target: questions.id, set: row });
          }
        }
        // Questions first, so one moved into a kept part isn't deleted with its old part.
        const droppedQuestions = [...oldQuestions].filter((id) => !keptQuestions.has(id));
        if (droppedQuestions.length) await tx.delete(questions).where(inArray(questions.id, droppedQuestions));
        const droppedParts = [...oldParts].filter((id) => !keptParts.has(id));
        if (droppedParts.length) await tx.delete(quizParts).where(inArray(quizParts.id, droppedParts));
        return quizId;
      });

    return QuizRpcs.of({
      "quiz.list": Effect.fn("quiz.list")(function* () {
        const user = yield* requirePermission({ assessment: ["read"] });
        const now = Date.now();
        return yield* db.query(async (d) => {
          const rows = await d.select().from(quizzes).where(eq(quizzes.ownerId, user.id)).orderBy(desc(quizzes.updatedAt));
          const ids = rows.map((q) => q.id);
          const parts = await loadParts(d, ids);
          const sessions = ids.length
            ? await d.select().from(quizSessions).where(inArray(quizSessions.quizId, ids)).orderBy(desc(quizSessions.createdAt))
            : [];
          return rows.map((quiz) => ({
            quiz: toQuiz(quiz),
            ...quizTotals(parts.get(quiz.id) ?? []),
            sessions: sessions.filter((s) => s.quizId === quiz.id).map((s) => toSession(s, now)),
          }));
        });
      }),

      "quiz.get": Effect.fn("quiz.get")(function* ({ quizId }) {
        const user = yield* requirePermission({ assessment: ["read"] });
        const quiz = yield* ownQuiz(quizId, user.id);
        return yield* db.query((d) => loadQuizDetail(d, quiz));
      }),

      "quiz.save": Effect.fn("quiz.save")(function* ({ draft }) {
        const user = yield* requirePermission({ assessment: [draft.id ? "update" : "create"] });
        const existing = draft.id ? (yield* ownQuiz(draft.id, user.id)).id : null;
        const quizId = yield* db.query((d) => write(d, user.id, draft, existing));
        return { quizId };
      }),

      "quiz.remove": Effect.fn("quiz.remove")(function* ({ quizId }) {
        const user = yield* requirePermission({ assessment: ["delete"] });
        yield* ownQuiz(quizId, user.id);
        yield* db.query((d) => d.delete(quizzes).where(eq(quizzes.id, quizId)));
      }),

      "quiz.duplicate": Effect.fn("quiz.duplicate")(function* ({ quizId }) {
        const user = yield* requirePermission({ assessment: ["create"] });
        const quiz = yield* ownQuiz(quizId, user.id);
        const detail = yield* db.query((d) => loadQuizDetail(d, quiz));
        const copy: QuizDraft = {
          title: `${detail.quiz.title} (copy)`,
          description: detail.quiz.description,
          subject: detail.quiz.subject,
          subjectArea: detail.quiz.subjectArea,
          header: detail.quiz.header,
          paper: detail.quiz.paper,
          settings: detail.quiz.settings,
          parts: detail.parts.map((p) => ({
            id: p.id,
            title: p.title,
            instructions: p.instructions,
            shuffleQuestions: p.shuffleQuestions,
            poolSize: p.poolSize,
            questions: p.questions,
          })),
        };
        // No existing quiz, so every part and question gets a new id.
        return { quizId: yield* db.query((d) => write(d, user.id, copy, null)) };
      }),

      "quiz.bank": Effect.fn("quiz.bank")(function* () {
        const user = yield* requirePermission({ questionBank: ["read"] });
        const rows = yield* db.query((d) =>
          d
            .select({ question: bankQuestions.question })
            .from(bankQuestions)
            .where(or(isNull(bankQuestions.ownerId), eq(bankQuestions.ownerId, user.id)))
            .orderBy(bankQuestions.createdAt, bankQuestions.id),
        );
        return rows.map((r) => r.question);
      }),
    });
  }),
);
