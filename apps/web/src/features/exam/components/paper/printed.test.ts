import { expect, test } from "bun:test";
import { newQuestion } from "@/features/quiz/question-defaults";
import { emptyPart, type EditorQuiz } from "@/features/quiz/quiz-editor";
import { printedParts } from "./printed";

const part = (id: string, count: number, poolSize: number | null = null) => ({
  ...emptyPart(id),
  id,
  poolSize,
  questions: Array.from({ length: count }, (_, i) => newQuestion("true_false", `${id}${i}`)),
});

test("the paper numbers only what a pool draws, skips empty parts, and runs on across parts", () => {
  const quiz = { parts: [part("a", 2), part("empty", 0), part("pool", 4, 2), part("c", 1)] } as unknown as EditorQuiz;
  const printed = printedParts(quiz);
  expect(printed.map((p) => [p.part.id, p.number, p.start, p.questions.length])).toEqual([
    ["a", 1, 1, 2],
    ["pool", 2, 3, 2],
    ["c", 3, 5, 1],
  ]);
});
