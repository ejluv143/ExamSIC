import { describe, expect, test } from "bun:test";
import { aiQuestionTypes } from "./ai.ts";
import { allKinds, kindOf, questionKinds, questionTypesFor } from "./kinds/index.ts";
import { matchRubric, newId, rescaleRubric, rubricProblem, no, yes, type SheetRow } from "./kinds/editor.ts";
import { languageLabel, runsInBrowser, starterTemplates } from "./kinds/code.ts";
import { plainText, previewText } from "./markdown.ts";
import { parseNumber } from "./numbers.ts";
import { questionTypes, type Question, type QuestionType } from "./question.ts";
import type { AnswerValue } from "./quiz.ts";
import { partialCreditApplies, practiceTypes, reviewableTypes } from "./scoring.ts";
import { subjectAreaNames } from "./roles.ts";
import { checkQuery, formatTable, sameResult } from "./sql.ts";
import * as f from "./test-fixtures.ts";

// One row of the import template, with the cells a test names; the rest are empty.
function row(over: Partial<Pick<SheetRow, "answer" | "options" | "points">> & { cells?: Record<string, string> } = {}): SheetRow {
  const options = over.options ?? [];
  const answer = over.answer ?? "";
  return {
    prompt: "Prompt",
    points: over.points ?? 1,
    rawPoints: over.points === undefined ? "" : String(over.points),
    base: { id: "x", prompt: "Prompt", points: over.points ?? 1, gamePoints: "standard", partialCredit: true },
    answer,
    options,
    optionByNumber: (a) => (/^\d+$/.test(a) ? (options[Number(a) - 1] ?? null) : null),
    at: (column) => over.cells?.[column] ?? "",
  };
}

type Case = {
  q: Question;
  label: string;
  // What the type's key and the table's Answer column say about `q`.
  key: string;
  summary: string;
  // [answer, fraction of the points]: what scoring makes of answers (null: needs a teacher or a checker).
  scores: [AnswerValue, number | null][];
  // A question of the type that fails validation, with the message.
  invalid?: [Question, string];
  // Spreadsheet rows: the import template's type names, and rows with what they become (or fail with).
  sheet?: { aliases: string[]; rows: [SheetRow, Partial<Question> | { error: string }][] };
};

