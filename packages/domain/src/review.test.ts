import { describe, expect, test } from "bun:test";
import { encodeDrawingAnswer, type Stroke } from "./drawing.ts";
import { answerGiven, answerSummary, defaultMaxMarked, defaultNavigation, markLimitMessage, moveRefusal } from "./review.ts";
import * as f from "./test-fixtures.ts";
import { toStudentQuestion } from "./question.ts";

const stroke: Stroke = { tool: "pen", color: "#000", size: 2, points: [[0, 0, 1]], at: 0, ms: 10 };
const drawn = (strokes: number, photos: string[] = [], assetId: string | null = null) =>
  encodeDrawingAnswer({ strokes: Array.from({ length: strokes }, () => stroke), assetId, photos });

describe("answerGiven", () => {
  test("nothing, null, blank text and lists of blank boxes say nothing", () => {
    for (const q of f.oneOfEach()) {
      expect(answerGiven(q, undefined)).toBe(false);
      expect(answerGiven(q, null)).toBe(false);
    }
    expect(answerGiven(f.essay(), "  ")).toBe(false);
    expect(answerGiven(f.blank(), ["", " "])).toBe(false);
    expect(answerGiven(f.blank(), [])).toBe(false);
  });

  test("text, a box with text and false all say something", () => {
    expect(answerGiven(f.essay(), "hi")).toBe(true);
    expect(answerGiven(f.blank(), ["", "x"])).toBe(true);
    expect(answerGiven(f.tf(), false)).toBe(true);
  });

  test("untouched starter code doesn't count, edited code does", () => {
    expect(answerGiven(f.code(), "print()")).toBe(false);
    expect(answerGiven(f.code(), "  print()  ")).toBe(false);
    expect(answerGiven(f.code(), "print(1)")).toBe(true);
    expect(answerGiven(f.sql(), "SELECT ")).toBe(false);
    expect(answerGiven(f.sql(), "SELECT 1")).toBe(true);
  });

  test("an empty canvas doesn't count, strokes, a picture or photos do", () => {
    expect(answerGiven(f.drawing(), drawn(0))).toBe(false);
    expect(answerGiven(f.drawing(), "garbage")).toBe(false);
    expect(answerGiven(f.drawing(), drawn(1))).toBe(true);
    expect(answerGiven(f.drawing(), drawn(0, [], "asset"))).toBe(true);
    expect(answerGiven(f.drawing(), drawn(0, ["p1"]))).toBe(true);
  });

  test("works on the student's question too", () => {
    const student = toStudentQuestion(f.code());
    expect(answerGiven(student, "print()")).toBe(false);
    expect(answerGiven(student, "print(1)")).toBe(true);
  });
});

