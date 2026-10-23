import { describe, expect, test } from "bun:test";
import { itemAnalysis, type ItemAttempt, type ScoredAnswerLike } from "./item-analysis.ts";
import * as f from "./test-fixtures.ts";

const row = (questionId: string, value: ScoredAnswerLike["value"], autoScore: number | null, manualScore: number | null = null): ScoredAnswerLike => ({
  questionId,
  value,
  autoScore,
  manualScore,
});

// An attempt over `ids`, right (1) or wrong (0) on each, with true/false-style answers.
const attempt = (marks: Record<string, 0 | 1 | null>, order = Object.keys(marks)): ItemAttempt => ({
  questionOrder: order,
  answers: Object.entries(marks).flatMap(([id, m]) => (m === null ? [row(id, "x", null)] : [row(id, m === 1, m)])),
});

const tfs = (...ids: string[]) => ids.map((id) => f.tf({ id }));

describe("itemAnalysis: difficulty", () => {
  const qs = tfs("q1", "q2");
  const attempts = [attempt({ q1: 1, q2: 0 }), attempt({ q1: 1, q2: 0 }), attempt({ q1: 1, q2: 1 }), attempt({ q1: 0, q2: 0 })];
  const { items } = itemAnalysis(qs, attempts);

  test("p is the share with full points, with its band", () => {
    expect(items[0]!.n).toBe(4);
    expect(items[0]!.p).toBe(0.75);
    expect(items[0]!.band).toBe("moderate");
    expect(items[1]!.p).toBe(0.25);
    expect(items[1]!.band).toBe("hard");
  });

  test("easy from 0.8", () => {
    const easy = itemAnalysis(tfs("a"), Array.from({ length: 5 }, (_, i) => attempt({ a: i === 0 ? 0 : 1 })));
    expect(easy.items[0]!.p).toBe(0.8);
    expect(easy.items[0]!.band).toBe("easy");
  });

  test("partial credit counts as wrong for p, but not for the mean fraction", () => {
    const q = f.mc({ id: "m", points: 4 });
    const half: ItemAttempt = { questionOrder: ["m"], answers: [row("m", "a", 0.5)] };
    const full: ItemAttempt = { questionOrder: ["m"], answers: [row("m", "a", 1)] };
    const r = itemAnalysis([q], [half, full]).items[0]!;
    expect(r.p).toBe(0.5);
    expect(r.meanFraction).toBe(0.75);
  });

  test("a teacher's score wins over the automatic one", () => {
    const q = f.essay({ id: "e", points: 4 });
    const a: ItemAttempt = { questionOrder: ["e"], answers: [row("e", "text", null, 4)] };
    const b: ItemAttempt = { questionOrder: ["e"], answers: [row("e", "text", null, 1)] };
    const r = itemAnalysis([q], [a, b]).items[0]!;
    expect(r.p).toBe(0.5);
    expect(r.meanFraction).toBe(0.625);
  });
});

describe("itemAnalysis: discrimination", () => {
  // Students s1..s6 ordered strong to weak on the filler items; "pos" follows ability, "neg" opposes it.
  const qs = tfs("f1", "f2", "f3", "pos", "neg");
  const abilities = [3, 3, 2, 2, 0, 0];
  const attempts = abilities.map((n, i) =>
    attempt({ f1: n >= 1 ? 1 : 0, f2: n >= 2 ? 1 : 0, f3: n >= 3 ? 1 : 0, pos: i < 3 ? 1 : 0, neg: i < 3 ? 0 : 1 }),
  );
  const { items } = itemAnalysis(qs, attempts);

  test("an item only strong students get is positive", () => {
    expect(items[3]!.discrimination!).toBeGreaterThan(0.3);
    expect(items[3]!.quality).toBe("good");
  });

  test("a reversed item is negative and flagged", () => {
    expect(items[4]!.discrimination!).toBeLessThan(0);
    expect(items[4]!.quality).toBe("negative");
  });

  test("known value for two items", () => {
    // x = [1,1,0,0], rest = [1,1,0,0] for the other item → perfect correlation.
    const r = itemAnalysis(tfs("a", "b"), [attempt({ a: 1, b: 1 }), attempt({ a: 1, b: 1 }), attempt({ a: 0, b: 0 }), attempt({ a: 0, b: 0 })]);
    expect(r.items[0]!.discrimination).toBeCloseTo(1, 10);
  });
});

describe("itemAnalysis: pools and ungraded answers", () => {
  test("an item counts only the attempts that got it", () => {
    const qs = tfs("a", "b");
    const r = itemAnalysis(qs, [attempt({ a: 1, b: 1 }), attempt({ a: 0 }), attempt({ a: 1, b: 0 })]);
    expect(r.items[0]!.n).toBe(3);
    expect(r.items[1]!.n).toBe(2);
    expect(r.items[1]!.p).toBe(0.5);
    expect(r.summary.commonItems).toBe(1);
  });

  test("a question missing from the order is ignored even when an answer row exists", () => {
    const a: ItemAttempt = { questionOrder: ["a"], answers: [row("a", true, 1), row("b", true, 1)] };
    const r = itemAnalysis(tfs("a", "b"), [a, a]);
    expect(r.items[1]!.n).toBe(0);
    expect(r.items[1]!.p).toBeNull();
    expect(r.items[1]!.band).toBeNull();
  });

  test("an ungraded answer is excluded for that attempt only", () => {
    const qs = [f.essay({ id: "e" }), ...tfs("a")];
    const r = itemAnalysis(qs, [attempt({ e: null, a: 1 }), attempt({ e: 1, a: 0 }), attempt({ e: 0, a: 1 })]);
    expect(r.items[0]!.n).toBe(2);
    expect(r.items[0]!.p).toBe(0.5);
    expect(r.items[1]!.n).toBe(3);
    // The attempt with the ungraded essay drops out of the summary.
    expect(r.summary.n).toBe(2);
  });

  test("a missing answer row scores zero and counts as blank", () => {
    const a: ItemAttempt = { questionOrder: ["a"], answers: [] };
    const r = itemAnalysis(tfs("a"), [a, attempt({ a: 1 })]).items[0]!;
    expect(r.n).toBe(2);
    expect(r.p).toBe(0.5);
    expect(r.blank).toBe(1);
  });
});

