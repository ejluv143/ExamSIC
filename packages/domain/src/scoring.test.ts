import { describe, expect, test } from "bun:test";
import type { CodeTestResult } from "./kinds/base.ts";
import { questionTypes } from "./question.ts";
import {
  attemptScore,
  autoScore,
  maxScore,
  outputMatches,
  partResults,
  percent,
  questionScore,
  unitCount,
  unitPoints,
} from "./scoring.ts";
import * as f from "./test-fixtures.ts";

const pass = (...ids: string[]): CodeTestResult[] => ids.map((testId) => ({ testId, passed: true, output: "" }));
const fail = (...ids: string[]): CodeTestResult[] => ids.map((testId) => ({ testId, passed: false, output: "" }));
const json = (v: unknown) => JSON.stringify(v);

describe("scoring: multiple choice", () => {
  test("a single right choice scores fully, a wrong or blank one nothing", () => {
    const q = f.mc();
    expect(autoScore(q, "a")).toBe(1);
    expect(autoScore(q, "b")).toBe(0);
    expect(autoScore(q, null)).toBe(0);
    expect(autoScore(q, "")).toBe(0);
    expect(autoScore(q, [])).toBe(0);
  });

  test("several right choices need all and only them without partial credit", () => {
    const q = f.mc({ multipleCorrect: true, correctChoiceIds: ["a", "b"] });
    expect(autoScore(q, ["a", "b"])).toBe(1);
    expect(autoScore(q, ["b", "a"])).toBe(1);
    expect(autoScore(q, ["a"])).toBe(0);
    expect(autoScore(q, ["a", "b", "c"])).toBe(0);
  });

  test("with partial credit each right tick earns a share and each wrong tick takes one back", () => {
    const q = f.mc({ multipleCorrect: true, correctChoiceIds: ["a", "b"], partialCredit: true });
    expect(autoScore(q, ["a"])).toBe(0.5);
    expect(autoScore(q, ["a", "b", "c"])).toBe(0.5);
    expect(autoScore(q, ["a", "c"])).toBe(0);
    expect(autoScore(q, ["c", "d"])).toBe(0);
    expect(autoScore(q, ["a", "c", "d"])).toBe(0);
    expect(autoScore(q, null)).toBe(0);
  });

  test("partial credit never applies to a single-answer question", () => {
    const q = f.mc({ partialCredit: true, correctChoiceIds: ["a", "b"] });
    expect(autoScore(q, ["a"])).toBe(0);
  });

  test("a question without any right choice never scores", () => {
    expect(autoScore(f.mc({ correctChoiceIds: [] }), [])).toBe(0);
    expect(autoScore(f.mc({ correctChoiceIds: [], multipleCorrect: true, partialCredit: true }), ["a"])).toBe(0);
  });
});

describe("scoring: true/false", () => {
  test("only the right boolean scores", () => {
    expect(autoScore(f.tf(), true)).toBe(1);
    expect(autoScore(f.tf(), false)).toBe(0);
    expect(autoScore(f.tf({ answer: false }), false)).toBe(1);
    expect(autoScore(f.tf({ answer: false }), true)).toBe(0);
  });

  test("blank and text answers score nothing", () => {
    expect(autoScore(f.tf(), null)).toBe(0);
    expect(autoScore(f.tf({ answer: false }), null)).toBe(0);
    expect(autoScore(f.tf(), "true")).toBe(0);
  });
});

