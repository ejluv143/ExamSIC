import { describe, expect, test } from "bun:test";
import { aiQuestionTypes } from "./ai.ts";
import { allKinds, questionKinds } from "./kinds/index.ts";
import { questionTypes } from "./question.ts";
import { reviewableTypes } from "./scoring.ts";

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
});
