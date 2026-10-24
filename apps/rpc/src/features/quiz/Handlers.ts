import { QuizRpcs } from "@examinus/contract/quiz";
import { Effect } from "effect";
import { requireActor } from "../auth/Session.ts";
import { QuizService } from "./Service.ts";

export const QuizHandlers = QuizRpcs.toLayer(
  Effect.gen(function* () {
    const quizzes = yield* QuizService;

    return QuizRpcs.of({
      "quiz.list": Effect.fn("quiz.list")(function* () {
        const me = yield* requireActor({ assessment: ["read"] });
        return yield* quizzes.list(me.actor);
      }),

      "quiz.get": Effect.fn("quiz.get")(function* ({ quizId }) {
        const me = yield* requireActor({ assessment: ["read"] });
        return yield* quizzes.get(quizId, me.actor);
      }),

      "quiz.save": Effect.fn("quiz.save")(function* ({ draft }) {
        const me = yield* requireActor({ assessment: [draft.id ? "update" : "create"] });
        return { quizId: yield* quizzes.save(me.actor, draft) };
      }),

      "quiz.remove": Effect.fn("quiz.remove")(function* ({ quizId }) {
        const me = yield* requireActor({ assessment: ["delete"] });
        yield* quizzes.remove(quizId, me.actor);
      }),

      "quiz.duplicate": Effect.fn("quiz.duplicate")(function* ({ quizId }) {
        const me = yield* requireActor({ assessment: ["create"] });
        return { quizId: yield* quizzes.duplicate(quizId, me.actor) };
      }),
    });
  }),
);
