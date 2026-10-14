import { describe, expect, test } from "bun:test";
import type { Question } from "./question.ts";
import { changesGrading } from "./quiz-lock.ts";
import type { QuizSettings } from "./quiz.ts";

const settings: QuizSettings = { shuffleQuestions: false, shuffleChoices: false, shuffleParts: false };

const question = (id: string, over: Partial<Question> = {}): Question =>
  ({
    id,
    prompt: `Question ${id}`,
    points: 1,
    gamePoints: "standard",
    partialCredit: true,
    type: "true_false",
    answer: true,
    ...over,
  }) as Question;

const quiz = (questions: Question[], over: Partial<{ settings: QuizSettings; poolSize: number | null }> = {}) => ({
  settings: over.settings ?? settings,
  parts: [{ id: "p1", shuffleQuestions: false, poolSize: over.poolSize ?? null, questions }],
});

const before = quiz([question("a"), question("b")]);

describe("changesGrading", () => {
  test("fixing the wording of a prompt or a topic changes nothing graded", () => {
    expect(changesGrading(before, quiz([question("a", { prompt: "Fixed typo" }), question("b", { topic: "Logic" })]))).toBe(false);
  });

  test("the same question with its keys in another order is the same", () => {
    const reordered = { answer: true, type: "true_false", partialCredit: true, gamePoints: "standard", points: 1, prompt: "x", id: "a" };
    expect(changesGrading(before, quiz([reordered as Question, question("b")]))).toBe(false);
  });

  test("a new answer key, other points or another type changes grades", () => {
    expect(changesGrading(before, quiz([question("a", { answer: false } as Partial<Question>), question("b")]))).toBe(true);
    expect(changesGrading(before, quiz([question("a", { points: 2 }), question("b")]))).toBe(true);
    expect(changesGrading(before, quiz([question("a", { partialCredit: false }), question("b")]))).toBe(true);
  });

  test("adding, removing or reordering questions changes grades and paper order", () => {
    expect(changesGrading(before, quiz([question("a")]))).toBe(true);
    expect(changesGrading(before, quiz([question("a"), question("b"), question("c")]))).toBe(true);
    expect(changesGrading(before, quiz([question("b"), question("a")]))).toBe(true);
  });

  test("shuffle settings and a part's pool size change paper order", () => {
    expect(changesGrading(before, quiz([question("a"), question("b")], { settings: { ...settings, shuffleChoices: true } }))).toBe(true);
    expect(changesGrading(before, quiz([question("a"), question("b")], { poolSize: 1 }))).toBe(true);
  });
});