describe("scoring: blank", () => {
  test("inline blanks accept any alternative, ignoring case and surrounding spaces", () => {
    const q = f.blank();
    expect(autoScore(q, ["primary key", "row"])).toBe(1);
    expect(autoScore(q, ["PK", "row"])).toBe(1);
    expect(autoScore(q, ["  pk  ", " ROW "])).toBe(1);
  });

  test("all blanks must be right without partial credit", () => {
    const q = f.blank();
    expect(autoScore(q, ["PK", "column"])).toBe(0);
    expect(autoScore(q, ["PK"])).toBe(0);
  });

  test("with partial credit each blank is an equal share", () => {
    const q = f.blank({ partialCredit: true });
    expect(autoScore(q, ["PK", "column"])).toBe(0.5);
    expect(autoScore(q, ["PK"])).toBe(0.5);
    expect(autoScore(q, ["x", "y"])).toBe(0);
  });

  test("weights shift the shares, and are ignored when they don't fit the blanks", () => {
    expect(autoScore(f.blank({ partialCredit: true, weights: [3, 1] }), ["PK", "x"])).toBe(0.75);
    expect(autoScore(f.blank({ partialCredit: true, weights: [3, 1] }), ["x", "row"])).toBe(0.25);
    expect(autoScore(f.blank({ partialCredit: true, weights: [3] }), ["PK", "x"])).toBe(0.5);
    expect(autoScore(f.blank({ partialCredit: true, weights: [0, 0] }), ["PK", "x"])).toBe(0.5);
  });

  test("case-sensitive blanks need the exact case", () => {
    const q = f.blank({ caseSensitive: true });
    expect(autoScore(q, ["pk", "row"])).toBe(0);
    expect(autoScore(q, ["PK", "row"])).toBe(1);
    expect(autoScore(q, ["PK", "Row"])).toBe(0);
  });

  test("blank, null and empty answers score nothing, even when the key is empty-ish", () => {
    const q = f.blank({ partialCredit: true });
    expect(autoScore(q, null)).toBe(0);
    expect(autoScore(q, ["", ""])).toBe(0);
    expect(autoScore(q, ["  ", " "])).toBe(0);
  });

  test("an identification with one blank after the statement takes any accepted answer", () => {
    const q = f.blank({ prompt: "Capital of France? {{Paris|Paname}}" });
    expect(unitCount(q)).toBe(1);
    expect(autoScore(q, ["Paris"])).toBe(1);
    expect(autoScore(q, ["paname"])).toBe(1);
    expect(autoScore(q, "PARIS")).toBe(1);
    expect(autoScore(q, ["London"])).toBe(0);
    expect(autoScore(q, [""])).toBe(0);
  });

  test("a letter-box blank is scored like any other", () => {
    const q = f.blank({ prompt: "{{#a}} then {{b|bee}}", partialCredit: true });
    expect(unitCount(q)).toBe(2);
    expect(autoScore(q, ["A", "Bee"])).toBe(1);
    expect(autoScore(q, ["A", "c"])).toBe(0.5);
  });

  test("part results list each blank in key order", () => {
    expect(partResults(f.blank(), ["pk", "wrong"])).toEqual([
      { given: "pk", correct: true },
      { given: "wrong", correct: false },
    ]);
    expect(partResults(f.blank(), null)).toEqual([
      { given: "", correct: false },
      { given: "", correct: false },
    ]);
  });
});

describe("scoring: matching", () => {
  const right = ["r1", "r2", "r3", "r1"];

  test("every pair right scores fully; several lefts may share a right", () => {
    expect(autoScore(f.matching(), right)).toBe(1);
  });

  test("a wrong pair costs everything without partial credit", () => {
    expect(autoScore(f.matching(), ["r1", "r2", "r3", "r4"])).toBe(0);
  });

  test("with partial credit each pair is an equal share", () => {
    const q = f.matching({ partialCredit: true });
    expect(autoScore(q, ["r1", "r2", "r3", "r4"])).toBe(0.75);
    expect(autoScore(q, ["r1", "r2"])).toBe(0.5);
    expect(autoScore(q, ["r4", "r4", "r4", "r4"])).toBe(0);
  });

  test("weights apply to the pairs in left order", () => {
    const q = f.matching({ partialCredit: true, weights: [1, 1, 1, 5] });
    expect(autoScore(q, ["r1", "r2", "r3", "r4"])).toBe(3 / 8);
    expect(autoScore(q, ["", "", "", "r1"])).toBe(5 / 8);
  });

  test("blank answers score nothing", () => {
    const q = f.matching({ partialCredit: true });
    expect(autoScore(q, null)).toBe(0);
    expect(autoScore(q, ["", "", "", ""])).toBe(0);
  });

  test("part results give the text picked for each left item", () => {
    expect(partResults(f.matching(), ["r1", "r4", "", "r1"])).toEqual([
      { given: "Bark", correct: true },
      { given: "Quack", correct: false },
      { given: "", correct: false },
      { given: "Bark", correct: true },
    ]);
  });
});

