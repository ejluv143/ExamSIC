import { describe, expect, test } from "bun:test";
import type { Question } from "./question.ts";
import { toStudentQuestion } from "./question.ts";
import { hashString, idRandom, mulberry32, shuffled, shuffledNotSorted } from "./random.ts";
import { orderForAttempt, paperRandom, quizTotals } from "./shuffle.ts";
import * as f from "./test-fixtures.ts";

const numbers = Array.from({ length: 20 }, (_, i) => i);
const off = { shuffleQuestions: false, shuffleChoices: false, shuffleParts: false };
const ids = (qs: readonly { id: string }[]) => qs.map((q) => q.id);

describe("seeded randomness", () => {
  test("the same seed gives the same numbers, in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  test("different seeds give different numbers", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  test("string hashes are stable and tell ids apart", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
    expect(idRandom("q1")()).toBe(idRandom("q1")());
    expect(idRandom("q1")()).not.toBe(idRandom("q2")());
  });

  test("shuffled keeps every item, leaves the input alone, and repeats for a seed", () => {
    const input = Object.freeze([...numbers]);
    const once = shuffled(input, mulberry32(7));
    expect([...once].sort((a, b) => a - b)).toEqual(numbers);
    expect(once).not.toEqual(numbers);
    expect(shuffled(input, mulberry32(7))).toEqual(once);
    expect(shuffled(input, mulberry32(8))).not.toEqual(once);
    expect(shuffled([], mulberry32(1))).toEqual([]);
    expect(shuffled([1], mulberry32(1))).toEqual([1]);
  });

  test("shuffledNotSorted never returns the input order for two or more items", () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(shuffledNotSorted([1, 2], mulberry32(seed))).toEqual([2, 1]);
      const out = shuffledNotSorted([1, 2, 3], mulberry32(seed));
      expect(out).not.toEqual([1, 2, 3]);
      expect([...out].sort()).toEqual([1, 2, 3]);
    }
    expect(shuffledNotSorted([1], mulberry32(1))).toEqual([1]);
    expect(shuffledNotSorted([], mulberry32(1))).toEqual([]);
  });
});