// Every question type has a case: a type missing here is a compile error.
const cases: { readonly [T in QuestionType]: Case } = {
  multiple_choice: {
    q: f.mc(),
    label: "Multiple choice",
    key: "Alpha",
    summary: "A. Alpha",
    scores: [["a", 1], ["b", 0], [null, 0]],
    invalid: [f.mc({ correctChoiceIds: [] }), "needs a correct choice."],
    sheet: {
      aliases: ["multiple choice", "mcq"],
      rows: [
        [row({ answer: "2", options: ["Red", "Blue"] }), { choices: [{ id: "a", text: "Red" }, { id: "b", text: "Blue" }], correctChoiceIds: ["b"] }],
        [row({ answer: "red", options: ["Red", "Blue"] }), { correctChoiceIds: ["a"] }],
        [row({ answer: "1", options: ["Red"] }), { error: "Multiple choice needs at least 2 options." }],
        [row({ answer: "1,2", options: ["Red", "Blue"] }), { error: "Only one correct option is supported per question." }],
        [row({ answer: "Green", options: ["Red", "Blue"] }), { error: "Correct Answer “Green” doesn't match any option." }],
      ],
    },
  },
  true_false: {
    q: f.tf(),
    label: "True / False",
    key: "True",
    summary: "True",
    scores: [[true, 1], [false, 0]],
    sheet: {
      aliases: ["true/false", "tf"],
      rows: [
        [row({ answer: "TRUE" }), { answer: true }],
        [row({ answer: "f" }), { answer: false }],
        [row({ answer: "2", options: ["True", "False"] }), { answer: false }],
        [row({ answer: "maybe" }), { error: "Correct Answer must be True or False." }],
      ],
    },
  },
  blank: {
    q: f.blank(),
    label: "Identification",
    key: "primary key / PK; row",
    summary: "primary key / PK; row",
    scores: [[["PK", "row"], 1], [["PK", "column"], 0]],
    invalid: [f.blank({ prompt: "No blanks here." }), "has no blanks. Use + Blank to mark each answer."],
    sheet: {
      aliases: ["identification", "short answer"],
      rows: [
        [row({ answer: "Paris" }), { prompt: "Prompt {{Paris}}" }],
        [row({ answer: "a|b", options: ["c"] }), { prompt: "Prompt {{a|b|c}}" }],
        [{ ...row(), prompt: "The [sky] is blue" }, { prompt: "The {{sky}} is blue" }],
        [row(), { error: "Add the answer in Correct Answer, or put it in [brackets] in the question. Separate alternatives with |." }],
      ],
    },
  },
  matching: {
    q: f.matching(),
    label: "Matching",
    key: "Dog → Bark; Cat → Meow; Cow → Moo; Owl → Bark",
    summary: "4 pairs",
    scores: [[["r1", "r2", "r3", "r1"], 1], [["r1", "r2", "r3", "r4"], 0]],
    invalid: [f.matching({ left: [] }), "needs at least one item to match."],
  },
  enumeration: {
    q: f.enumeration(),
    label: "Enumeration",
    key: "1NF / First Normal Form; 2NF; 3NF; BCNF",
    summary: "1NF|First Normal Form; 2NF; 3NF; BCNF",
    scores: [[["First Normal Form", "2nf", "3NF", "BCNF"], 1], [["1NF"], 0]],
    invalid: [f.enumeration({ items: ["a", " "] }), "has an empty enumeration item."],
    sheet: {
      aliases: ["enumeration", "list"],
      rows: [
        // Without points of its own, a row is worth one point per item.
        [row({ answer: "a; b; c" }), { items: ["a", "b", "c"], points: 3 }],
        [row({ options: ["a", "b"], points: 5 }), { items: ["a", "b"], points: 5 }],
        [row(), { error: "List the expected items in Option 1–5, or in Correct Answer separated by ;." }],
      ],
    },
  },
  numeric: {
    q: f.numeric(),
    label: "Numeric",
    // The editor's Answer column reads the same as the key.
    key: "3.14 ± 0.01 cm",
    summary: "3.14 ± 0.01 cm",
    scores: [["3.14", 1], ["22/7", 1], ["3.2", 0], ["abc", 0]],
    sheet: {
      aliases: ["numeric", "number"],
      rows: [
        [row({ answer: "3/4", cells: { Tolerance: "0.5", Unit: "m" } }), { answer: 0.75, tolerance: 0.5, unit: "m" }],
        [row({ answer: "x" }), { error: "Correct Answer must be a number, like 12, -3.5 or 3/4 (got “x”)." }],
        [row({ answer: "1", cells: { Tolerance: "-1" } }), { error: "Tolerance must be 0 or more (got “-1”)." }],
      ],
    },
  },
  essay: {
    q: f.essay(),
    label: "Essay",
    key: "Thesis (1); Evidence (3); 4 pts in all",
    summary: "Rubric: 2 rows",
    scores: [["A long answer", null], [null, null]],
    invalid: [f.essay({ rubric: [{ id: "r", criterion: "Thesis", points: 1 }] }), "has a rubric worth 1 points, not 4."],
    sheet: {
      aliases: ["essay", "open-ended"],
      rows: [
        [row({ answer: "Argue well", points: 6 }), { rubric: [{ id: "r1", criterion: "Argue well", points: 6 }] }],
        [row(), { rubric: [] }],
      ],
    },
  },
  code: {
    q: f.code(),
    label: "Code",
    key: "Passes 4 test cases",
    summary: "python · 4 tests",
    scores: [["print(1)", null]],
    invalid: [f.code({ tests: [] }), "needs at least one test case."],
  },
  sql: {
    q: f.sql(),
    label: "SQL query",
    key: "SELECT a FROM t",
    summary: "SELECT a FROM t",
    scores: [["select 1", null]],
    invalid: [f.sql({ answerSql: "drop table t" }), "answer query: Write a SELECT query (it can start with WITH)."],
  },
  drawing: {
    q: f.drawing(),
    label: "Drawing",
    key: "Neat (4); 4 pts in all",
    summary: "Rubric: 1 rows",
    scores: [[null, null]],
    invalid: [f.drawing({ allowDraw: false, allowUpload: false }), "must let students draw, upload photos, or both."],
  },
  categorization: {
    q: f.categorization(),
    label: "Categorization",
    key: "Fruit: Apple, Pear; Vegetable: Carrot; Left unsorted: Rock",
    summary: "2 categories · 4 items",
    scores: [[null, 0]],
    invalid: [f.categorization({ categories: [{ id: "x", name: "One" }] }), "needs 2 to 6 categories."],
  },
  ordering: {
    q: f.ordering(),
    label: "Re-ordering",
    key: "First → Second → Third → Fourth",
    summary: "4 items in order",
    scores: [[null, 0]],
    invalid: [f.ordering({ items: [{ id: "a", text: "A" }] }), "needs 3 to 10 items to put in order."],
  },
  hotspot: {
    q: f.hotspot(),
    label: "Hotspot",
    key: "2 areas: North",
    summary: "2 areas",
    scores: [[null, 0]],
    invalid: [f.hotspot({ imageId: "" }), "needs an image."],
  },
};

