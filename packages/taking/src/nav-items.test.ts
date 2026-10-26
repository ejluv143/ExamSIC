import { expect, test } from "bun:test";
import type { Paper } from "@examinus/contract/attempt";
import type { StudentQuestion } from "@examinus/domain/question";
import { buildNavItems } from "./nav-items.ts";

const question = (id: string) => ({ id, type: "essay" }) as unknown as StudentQuestion;

test("a paper on one page lists every question with its answer and mark, and never blocks", () => {
  const paper = { review: [], session: { navigation: "free" } } as unknown as Paper;
  const { items, refusal } = buildNavItems({
    paper,
    questions: [question("a"), question("b")],
    answers: { a: "text" },
    marks: { b: true },
    progress: null,
    qSecondsLeft: null,
  });
  expect(items.map((i) => [i.questionId, i.number, i.answered, i.marked, i.blocked])).toEqual([
    ["a", 1, true, false, null],
    ["b", 2, false, true, null],
  ]);
  expect(refusal(1)).toBeNull();
});

test("one question at a time: the server's review fills in, the one on screen follows the answers", () => {
  const paper = {
    review: [
      { questionId: "a", answered: false, closed: false, summary: null, marked: false },
      { questionId: "b", answered: true, closed: true, summary: "old", marked: false },
    ],
    session: { navigation: "forward" },
  } as unknown as Paper;
  const { items } = buildNavItems({
    paper,
    questions: [question("a")],
    answers: { a: "typed" },
    marks: {},
    progress: { index: 0, furthest: 0 } as Paper["progress"],
    qSecondsLeft: null,
  });
  expect(items[0]).toMatchObject({ questionId: "a", answered: true, current: true });
  expect(items[1]).toMatchObject({ questionId: "b", answered: true, closed: true, summary: "old", current: false });
});
