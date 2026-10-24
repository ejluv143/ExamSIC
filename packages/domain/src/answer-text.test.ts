import { describe, expect, test } from "bun:test";
import { answerKey, answerText } from "./answer-text.ts";
import { encodeDrawingAnswer, type Stroke } from "./drawing.ts";
import * as f from "./test-fixtures.ts";

const stroke: Stroke = { tool: "pen", color: "#000", size: 2, points: [[0, 0, 1]], at: 0, ms: 10 };
const drawn = (strokes: number, photos: string[] = [], assetId: string | null = null) =>
  encodeDrawingAnswer({ strokes: Array.from({ length: strokes }, () => stroke), assetId, photos });

describe("answer key text", () => {
  test("multiple choice lists the right choices, or a dash when none is marked", () => {
    expect(answerKey(f.mc())).toBe("Alpha");
    expect(answerKey(f.mc({ multipleCorrect: true, correctChoiceIds: ["a", "c"] }))).toBe("Alpha; Gamma");
    expect(answerKey(f.mc({ correctChoiceIds: [] }))).toBe("—");
  });

  test("true/false", () => {
    expect(answerKey(f.tf())).toBe("True");
    expect(answerKey(f.tf({ answer: false }))).toBe("False");
  });

  test("blank lists the alternatives of each blank", () => {
    expect(answerKey(f.blank())).toBe("primary key / PK; row");
    expect(answerKey(f.blank({ prompt: "Capital? {{#Paris|Paname}}" }))).toBe("Paris / Paname");
  });

  test("matching shows each pair, with a dash for a right item that is gone", () => {
    expect(answerKey(f.matching())).toBe("Dog → Bark; Cat → Meow; Cow → Moo; Owl → Bark");
    const q = f.matching({ left: [{ id: "l1", text: "Dog", rightId: "zz" }] });
    expect(answerKey(q)).toBe("Dog → —");
  });

  test("enumeration shows alternatives and whether order matters", () => {
    expect(answerKey(f.enumeration())).toBe("1NF / First Normal Form; 2NF; 3NF; BCNF");
    expect(answerKey(f.enumeration({ orderMatters: true, items: ["a", "b"] }))).toBe("a; b (in order)");
  });

  test("numeric shows the tolerance and unit when there are any", () => {
    expect(answerKey(f.numeric())).toBe("3.14 ± 0.01 cm");
    expect(answerKey(f.numeric({ answer: 5, tolerance: 0, unit: "" }))).toBe("5");
    expect(answerKey(f.numeric({ answer: 5, tolerance: 0, unit: "kg" }))).toBe("5 kg");
  });

  test("essay and drawing show their rubric, or that they are graded by hand", () => {
    expect(answerKey(f.essay())).toBe("Thesis (1); Evidence (3); 4 pts in all");
    expect(answerKey(f.essay({ rubric: [] }))).toBe("Graded by hand");
    expect(answerKey(f.drawing())).toBe("Neat (4); 4 pts in all");
    expect(answerKey(f.drawing({ rubric: [] }))).toBe("Graded by hand");
  });

  test("code counts its tests, sql shows the answer query", () => {
    expect(answerKey(f.code())).toBe("Passes 4 test cases");
    expect(answerKey(f.code({ tests: [f.code().tests[0]!] }))).toBe("Passes 1 test case");
    expect(answerKey(f.sql())).toBe("SELECT a FROM t");
    expect(answerKey(f.sql({ answerSql: "  SELECT 1  " }))).toBe("SELECT 1");
    expect(answerKey(f.sql({ answerSql: "  " }))).toBe("Returns the expected rows");
  });

  test("categorization lists each category and what is left unsorted", () => {
    expect(answerKey(f.categorization())).toBe("Fruit: Apple, Pear; Vegetable: Carrot; Left unsorted: Rock");
    const q = f.categorization({ categories: [{ id: "x", name: " " }], items: [{ id: "i", text: "", categoryId: "other", imageId: "pic" }] });
    expect(answerKey(q)).toBe("(unnamed): —");
  });

  test("ordering shows the right order", () => {
    expect(answerKey(f.ordering())).toBe("First → Second → Third → Fourth");
  });

  test("hotspot counts the areas and names the labelled ones", () => {
    expect(answerKey(f.hotspot())).toBe("2 areas: North");
    expect(answerKey(f.hotspot({ regions: [{ id: "g", shape: "rect", x: 0, y: 0, w: 1, h: 1 }] }))).toBe("1 area");
  });
});