describe("question kinds", () => {
  test("the registry has one kind per question type, in order", () => {
    expect(allKinds().map((k) => k.type)).toEqual([...questionTypes]);
    for (const type of questionTypes) expect(questionKinds[type].type).toBe(type);
  });

  test("the types the AI drafts are the kinds that have a draft", () => {
    expect(allKinds().filter((k) => k.draft).map((k) => k.type)).toEqual([...aiQuestionTypes]);
  });

  test("typed answers a teacher may re-score are the reviewable ones", () => {
    expect(reviewableTypes).toEqual(["blank", "enumeration", "essay", "code", "sql", "drawing"]);
  });

  test("typing is kept for code, SQL, essay, blank and enumeration answers", () => {
    expect(allKinds().filter((k) => k.typing).map((k) => k.type)).toEqual(["blank", "enumeration", "essay", "code", "sql"]);
  });

  test("practice offers what needs neither a teacher nor a runner", () => {
    expect(practiceTypes).toEqual([
      "multiple_choice",
      "true_false",
      "blank",
      "matching",
      "enumeration",
      "numeric",
      "categorization",
      "ordering",
      "hotspot",
    ]);
  });

  test("each subject offers the types that name it, in the order of the types", () => {
    expect(questionTypesFor.programming).toEqual(["multiple_choice", "true_false", "blank", "matching", "enumeration", "code", "sql", "categorization", "ordering"]);
    expect(questionTypesFor.math).toEqual(["multiple_choice", "true_false", "blank", "matching", "enumeration", "numeric", "drawing", "ordering"]);
    for (const area of subjectAreaNames) expect(questionTypesFor[area].length).toBeGreaterThan(0);
  });
});

describe.each(questionTypes.map((type) => [type, cases[type]] as const))("%s", (type, c) => {
  const kind = questionKinds[type];

  test("label, key and summary", () => {
    expect(kind.label).toBe(c.label);
    expect(kindOf(c.q).answerKey(c.q)).toBe(c.key);
    expect(kind.editor.summary(c.q as never)).toBe(c.summary);
  });

  test("scoring", () => {
    for (const [answer, fraction] of c.scores) expect(kind.autoScore(c.q as never, answer)).toBe(fraction);
  });

  test("a new question is of the type, with the id, and has nothing the editor can't show", () => {
    const q = kind.create("abc");
    expect(q.type).toBe(type);
    expect(q.id).toBe("abc");
    expect(typeof kind.editor.summary(q as never)).toBe("string");
    expect(["key", "rubric", "tests"]).toContain(kind.editor.answer.icon);
    // The fixture is a complete question; a type that needs more than a click to make valid says so with a message.
    expect(kind.validate?.(c.q as never) ?? null).toBeNull();
  });

  test("validation names what is wrong", () => {
    if (!c.invalid) return;
    const [q, message] = c.invalid;
    expect(kind.validate?.(q as never)).toBe(message);
  });

  test("the spreadsheet import", () => {
    if (!c.sheet) {
      expect(kind.sheet).toBeUndefined();
      return;
    }
    expect(kind.sheet!.aliases).toEqual(expect.arrayContaining(c.sheet.aliases));
    for (const [input, expected] of c.sheet.rows) {
      const result = kind.sheet!.parse(input);
      if ("error" in expected) expect(result).toEqual(expected);
      else expect(result).toMatchObject({ type, ...expected });
    }
  });
});