describe("scoring: enumeration", () => {
  test("any order and any alternative when order doesn't matter", () => {
    const q = f.enumeration();
    expect(autoScore(q, ["BCNF", "first normal form", "3nf", "2NF"])).toBe(1);
    expect(unitCount(q)).toBe(4);
  });

  test("an item is credited once, so repeating an answer doesn't score twice", () => {
    const q = f.enumeration({ partialCredit: true });
    expect(autoScore(q, ["2NF", "2NF", "2NF", "2NF"])).toBe(0.25);
    expect(autoScore(f.enumeration(), ["2NF", "2NF", "3NF", "BCNF"])).toBe(0);
  });

  test("order matters: each box is checked against its own item", () => {
    const q = f.enumeration({ orderMatters: true, partialCredit: true });
    expect(autoScore(q, ["1NF", "2NF", "3NF", "BCNF"])).toBe(1);
    expect(autoScore(q, ["2NF", "1NF", "3NF", "BCNF"])).toBe(0.5);
    expect(autoScore(f.enumeration({ orderMatters: true }), ["2NF", "1NF", "3NF", "BCNF"])).toBe(0);
  });

  test("weights shift the shares", () => {
    const q = f.enumeration({ orderMatters: true, partialCredit: true, weights: [4, 1, 1, 1] });
    expect(autoScore(q, ["1NF", "x", "x", "x"])).toBe(4 / 7);
  });

  test("case-sensitive items need the exact case", () => {
    const q = f.enumeration({ items: ["Ada", "Alan"], caseSensitive: true });
    expect(autoScore(q, ["ada", "Alan"])).toBe(0);
    expect(autoScore(q, ["Alan", "Ada"])).toBe(1);
  });

  test("blank answers score nothing", () => {
    expect(autoScore(f.enumeration({ partialCredit: true }), null)).toBe(0);
    expect(autoScore(f.enumeration({ partialCredit: true }), ["", " ", "", ""])).toBe(0);
  });

  test("part results follow the key and credit each item once", () => {
    expect(partResults(f.enumeration(), ["3NF", "3NF", "x", "1NF"])).toEqual([
      { given: "3NF", correct: true },
      { given: "3NF", correct: false },
      { given: "x", correct: false },
      { given: "1NF", correct: true },
    ]);
  });
});

describe("scoring: numeric", () => {
  test("within the tolerance is right, including its edge", () => {
    const q = f.numeric();
    expect(autoScore(q, "3.14")).toBe(1);
    expect(autoScore(q, "3.15")).toBe(1);
    expect(autoScore(q, "3.13")).toBe(1);
    expect(autoScore(q, "3.16")).toBe(0);
    expect(autoScore(q, "3.12")).toBe(0);
  });

  test("a zero tolerance is exact, with a little room for rounding", () => {
    const q = f.numeric({ answer: 0.3, tolerance: 0 });
    expect(autoScore(q, "0.3")).toBe(1);
    expect(autoScore(q, String(0.1 + 0.2))).toBe(1);
    expect(autoScore(q, "0.31")).toBe(0);
  });

  test("fractions, mixed numbers, percents and thousands separators are read", () => {
    expect(autoScore(f.numeric({ answer: 0.75, tolerance: 0 }), "3/4")).toBe(1);
    expect(autoScore(f.numeric({ answer: 1.5, tolerance: 0 }), "1 1/2")).toBe(1);
    expect(autoScore(f.numeric({ answer: 0.25, tolerance: 0 }), "25%")).toBe(1);
    expect(autoScore(f.numeric({ answer: 1250, tolerance: 0 }), "1,250")).toBe(1);
    expect(autoScore(f.numeric({ answer: -2, tolerance: 0 }), "-2")).toBe(1);
  });

  test("text that is not a number, blanks and non-text answers score nothing", () => {
    const q = f.numeric({ answer: 0, tolerance: 1 });
    expect(autoScore(q, "abc")).toBe(0);
    expect(autoScore(q, "")).toBe(0);
    expect(autoScore(q, "3/0")).toBe(0);
    expect(autoScore(q, null)).toBe(0);
    expect(autoScore(q, true)).toBe(0);
    expect(autoScore(q, ["0"])).toBe(0);
  });
});

describe("scoring: essay and drawing", () => {
  test("they always wait for the teacher", () => {
    expect(autoScore(f.essay(), "A long answer")).toBeNull();
    expect(autoScore(f.essay(), null)).toBeNull();
    expect(autoScore(f.drawing(), json({ strokes: [], assetId: "x", photos: [] }))).toBeNull();
    expect(autoScore(f.drawing(), null)).toBeNull();
  });
});