describe("answerSummary", () => {
  test("null when there is no answer", () => {
    expect(answerSummary(f.mc(), undefined)).toBeNull();
    expect(answerSummary(f.mc(), null)).toBeNull();
    expect(answerSummary(f.blank(), ["", ""])).toBeNull();
    expect(answerSummary(f.code(), "print()")).toBeNull();
    expect(answerSummary(f.drawing(), drawn(0))).toBeNull();
  });

  test("multiple choice letters the choices", () => {
    expect(answerSummary(f.mc(), "b")).toBe("B. Beta");
    expect(answerSummary(f.mc({ multipleCorrect: true }), ["a", "d"])).toBe("A. Alpha; D. Delta");
  });

  test("a choice with only a picture is named by its alt text, or 'Picture'", () => {
    const q = f.mc({ choices: [{ id: "a", text: "", imageId: "i", alt: "A cat" }, { id: "b", text: "", imageId: "j" }] });
    expect(answerSummary(q, "a")).toBe("A. A cat");
    expect(answerSummary(q, "b")).toBe("B. Picture");
  });

  test("true/false", () => {
    expect(answerSummary(f.tf(), true)).toBe("True");
    expect(answerSummary(f.tf(), false)).toBe("False");
  });

  test("typed lists are joined on one line with dashes for empty boxes", () => {
    expect(answerSummary(f.blank(), ["PK", " "])).toBe("PK · —");
    expect(answerSummary(f.enumeration(), ["a", "b"])).toBe("a · b");
  });

  test("matching, categorization, ordering and hotspot count their progress", () => {
    expect(answerSummary(f.matching(), ["r1", "", "", "r2"])).toBe("2 of 4 matched");
    expect(answerSummary(f.categorization(), JSON.stringify({ i1: "fruit", i2: null, i3: "fruit" }))).toBe("2 of 4 sorted");
    expect(answerSummary(f.ordering(), ["o1", "o2", "o3", "o4"])).toBe("Order set");
    expect(answerSummary(f.hotspot(), JSON.stringify([{ x: 0, y: 0 }]))).toBe("1 marker");
    expect(answerSummary(f.hotspot(), JSON.stringify([{ x: 0, y: 0 }, { x: 1, y: 1 }]))).toBe("2 markers");
  });

  test("code and sql count their lines", () => {
    expect(answerSummary(f.code(), "a")).toBe("1 line of code");
    expect(answerSummary(f.code(), "a\nb\nc\n")).toBe("3 lines of code");
    expect(answerSummary(f.sql(), "SELECT 1")).toBe("1 line of SQL");
    expect(answerSummary(f.sql(), "SELECT 1\nFROM t")).toBe("2 lines of SQL");
  });

  test("drawings say whether there is a drawing and how many photos", () => {
    expect(answerSummary(f.drawing(), drawn(2))).toBe("Drawing");
    expect(answerSummary(f.drawing(), drawn(0, [], "asset"))).toBe("Drawing");
    expect(answerSummary(f.drawing(), drawn(1, ["p"]))).toBe("Drawing and 1 photo");
    expect(answerSummary(f.drawing(), drawn(1, ["p", "q"]))).toBe("Drawing and 2 photos");
    expect(answerSummary(f.drawing(), drawn(0, ["p"]))).toBe("1 photo");
  });

  test("text types show the text on one line, without markdown, cut at 80 characters", () => {
    expect(answerSummary(f.numeric(), "3.14")).toBe("3.14");
    expect(answerSummary(f.essay(), "**Bold**\n\nand `code`")).toBe("Bold and code");
    const long = answerSummary(f.essay(), "word ".repeat(40))!;
    expect(long.length).toBe(80);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("navigation defaults", () => {
  test("exams move forward and allow 5 marks, other modes are free", () => {
    expect(defaultNavigation("exam")).toBe("marked_only");
    expect(defaultMaxMarked("exam")).toBe(5);
    for (const mode of ["quiz", "mastery", "game"] as const) {
      expect(defaultNavigation(mode)).toBe("free");
      expect(defaultMaxMarked(mode)).toBeNull();
    }
  });

  test("the mark limit message pluralises", () => {
    expect(markLimitMessage(1)).toBe("You can mark at most 1 question for review.");
    expect(markLimitMessage(5)).toBe("You can mark at most 5 questions for review.");
  });
});

describe("moveRefusal", () => {
  const input = (over: Partial<Parameters<typeof moveRefusal>[0]> = {}): Parameters<typeof moveRefusal>[0] => ({
    navigation: "free",
    from: 2,
    to: 3,
    furthest: 2,
    total: 6,
    target: { marked: false, closed: false },
    current: { answered: false, marked: false, timeUp: false },
    ...over,
  });
  const outside = "That question isn't on your paper.";
  const inOrder = "Answer the questions in order: go on to the next question first.";

  test("a question that isn't on the paper is refused in every mode", () => {
    for (const navigation of ["free", "forward_only", "marked_only"] as const) {
      for (const to of [-1, 6, 99, 1.5, Number.NaN]) expect(moveRefusal(input({ navigation, to }))).toBe(outside);
    }
  });

  test("staying on the same question is always fine", () => {
    for (const navigation of ["free", "forward_only", "marked_only"] as const) {
      expect(moveRefusal(input({ navigation, to: 2 }))).toBeNull();
    }
  });

  test("a question whose time ran out never reopens", () => {
    for (const navigation of ["free", "forward_only", "marked_only"] as const) {
      expect(moveRefusal(input({ navigation, to: 0, furthest: 4, target: { marked: true, closed: true } }))).toBe(
        "The time for question 1 ran out, so it can't be opened again.",
      );
    }
  });

  test("free goes anywhere", () => {
    expect(moveRefusal(input({ to: 5 }))).toBeNull();
    expect(moveRefusal(input({ to: 0 }))).toBeNull();
  });

  test("forward only goes on to the next question once this one is answered or timed out", () => {
    const nav = { navigation: "forward_only" } as const;
    expect(moveRefusal(input({ ...nav, to: 3 }))).toBe("Answer this question before moving on.");
    expect(moveRefusal(input({ ...nav, to: 3, current: { answered: true, marked: false, timeUp: false } }))).toBeNull();
    expect(moveRefusal(input({ ...nav, to: 3, current: { answered: false, marked: false, timeUp: true } }))).toBeNull();
    expect(moveRefusal(input({ ...nav, to: 3, current: { answered: false, marked: true, timeUp: false } }))).toBe(
      "Answer this question before moving on.",
    );
  });

  test("forward only never goes back or skips ahead", () => {
    const nav = { navigation: "forward_only", current: { answered: true, marked: false, timeUp: false } } as const;
    expect(moveRefusal(input({ ...nav, to: 1 }))).toBe("This session doesn't let you go back to earlier questions.");
    expect(moveRefusal(input({ ...nav, to: 4 }))).toBe(inOrder);
  });

  test("marked only returns to marked questions", () => {
    const base = { navigation: "marked_only", from: 3, furthest: 3, to: 1 } as const;
    expect(moveRefusal(input({ ...base, target: { marked: true, closed: false } }))).toBeNull();
    expect(moveRefusal(input({ ...base }))).toBe("You can only go back to questions marked for review. Question 2 isn't marked.");
  });

  test("marked only returns to the furthest question, but not past it without going on first", () => {
    const base = { navigation: "marked_only", from: 1, furthest: 3 } as const;
    expect(moveRefusal(input({ ...base, to: 3 }))).toBeNull();
    expect(moveRefusal(input({ ...base, to: 4 }))).toBe("Go on from question 4 first.");
    expect(moveRefusal(input({ ...base, to: 5 }))).toBe("Go on from question 4 first.");
  });

  test("marked only goes on from the furthest question once it is answered, marked or timed out", () => {
    const base = { navigation: "marked_only", from: 3, furthest: 3, to: 4 } as const;
    expect(moveRefusal(input({ ...base }))).toBe("Answer this question, or mark it for review, before moving on.");
    expect(moveRefusal(input({ ...base, current: { answered: true, marked: false, timeUp: false } }))).toBeNull();
    expect(moveRefusal(input({ ...base, current: { answered: false, marked: true, timeUp: false } }))).toBeNull();
    expect(moveRefusal(input({ ...base, current: { answered: false, marked: false, timeUp: true } }))).toBeNull();
    expect(moveRefusal(input({ ...base, to: 5, current: { answered: true, marked: true, timeUp: true } }))).toBe(inOrder);
  });
});