describe("the Answer column", () => {
  test("true/false takes yes or no words, and a letter picks a choice", () => {
    const tf = kindOf(f.tf()).editor.answerCell!;
    expect(tf.parse(f.tf() as never, "no")).toEqual({ question: { ...f.tf(), answer: false } });
    expect(tf.parse(f.tf() as never, "maybe")).toEqual({ error: "“maybe” is not True or False." });
    const mc = kindOf(f.mc()).editor.answerCell!;
    expect(mc.text(f.mc() as never)).toBe("A");
    expect(mc.parse(f.mc() as never, "b, c")).toMatchObject({ question: { correctChoiceIds: ["b", "c"], multipleCorrect: true } });
    expect(mc.parse(f.mc() as never, "z")).toEqual({ error: "Name the correct choice by letter, A to D. Several: “A, C”." });
  });

  test("numeric reads numbers the way students type them", () => {
    const cell = kindOf(f.numeric()).editor.answerCell!;
    expect(cell.parse(f.numeric() as never, "1 1/2")).toMatchObject({ question: { answer: 1.5 } });
    expect(cell.parse(f.numeric() as never, "abc")).toEqual({ error: "“abc” is not a number." });
  });

  test("enumeration drops weights that no longer fit when the items change", () => {
    const q = f.enumeration({ weights: [1, 2, 3, 4] });
    const cell = kindOf(q).editor.answerCell!;
    const { weights: _weights, ...rest } = q;
    expect(cell.parse(q as never, "a; b")).toEqual({ question: { ...rest, items: ["a", "b"] } });
    expect(cell.parse(q as never, "a; b; c; d")).toEqual({ question: { ...q, items: ["a", "b", "c", "d"] } });
  });
});

describe("partial credit and points", () => {
  test("the switch shows for a split of points, a multi-answer choice and SQL", () => {
    expect(partialCreditApplies(f.blank())).toBe(true);
    expect(partialCreditApplies(f.blank({ prompt: "One {{blank}}." }))).toBe(false);
    expect(partialCreditApplies(f.mc())).toBe(false);
    expect(partialCreditApplies(f.mc({ multipleCorrect: true }))).toBe(true);
    expect(partialCreditApplies(f.sql())).toBe(true);
    expect(partialCreditApplies(f.numeric())).toBe(false);
  });

  test("rubric types scale their rows with the points", () => {
    const q = f.essay();
    const scaled = kindOf(q).rescale!(q as never, 10) as typeof q;
    expect(scaled.points).toBe(10);
    expect(scaled.rubric.reduce((n, r) => n + r.points, 0)).toBe(10);
    expect(kindOf(f.mc()).rescale).toBeUndefined();
  });
});

describe("editor helpers", () => {
  test("newId is 8 characters", () => {
    expect(newId()).toHaveLength(8);
    expect(newId()).not.toBe(newId());
  });

  test("rubric helpers keep the total", () => {
    const rows = [
      { id: "a", criterion: "A", points: 2 },
      { id: "b", criterion: "B", points: 2 },
    ];
    expect(matchRubric(rows, 6).reduce((n, r) => n + r.points, 0)).toBe(6);
    expect(rescaleRubric({ points: 4, rubric: rows }, 10).rubric.reduce((n, r) => n + r.points, 0)).toBe(10);
    expect(rubricProblem({ rubric: rows, points: 4 })).toBeNull();
    expect(rubricProblem({ rubric: rows, points: 5 })).toContain("not 5");
    expect(yes.test("Yes") && no.test("false")).toBe(true);
  });
});

describe("shared text and number helpers", () => {
  test("parseNumber", () => {
    expect(parseNumber("1,250")).toBe(1250);
    expect(parseNumber("3/4")).toBe(0.75);
    expect(parseNumber("1 1/2")).toBe(1.5);
    expect(parseNumber("-1 1/2")).toBe(-1.5);
    expect(parseNumber("25%")).toBe(0.25);
    expect(parseNumber("1/0")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
  });

  test("plainText and previewText strip markdown", () => {
    expect(plainText("**Bold** [link](http://x) $x^2$")).toBe("Bold link x^2");
    expect(previewText("# Title\n- a {{blank}} ![](u)")).toBe("Title a ____ [image]");
  });

  test("checkQuery accepts one SELECT", () => {
    expect(checkQuery("select 1;")).toBeNull();
    expect(checkQuery("-- hi\nWITH a AS (select 1) select * from a")).toBeNull();
    expect(checkQuery("select ';'")).toBeNull();
    expect(checkQuery("")).toBe("Write a query first.");
    expect(checkQuery("drop table x")).toContain("SELECT");
    expect(checkQuery("select 1; select 2")).toBe("Write one query only.");
  });

  test("sql results compare by rows", () => {
    const a = { columns: ["x"], rows: [[1], [2]] };
    const b = { columns: ["y"], rows: [[2], [1]] };
    expect(sameResult(a, b, false)).toBe(true);
    expect(sameResult(a, b, true)).toBe(false);
    expect(formatTable({ columns: [], rows: [] })).toBe("(no result)");
  });

  test("code starters cover every language", () => {
    for (const language of Object.keys(languageLabel) as (keyof typeof languageLabel)[]) {
      expect(starterTemplates[language].length).toBeGreaterThan(0);
    }
    expect(runsInBrowser("python")).toBe(true);
    expect(runsInBrowser("java")).toBe(false);
  });
});