describe("scoring: code", () => {
  test("without results the answer waits for the checker", () => {
    expect(autoScore(f.code(), "print(1)")).toBeNull();
    expect(autoScore(f.code(), "print(1)", null)).toBeNull();
  });

  test("all tests passing scores fully, none scores nothing", () => {
    expect(autoScore(f.code(), "x", pass("t1", "t2", "t3", "t4"))).toBe(1);
    expect(autoScore(f.code(), "x", fail("t1", "t2", "t3", "t4"))).toBe(0);
    expect(autoScore(f.code({ partialCredit: true }), "x", [])).toBe(0);
  });

  test("without partial credit one failing test costs everything", () => {
    expect(autoScore(f.code(), "x", [...pass("t1", "t2", "t3"), ...fail("t4")])).toBe(0);
  });

  test("with partial credit the fraction of tests passed counts, by weight when given", () => {
    const q = f.code({ partialCredit: true });
    expect(autoScore(q, "x", [...pass("t1", "t4"), ...fail("t2", "t3")])).toBe(0.5);
    expect(autoScore(q, "x", pass("t1"))).toBe(0.25);
    const weighted = f.code({ partialCredit: true, weights: [1, 1, 1, 5] });
    expect(autoScore(weighted, "x", pass("t1", "t2"))).toBe(0.25);
    expect(autoScore(weighted, "x", pass("t4"))).toBe(5 / 8);
  });

  test("a test with no result counts as failed", () => {
    expect(autoScore(f.code({ partialCredit: true }), "x", pass("t1", "t2", "t3"))).toBe(0.75);
  });

  test("a question without tests scores nothing", () => {
    expect(autoScore(f.code({ tests: [] }), "x", [])).toBe(0);
  });

  test("units are the tests", () => {
    expect(unitCount(f.code())).toBe(4);
    expect(partResults(f.code(), "x")).toBeNull();
  });
});

describe("scoring: sql", () => {
  test("without checks the answer waits for the grader", () => {
    expect(autoScore(f.sql(), "SELECT 1")).toBeNull();
    expect(autoScore(f.sql(), "SELECT 1", null)).toBeNull();
    expect(autoScore(f.sql(), "SELECT 1", [])).toBeNull();
  });

  test("passing every check scores fully", () => {
    expect(autoScore(f.sql(), "x", pass("sample"))).toBe(1);
    expect(autoScore(f.sql(), "x", pass("sample", "hidden"))).toBe(1);
  });

  test("with partial credit each check is an equal share, without it all must pass", () => {
    const results = [...pass("sample"), ...fail("hidden")];
    expect(autoScore(f.sql({ partialCredit: true }), "x", results)).toBe(0.5);
    expect(autoScore(f.sql(), "x", results)).toBe(0);
    expect(autoScore(f.sql({ partialCredit: true }), "x", fail("sample", "hidden"))).toBe(0);
  });
});

describe("scoring: categorization", () => {
  const right = { i1: "fruit", i2: "veg", i3: "fruit", i4: null };

  test("every item in its category scores fully; a distractor is right when unsorted", () => {
    const q = f.categorization();
    expect(autoScore(q, json(right))).toBe(1);
    expect(autoScore(q, json({ i1: "fruit", i2: "veg", i3: "fruit" }))).toBe(1);
  });

  test("a wrong item costs everything without partial credit", () => {
    expect(autoScore(f.categorization(), json({ ...right, i2: "fruit" }))).toBe(0);
    expect(autoScore(f.categorization(), json({ ...right, i4: "veg" }))).toBe(0);
  });

  test("with partial credit each item is an equal share, weights shifting them", () => {
    const q = f.categorization({ partialCredit: true });
    expect(autoScore(q, json({ ...right, i2: "fruit" }))).toBe(0.75);
    expect(autoScore(q, json({ ...right, i4: "veg" }))).toBe(0.75);
    const weighted = f.categorization({ partialCredit: true, weights: [1, 1, 1, 7] });
    expect(autoScore(weighted, json({ ...right, i4: "veg" }))).toBe(0.3);
  });

  test("blank and unreadable answers score as nothing sorted", () => {
    expect(autoScore(f.categorization({ partialCredit: true }), null)).toBe(0);
    expect(autoScore(f.categorization({ partialCredit: true }), "not json")).toBe(0.25);
    expect(autoScore(f.categorization({ partialCredit: true }), json({}))).toBe(0.25);
    expect(autoScore(f.categorization(), "not json")).toBe(0);
  });
});

