// What a teacher does with their own quizzes.
import { NotFound } from "@examinus/contract/errors";
import { QuizInUse, type QuizDetail, type QuizDraft, type QuizListItem } from "@examinus/contract/quiz";
import { changesGrading, quizInUseMessage } from "@examinus/domain/quiz-lock";
import { quizTotals } from "@examinus/domain/shuffle";
import { Context, Effect, Layer } from "effect";
import { toSession } from "../session/mappers.ts";
import { toQuiz } from "./mappers.ts";
import { QuizRepo } from "./Repo.ts";

const notFound = new NotFound({ message: "That quiz doesn't exist." });

export class QuizService extends Context.Service<
  QuizService,
  {
    // The user's quizzes with totals and their sessions.
    readonly list: (userId: string) => Effect.Effect<QuizListItem[]>;
    // The user's own quiz in full, or NotFound.
    readonly get: (quizId: string, userId: string) => Effect.Effect<QuizDetail, NotFound>;
    // Creates a quiz, or updates one the user owns when the draft has an id (NotFound otherwise); the quiz's id.
    // Once students have attempts, only wording may change: QuizInUse for anything grades or paper order use.
    readonly save: (userId: string, draft: QuizDraft) => Effect.Effect<string, NotFound | QuizInUse>;
    readonly remove: (quizId: string, userId: string) => Effect.Effect<void, NotFound>;
    // A copy of the user's own quiz, titled "(copy)"; the new quiz's id.
    readonly duplicate: (quizId: string, userId: string) => Effect.Effect<string, NotFound>;
  }
>()("examinus/api/QuizService") {
  static readonly layer = Layer.effect(
    QuizService,
    Effect.gen(function* () {
      const repo = yield* QuizRepo;

      // The signed-in teacher's own quiz, or NotFound.
      const own = Effect.fn("QuizService.own")(function* (quizId: string, userId: string) {
        return (yield* repo.findOwned(quizId, userId)) ?? (yield* notFound);
      });

      return QuizService.of({
        list: Effect.fn("QuizService.list")(function* (userId) {
          const now = Date.now();
          const rows = yield* repo.listOwned(userId);
          return rows.map(({ quiz, parts, sessions }) => ({
            quiz: toQuiz(quiz),
            ...quizTotals(parts),
            sessions: sessions.map((s) => toSession(s, now)),
          }));
        }),

        get: Effect.fn("QuizService.get")(function* (quizId, userId) {
          return yield* repo.detail(yield* own(quizId, userId));
        }),

        save: Effect.fn("QuizService.save")(function* (userId, draft) {
          const quiz = draft.id ? yield* own(draft.id, userId) : null;
          if (quiz && (yield* repo.hasAttempts(quiz.id))) {
            const before = yield* repo.detail(quiz);
            if (changesGrading({ settings: before.quiz.settings, parts: before.parts }, draft))
              return yield* new QuizInUse({ message: quizInUseMessage });
          }
          return yield* repo.save(userId, draft, quiz?.id ?? null);
        }),

        remove: Effect.fn("QuizService.remove")(function* (quizId, userId) {
          yield* own(quizId, userId);
          yield* repo.remove(quizId);
        }),

        duplicate: Effect.fn("QuizService.duplicate")(function* (quizId, userId) {
          const detail = yield* repo.detail(yield* own(quizId, userId));
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
          return yield* repo.save(userId, copy, null);
        }),
      });
    }),
  );
}