describe("itemAnalysis: distractors", () => {
  test("single-answer multiple choice counts each choice", () => {
    const q = f.mc({ id: "m" });
    const pick = (v: string | null): ItemAttempt => ({ questionOrder: ["m"], answers: [row("m", v, v === "a" ? 1 : 0)] });
    const d = itemAnalysis([q], [pick("a"), pick("a"), pick("b"), pick("c"), pick(null)]).items[0]!;
    expect(d.distractors).toEqual([
      { key: "a", count: 2, correct: true },
      { key: "b", count: 1, correct: false },
      { key: "c", count: 1, correct: false },
      { key: "d", count: 0, correct: false },
    ]);
    expect(d.blank).toBe(1);
  });

  test("multiple-correct multiple choice counts a student under every choice picked", () => {
    const q = f.mc({ id: "m", multipleCorrect: true, correctChoiceIds: ["a", "b"] });
    const pick = (v: string[], score: number): ItemAttempt => ({ questionOrder: ["m"], answers: [row("m", v, score)] });
    const d = itemAnalysis([q], [pick(["a", "b"], 1), pick(["a", "c"], 0), pick([], 0)]).items[0]!;
    expect(d.distractors!.map((x) => [x.key, x.count, x.correct])).toEqual([
      ["a", 2, true],
      ["b", 1, true],
      ["c", 1, false],
      ["d", 0, false],
    ]);
    expect(d.blank).toBe(1);
  });

  test("true/false counts true and false", () => {
    const q = f.tf({ id: "t", answer: false });
    const pick = (v: boolean | null): ItemAttempt => ({ questionOrder: ["t"], answers: [row("t", v, v === false ? 1 : 0)] });
    const d = itemAnalysis([q], [pick(true), pick(true), pick(false), pick(null)]).items[0]!;
    expect(d.distractors).toEqual([
      { key: "true", count: 2, correct: false },
      { key: "false", count: 1, correct: true },
    ]);
    expect(d.blank).toBe(1);
  });

  test("other types have none", () => {
    expect(itemAnalysis([f.essay({ id: "e" })], []).items[0]!.distractors).toBeNull();
  });
});

describe("itemAnalysis: summary and KR-20", () => {
  test("KR-20 on a hand-computed matrix", () => {
    // Totals 3,2,1,0 → variance 1.25; p = .75, .5, .25 → Σpq = .625; KR-20 = 3/2 · (1 − .5) = .75.
    const r = itemAnalysis(tfs("a", "b", "c"), [
      attempt({ a: 1, b: 1, c: 1 }),
      attempt({ a: 1, b: 1, c: 0 }),
      attempt({ a: 1, b: 0, c: 0 }),
      attempt({ a: 0, b: 0, c: 0 }),
    ]).summary;
    expect(r.kr20).toBeCloseTo(0.75, 10);
    expect(r.n).toBe(4);
    expect(r.commonItems).toBe(3);
    expect(r.meanPercent).toBeCloseTo(50, 10);
    // Percent totals 100, 66.67, 33.33, 0 → population SD = 37.27.
    expect(r.sdPercent).toBeCloseTo(37.2678, 3);
  });

  test("only items every attempt got count", () => {
    const r = itemAnalysis(tfs("a", "b", "c"), [attempt({ a: 1, b: 1, c: 1 }), attempt({ a: 0, b: 1 }), attempt({ a: 1, b: 0 }), attempt({ a: 0, b: 0 })]).summary;
    expect(r.commonItems).toBe(2);
    expect(r.n).toBe(4);
    expect(r.kr20).not.toBeNull();
  });

  test("degenerate cases give null", () => {
    const qs = tfs("a", "b");
    expect(itemAnalysis(qs, []).summary).toEqual({ n: 0, commonItems: 0, kr20: null, meanPercent: null, sdPercent: null });
    // One attempt.
    expect(itemAnalysis(qs, [attempt({ a: 1, b: 0 })]).summary.kr20).toBeNull();
    expect(itemAnalysis(qs, [attempt({ a: 1, b: 0 })]).items[0]!.discrimination).toBeNull();
    // One common item.
    expect(itemAnalysis(tfs("a"), [attempt({ a: 1 }), attempt({ a: 0 })]).summary.kr20).toBeNull();
    // No spread in the totals.
    const same = itemAnalysis(qs, [attempt({ a: 1, b: 0 }), attempt({ a: 0, b: 1 })]);
    expect(same.summary.kr20).toBeNull();
    expect(same.summary.sdPercent).toBe(0);
    // Everyone right on the item: no variance, no discrimination.
    const all = itemAnalysis(qs, [attempt({ a: 1, b: 1 }), attempt({ a: 1, b: 0 })]);
    expect(all.items[0]!.discrimination).toBeNull();
    expect(all.items[0]!.quality).toBeNull();
  });
});