describe("scoring: ordering", () => {
  const right = ["o1", "o2", "o3", "o4"];

  test("the right order scores fully", () => {
    expect(autoScore(f.ordering(), right)).toBe(1);
  });

  test("a wrong position costs everything without partial credit, a share with it", () => {
    expect(autoScore(f.ordering(), ["o2", "o1", "o3", "o4"])).toBe(0);
    expect(autoScore(f.ordering({ partialCredit: true }), ["o2", "o1", "o3", "o4"])).toBe(0.5);
    expect(autoScore(f.ordering({ partialCredit: true }), ["o4", "o3", "o2", "o1"])).toBe(0);
    expect(autoScore(f.ordering({ partialCredit: true }), ["o2", "o3", "o4", "o1"])).toBe(0);
  });

  test("an order that isn't each item once scores nothing", () => {
    const q = f.ordering({ partialCredit: true });
    expect(autoScore(q, ["o1", "o2"])).toBe(0);
    expect(autoScore(q, ["o1", "o1", "o3", "o4"])).toBe(0);
    expect(autoScore(q, ["o1", "o2", "o3", "zz"])).toBe(0);
    expect(autoScore(q, null)).toBe(0);
    expect(autoScore(q, "o1")).toBe(0);
  });
});

describe("scoring: hotspot", () => {
  const both = json([
    { x: 0.1, y: 0.1 },
    { x: 0.7, y: 0.7 },
  ]);

  test("a marker in every region scores fully", () => {
    expect(autoScore(f.hotspot(), both)).toBe(1);
  });

  test("a missed region costs everything without partial credit, a share with it", () => {
    const one = json([{ x: 0.1, y: 0.1 }]);
    expect(autoScore(f.hotspot(), one)).toBe(0);
    expect(autoScore(f.hotspot({ partialCredit: true }), one)).toBe(0.5);
  });

  test("a marker outside every region fails the answer unless partial credit is on", () => {
    const stray = json([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
    ]);
    expect(autoScore(f.hotspot(), stray)).toBe(0);
    expect(autoScore(f.hotspot({ partialCredit: true }), stray)).toBe(0.5);
  });

  test("only the first maxClicks markers count", () => {
    const three = json([
      { x: 0.1, y: 0.1 },
      { x: 0.7, y: 0.7 },
      { x: 0.9, y: 0.1 },
    ]);
    expect(autoScore(f.hotspot(), three)).toBe(1);
    expect(autoScore(f.hotspot({ maxClicks: 1, partialCredit: true }), three)).toBe(0.5);
  });

  test("region edges count, an ellipse's corner doesn't, and tolerance widens regions", () => {
    const edge = json([{ x: 0.2, y: 0.2 }]);
    expect(autoScore(f.hotspot({ regions: [f.hotspot().regions[0]!] }), edge)).toBe(1);
    const corner = json([{ x: 0.78, y: 0.78 }]);
    const ellipse = [f.hotspot().regions[1]!];
    expect(autoScore(f.hotspot({ regions: ellipse }), corner)).toBe(0);
    expect(autoScore(f.hotspot({ regions: ellipse, tolerance: 0.05 }), corner)).toBe(1);
  });

  test("blank and unreadable answers score nothing", () => {
    expect(autoScore(f.hotspot(), null)).toBe(0);
    expect(autoScore(f.hotspot(), "[]")).toBe(0);
    expect(autoScore(f.hotspot(), "nope")).toBe(0);
    expect(autoScore(f.hotspot(), ["x"])).toBe(0);
  });
});