describe("paper order", () => {
  const parts = [
    { id: "p1", shuffleQuestions: false, poolSize: null, questions: [f.mc({ id: "a" }), f.tf({ id: "b" }), f.numeric({ id: "c" }), f.essay({ id: "d" }), f.matching({ id: "e" })] },
    { id: "p2", shuffleQuestions: false, poolSize: null, questions: [f.mc({ id: "f" }), f.tf({ id: "g" })] },
    { id: "p3", shuffleQuestions: false, poolSize: null, questions: [f.mc({ id: "h" })] },
  ];

  test("the same seed gives the same paper, a different one another", () => {
    const settings = { shuffleQuestions: true, shuffleChoices: true, shuffleParts: true };
    const once = orderForAttempt(settings, parts, 123);
    expect(orderForAttempt(settings, parts, 123)).toEqual(once);
    const others = [1, 2, 3, 4, 5].map((seed) => orderForAttempt(settings, parts, seed));
    expect(others.some((o) => JSON.stringify(o) !== JSON.stringify(once))).toBe(true);
  });

  test("with every shuffle off the paper is left as it is", () => {
    const out = orderForAttempt(off, parts, 99);
    expect(out.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(out.map((p) => ids(p.questions))).toEqual([["a", "b", "c", "d", "e"], ["f", "g"], ["h"]]);
    expect(out[0]!.questions[0]).toBe(parts[0]!.questions[0]!);
  });

  test("parts shuffle only when the quiz says so, and questions stay in their part", () => {
    const out = orderForAttempt({ ...off, shuffleParts: true }, parts, 5);
    expect(out.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3"]);
    for (const p of out) expect(ids(p.questions)).toEqual(ids(parts.find((x) => x.id === p.id)!.questions));
    const orders = new Set(Array.from({ length: 30 }, (_, seed) => orderForAttempt({ ...off, shuffleParts: true }, parts, seed).map((p) => p.id).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  test("questions shuffle for the whole quiz or for a part that asks", () => {
    const quiz = orderForAttempt({ ...off, shuffleQuestions: true }, parts, 11);
    expect(ids(quiz[0]!.questions).sort()).toEqual(["a", "b", "c", "d", "e"]);
    const onePart = [{ ...parts[0]!, shuffleQuestions: true }, parts[1]!];
    const seen = new Set(Array.from({ length: 30 }, (_, seed) => ids(orderForAttempt(off, onePart, seed)[0]!.questions).join()));
    expect(seen.size).toBeGreaterThan(1);
    for (let seed = 0; seed < 10; seed++) expect(ids(orderForAttempt(off, onePart, seed)[1]!.questions)).toEqual(["f", "g"]);
  });

  test("a pool draws that many questions, the same ones for a seed, in the part's order", () => {
    const pooled = [{ ...parts[0]!, poolSize: 3 }];
    const out = orderForAttempt(off, pooled, 17);
    expect(out[0]!.questions).toHaveLength(3);
    expect(orderForAttempt(off, pooled, 17)).toEqual(out);
    const order = ids(parts[0]!.questions);
    const got = ids(out[0]!.questions);
    expect(got.map((id) => order.indexOf(id))).toEqual([...got.map((id) => order.indexOf(id))].sort((a, b) => a - b));
    const drawn = new Set(Array.from({ length: 30 }, (_, seed) => ids(orderForAttempt(off, pooled, seed)[0]!.questions).join()));
    expect(drawn.size).toBeGreaterThan(1);
  });

  test("a pool as big as the part, or bigger, draws everything", () => {
    for (const poolSize of [5, 9]) expect(orderForAttempt(off, [{ ...parts[0]!, poolSize }], 3)[0]!.questions).toHaveLength(5);
  });

  test("choices and columns shuffle for multiple choice and matching only", () => {
    const settings = { ...off, shuffleChoices: true };
    const qs = orderForAttempt(settings, parts, 8)[0]!.questions;
    const mc = qs.find((q) => q.id === "a")!;
    const ma = qs.find((q) => q.id === "e")!;
    if (mc.type !== "multiple_choice" || ma.type !== "matching") throw new Error("types");
    expect(mc.choices.map((c) => c.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(mc.correctChoiceIds).toEqual(["a"]);
    expect(ma.right.map((r) => r.id).sort()).toEqual(["r1", "r2", "r3", "r4"]);
    expect(ma.left).toEqual(f.matching().left);
    expect(qs.find((q) => q.id === "b")).toBe(parts[0]!.questions[1]!);
    const orders = new Set(Array.from({ length: 30 }, (_, seed) => (orderForAttempt(settings, parts, seed)[0]!.questions[0] as Extract<Question, { type: "multiple_choice" }>).choices.map((c) => c.id).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  test("the source questions are never changed", () => {
    const before = JSON.stringify(parts);
    orderForAttempt({ shuffleQuestions: true, shuffleChoices: true, shuffleParts: true }, parts, 4);
    expect(JSON.stringify(parts)).toBe(before);
  });

  test("an empty quiz has no parts to order", () => {
    expect(orderForAttempt({ shuffleQuestions: true, shuffleChoices: true, shuffleParts: true }, [], 1)).toEqual([]);
  });
});

describe("the random of one question", () => {
  test("none when the quiz doesn't shuffle choices", () => {
    expect(paperRandom(off, 5, "q1")).toBeUndefined();
  });

  test("depends on the seed and the question id only", () => {
    const settings = { ...off, shuffleChoices: true };
    const a = paperRandom(settings, 5, "q1")!;
    const b = paperRandom(settings, 5, "q1")!;
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(paperRandom(settings, 5, "q2")!()).not.toBe(paperRandom(settings, 5, "q1")!());
    expect(paperRandom(settings, 6, "q1")!()).not.toBe(paperRandom(settings, 5, "q1")!());
  });

  test("the same attempt sees the same cloze bank and categorization order every time", () => {
    const cloze = f.blank({ mode: "cloze", clozeInput: "bank", prompt: "{{a}} {{b}} {{c}} {{d}}", extraWords: ["x", "y", "z"] });
    const cat = f.categorization();
    for (const q of [cloze, cat]) {
      const settings = { ...off, shuffleChoices: true };
      const first = toStudentQuestion(q, paperRandom(settings, 9, q.id));
      expect(toStudentQuestion(q, paperRandom(settings, 9, q.id))).toEqual(first);
    }
  });
});

describe("quiz totals", () => {
  test("a part without a pool counts every question and point", () => {
    expect(quizTotals([{ poolSize: null, questions: [{ points: 2 }, { points: 1.5 }] }])).toEqual({ questionCount: 2, totalPoints: 3.5 });
  });

  test("a pool counts its draw size at the points of its questions", () => {
    expect(quizTotals([{ poolSize: 2, questions: [{ points: 3 }, { points: 3 }, { points: 3 }] }])).toEqual({ questionCount: 2, totalPoints: 6 });
  });

  test("a pool bigger than its part counts the whole part", () => {
    expect(quizTotals([{ poolSize: 9, questions: [{ points: 2 }, { points: 2 }] }])).toEqual({ questionCount: 2, totalPoints: 4 });
  });

  test("parts add up, and none is zero", () => {
    expect(
      quizTotals([
        { poolSize: null, questions: [{ points: 1 }] },
        { poolSize: 1, questions: [{ points: 5 }, { points: 5 }] },
      ]),
    ).toEqual({ questionCount: 2, totalPoints: 6 });
    expect(quizTotals([])).toEqual({ questionCount: 0, totalPoints: 0 });
    expect(quizTotals([{ poolSize: 0, questions: [{ points: 5 }] }])).toEqual({ questionCount: 0, totalPoints: 0 });
  });
});
