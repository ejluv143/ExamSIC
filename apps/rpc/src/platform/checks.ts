// Checking a code or SQL answer against the question's tests. Which checker a question needs is in its kind
// (`checker`); the types with none are scored from their key alone and answer null here.
import { type CodeTestResult } from "@examinus/domain/kinds/base";
import { kindOf } from "@examinus/domain/kinds";
import type { CodeQuestion } from "@examinus/domain/kinds/code";
import type { SqlQuestion } from "@examinus/domain/kinds/sql";
import type { Question } from "@examinus/domain/question";
import type { AnswerValue } from "@examinus/domain/quiz";
import { Effect } from "effect";
import type { Runner } from "./Runner.ts";
import { runSqlChecks } from "./sql-grader.ts";

// Each checker takes the question of the type whose kind names it. null: nothing could check it.
const checkers = {
  runner: (runner: Runner["Service"], q: Question, code: string) => runner.runTests(q as CodeQuestion, code),
  sql: (_runner: Runner["Service"], q: Question, code: string) =>
    Effect.promise(() => runSqlChecks(q as SqlQuestion, code)).pipe(
      Effect.catch(() => Effect.succeed(null)),
      Effect.catchDefect(() => Effect.succeed(null)),
    ),
};

// Checks an answer. `blank`: the answer says nothing, which fails every test without running anything.
export const checkAnswer = (
  runner: Runner["Service"],
  q: Question,
  value: AnswerValue,
  blank: boolean,
): Effect.Effect<CodeTestResult[] | null> => {
  const checker = kindOf(q).checker;
  if (checker === undefined) return Effect.succeed(null);
  if (blank) return Effect.succeed([{ testId: "blank", passed: false, output: "", error: "No answer" }]);
  return checkers[checker](runner, q, value as string);
};