describe("scoring: across the types", () => {
  test("a left-blank answer scores 0, or null for the types that wait", () => {
    const waits = new Set(["essay", "code", "sql", "drawing"]);
    for (const q of f.oneOfEach()) {
      expect(autoScore(q, null)).toBe(waits.has(q.type) ? null : 0);
    }
    expect(f.oneOfEach().map((q) => q.type)).toEqual([...questionTypes]);
  });

  test("units are counted for the types that split their points, one for the rest", () => {
    expect(f.oneOfEach().map(unitCount)).toEqual([1, 1, 2, 4, 4, 1, 1, 4, 1, 1, 4, 4, 2]);
  });

  test("unit points split the points by weight, in half-point rounding of 2 decimals", () => {
    expect(unitPoints(f.blank())).toEqual([2, 2]);
    expect(unitPoints(f.blank({ weights: [3, 1] }))).toEqual([3, 1]);
    expect(unitPoints(f.blank({ weights: [3] }))).toEqual([2, 2]);
    expect(unitPoints(f.enumeration({ points: 1, items: ["a", "b", "c"] }))).toEqual([0.33, 0.33, 0.33]);
    expect(unitPoints(f.mc())).toEqual([4]);
  });

  test("part results exist for blanks, matching and enumeration only", () => {
    const withParts = f.oneOfEach().filter((q) => partResults(q, null) !== null);
    expect(withParts.map((q) => q.type)).toEqual(["blank", "matching", "enumeration"]);
  });
});

describe("question and attempt scores", () => {
  test("the teacher's score wins, capped at the points", () => {
    const q = { points: 4 };
    expect(questionScore(q, { autoScore: 1, manualScore: 2 })).toBe(2);
    expect(questionScore(q, { autoScore: 0, manualScore: 9 })).toBe(4);
    expect(questionScore(q, { autoScore: 1, manualScore: 0 })).toBe(0);
    expect(questionScore(q, { autoScore: null, manualScore: 3.5 })).toBe(3.5);
  });

  test("the automatic fraction is scaled to the points and rounded to 2 decimals", () => {
    expect(questionScore({ points: 3 }, { autoScore: 0.5, manualScore: null })).toBe(1.5);
    expect(questionScore({ points: 1 }, { autoScore: 1 / 3, manualScore: null })).toBe(0.33);
    expect(questionScore({ points: 1 }, { autoScore: 0, manualScore: null })).toBe(0);
  });

  test("nothing scored yet is null", () => {
    expect(questionScore({ points: 4 }, { autoScore: null, manualScore: null })).toBeNull();
    expect(questionScore({ points: 4 }, undefined)).toBeNull();
  });

  test("an attempt adds up the questions, from a map or a record", () => {
    const qs = [f.mc({ id: "q1", points: 2 }), f.essay({ id: "q2", points: 5 }), f.tf({ id: "q3", points: 1 }), f.numeric({ id: "q4", points: 2 })];
    const rows = {
      q1: { autoScore: 1, manualScore: null },
      q2: { autoScore: null, manualScore: null },
      q4: { autoScore: 0.5, manualScore: null },
    };
    const expected = { score: 3, max: 10, gradedMax: 5, ungraded: 1 };
    expect(attemptScore(qs, rows)).toEqual(expected);
    expect(attemptScore(qs, new Map(Object.entries(rows)))).toEqual(expected);
  });

  test("a graded essay joins the score, and an empty attempt is 0 of 0", () => {
    const essay = f.essay({ id: "q2", points: 5 });
    expect(attemptScore([essay], { q2: { autoScore: null, manualScore: 4 } })).toEqual({ score: 4, max: 5, gradedMax: 5, ungraded: 0 });
    expect(attemptScore([], {})).toEqual({ score: 0, max: 0, gradedMax: 0, ungraded: 0 });
  });

  test("max score and percent", () => {
    expect(maxScore([{ points: 1.5 }, { points: 2 }])).toBe(3.5);
    expect(maxScore([])).toBe(0);
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(5, 5)).toBe(100);
    expect(percent(3, 0)).toBe(0);
  });
});

describe("output matching", () => {
  test("trailing spaces, trailing blank lines and line-ending style don't matter", () => {
    expect(outputMatches("1 \n2\n\n", "1\n2")).toBe(true);
    expect(outputMatches("1\r\n2\r\n", "1\n2")).toBe(true);
    expect(outputMatches("1\r2", "1\n2")).toBe(true);
  });

  test("leading spaces, inner spaces and content do", () => {
    expect(outputMatches(" 1", "1")).toBe(false);
    expect(outputMatches("1  2", "1 2")).toBe(false);
    expect(outputMatches("1\n\n2", "1\n2")).toBe(false);
    expect(outputMatches("a", "A")).toBe(false);
  });
});
