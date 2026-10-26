import { expect, test } from "bun:test";
import { QuestionType } from "@examinus/domain/question";
import { checkQuery, formatTable, sameResult } from "./sql.ts";
import { editorModels, modelOf } from "./editor-model.ts";
import { matchRubric, newId, rescaleRubric, rubricProblem, yes, no } from "./editor-shared.ts";
import { parseNumber } from "./math.ts";
import { plainText } from "./plain-text.ts";
import { previewText } from "./preview-text.ts";
import { languageLabel, runsInBrowser, starterTemplates } from "./code.ts";

test("every question type has a model that creates a question of its type", () => {
  for (const [type, model] of Object.entries(editorModels)) {
    expect(model.type).toBe(type as never);
    const q = model.create("abc");
    expect(q.type).toBe(type as never);
    expect(q.id).toBe("abc");
    expect(modelOf(q)).toBe(model as never);
    expect(typeof modelOf(q).summary(q)).toBe("string");
    expect(["key", "rubric", "tests"]).toContain(model.answer.icon);
    const error = modelOf(q).validate?.(q) ?? null;
    expect(error === null || typeof error === "string").toBe(true);
  }
});

test("models cover every question type in the domain", () => {
  expect(Object.keys(editorModels).sort()).toEqual([...QuestionType.literals].sort());
});

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
  const q = rescaleRubric({ points: 4, rubric: rows }, 10);
  expect(q.rubric.reduce((n, r) => n + r.points, 0)).toBe(10);
  expect(rubricProblem({ rubric: rows, points: 4 })).toBeNull();
  expect(rubricProblem({ rubric: rows, points: 5 })).toContain("not 5");
  expect(yes.test("Yes") && no.test("false")).toBe(true);
});

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
