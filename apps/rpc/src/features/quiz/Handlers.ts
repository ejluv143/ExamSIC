import { QuizRpcs } from "@examinus/contract/quiz";
import { Effect } from "effect";
import { requirePermission } from "../auth/Session.ts";
import { QuizService } from "./Service.ts";

export const QuizHandlers = QuizRpcs.toLayer(
  Effect.gen(function* () {
    const quizzes = yield* QuizService;

    return QuizRpcs.of({
      "quiz.list": Effect.fn("quiz.list")(function* () {
        const user = yield* requirePermission({ assessment: ["read"] });
        return yield* quizzes.list(user.id);
      }),

      "quiz.get": Effect.fn("quiz.get")(function* ({ quizId }) {
        const user = yield* requirePermission({ assessment: ["read"] });
        return yield* quizzes.get(quizId, user.id);
      }),

      "quiz.save": Effect.fn("quiz.save")(function* ({ draft }) {
        const user = yield* requirePermission({ assessment: [draft.id ? "update" : "create"] });
        return { quizId: yield* quizzes.save(user.id, draft) };
      }),

      "quiz.remove": Effect.fn("quiz.remove")(function* ({ quizId }) {
        const user = yield* requirePermission({ assessment: ["delete"] });
        yield* quizzes.remove(quizId, user.id);
      }),

      "quiz.duplicate": Effect.fn("quiz.duplicate")(function* ({ quizId }) {
        const user = yield* requirePermission({ assessment: ["create"] });
        return { quizId: yield* quizzes.duplicate(quizId, user.id) };
      }),
    });
  }),
);
