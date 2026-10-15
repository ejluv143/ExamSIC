// toRevealQuestion (issue #14): a student-facing reveal keeps the answers but never the grading secrets —
// hidden tests, the teacher's rubric, or the hidden SQL data. The result must also match the RevealQuestion schema.
import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { RevealQuestion, toRevealQuestion } from "./question.ts";
import { code, drawing, essay, mc, sql } from "./test-fixtures.ts";

const decodeReveal = Schema.decodeUnknownSync(RevealQuestion);
const has = (o: object, key: string) => Object.hasOwn(o, key);

describe("toRevealQuestion", () => {
  test("code: drops the rubric and every hidden test, keeps the sample tests", () => {
    const revealed = toRevealQuestion(code());
    expect(has(revealed, "rubric")).toBe(false);
    if (revealed.type !== "code") throw new Error("expected code");
    expect(revealed.tests.map((t) => t.id)).toEqual(["t1", "t4"]);
    expect(revealed.tests.every((t) => !t.hidden)).toBe(true);
    expect(revealed.starterCode).toBe("print()");
    expect(() => decodeReveal(revealed)).not.toThrow();
  });

  test("sql: drops the rubric and the hidden data, keeps the reference query and setup", () => {
    const revealed = toRevealQuestion(sql({ hiddenDataSql: "INSERT INTO t VALUES (9);", rubric: "notes" }));
    expect(has(revealed, "rubric")).toBe(false);
    expect(has(revealed, "hiddenDataSql")).toBe(false);
    if (revealed.type !== "sql") throw new Error("expected sql");
    expect(revealed.answerSql).toBe("SELECT a FROM t");
    expect(revealed.setupSql).toBe("CREATE TABLE t (a INT);");
    expect(() => decodeReveal(revealed)).not.toThrow();
  });

  test("essay and drawing: drop the rubric", () => {
    const e = toRevealQuestion(essay());
    const d = toRevealQuestion(drawing());
    expect(has(e, "rubric")).toBe(false);
    expect(has(d, "rubric")).toBe(false);
    expect(() => decodeReveal(e)).not.toThrow();
    expect(() => decodeReveal(d)).not.toThrow();
  });

  test("a type with no secrets is returned unchanged", () => {
    const q = mc();
    expect(toRevealQuestion(q)).toEqual(q);
  });

  test("no hidden test's expected output survives, whatever the teacher wrote", () => {
    const revealed = toRevealQuestion(
      code({ tests: [{ id: "a", input: "", expectedOutput: "SECRET", hidden: true }, { id: "b", input: "", expectedOutput: "shown", hidden: false }] }),
    );
    expect(JSON.stringify(revealed)).not.toContain("SECRET");
  });
});