describe("answer text", () => {
  test("a missing or null answer is empty text for every type", () => {
    for (const q of f.oneOfEach()) {
      expect(answerText(q, undefined)).toBe("");
      expect(answerText(q, null)).toBe("");
    }
  });

  test("multiple choice names the picked choices", () => {
    expect(answerText(f.mc(), "b")).toBe("Beta");
    expect(answerText(f.mc({ multipleCorrect: true }), ["a", "c"])).toBe("Alpha; Gamma");
    expect(answerText(f.mc(), "gone")).toBe("");
  });

  test("true/false", () => {
    expect(answerText(f.tf(), true)).toBe("True");
    expect(answerText(f.tf(), false)).toBe("False");
    expect(answerText(f.tf(), "true")).toBe("");
  });

  test("typed answers are trimmed, boxes joined, empty boxes shown as dashes", () => {
    expect(answerText(f.blank(), ["pk", " ", ""])).toBe("pk; —; —");
    expect(answerText(f.blank(), ["", " "])).toBe("");
    expect(answerText(f.enumeration(), [" a ", "b"])).toBe("a; b");
    expect(answerText(f.numeric(), " 3.14 ")).toBe("3.14");
    expect(answerText(f.essay(), "  My essay \n")).toBe("My essay");
    expect(answerText(f.code(), "print(1)")).toBe("print(1)");
    expect(answerText(f.sql(), "SELECT 1")).toBe("SELECT 1");
    expect(answerText(f.essay(), "   ")).toBe("");
  });

  test("matching shows each pair and a dash for an unmatched left item", () => {
    expect(answerText(f.matching(), ["r1", "", "r3", "r4"])).toBe("Dog → Bark; Cat → —; Cow → Moo; Owl → Quack");
    expect(answerText(f.matching(), ["", "", "", ""])).toBe("");
    expect(answerText(f.matching(), "r1")).toBe("");
  });

  test("drawing counts strokes and photos, and an empty or unreadable drawing is empty", () => {
    expect(answerText(f.drawing(), drawn(2, ["p1"]))).toBe("Drawing (2 strokes, 1 photo)");
    expect(answerText(f.drawing(), drawn(1))).toBe("Drawing (1 stroke)");
    expect(answerText(f.drawing(), drawn(0, ["p1", "p2"]))).toBe("Drawing (2 photos)");
    expect(answerText(f.drawing(), drawn(0))).toBe("");
    expect(answerText(f.drawing(), "garbage")).toBe("");
  });

  test("categorization groups the items by category and lists the unsorted", () => {
    const q = f.categorization();
    expect(answerText(q, JSON.stringify({ i1: "fruit", i2: "veg" }))).toBe("Fruit: Apple; Vegetable: Carrot; Unsorted: Pear, Rock");
    expect(answerText(q, JSON.stringify({ i1: "fruit", i2: "veg", i3: "fruit", i4: null }))).toBe("Fruit: Apple, Pear; Vegetable: Carrot; Unsorted: Rock");
    expect(answerText(q, JSON.stringify({ i1: null }))).toBe("");
    expect(answerText(q, "garbage")).toBe("");
  });

  test("ordering shows the student's order when it is a full one", () => {
    expect(answerText(f.ordering(), ["o2", "o1", "o3", "o4"])).toBe("Second → First → Third → Fourth");
    expect(answerText(f.ordering(), ["o2", "o1"])).toBe("");
    expect(answerText(f.ordering(), ["o1", "o1", "o3", "o4"])).toBe("");
  });

  test("hotspot counts the markers", () => {
    expect(answerText(f.hotspot(), JSON.stringify([{ x: 0.1, y: 0.1 }]))).toBe("1 marker");
    expect(answerText(f.hotspot(), JSON.stringify([{ x: 0.1, y: 0.1 }, { x: 2, y: -1 }]))).toBe("2 markers");
    expect(answerText(f.hotspot(), "[]")).toBe("");
    expect(answerText(f.hotspot(), "garbage")).toBe("");
  });
});
