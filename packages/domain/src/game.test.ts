import { describe, expect, test } from "bun:test";
import { gameQuestionProblems } from "./game.ts";

describe("gameQuestionProblems with a relay", () => {
  const drawing = [{ type: "drawing", gamePoints: "none" }] as const;
  const mcq = [{ type: "mcq", gamePoints: "standard" }] as const;

  test("a relay refuses drawings even as No points", () => {
    expect(gameQuestionProblems("student", drawing, true).some((p) => p.includes("Team Relay"))).toBe(true);
  });
  test("a classic student-paced game still takes No-points drawings", () => {
    expect(gameQuestionProblems("student", drawing)).toEqual([]);
    expect(gameQuestionProblems("student", drawing, false)).toEqual([]);
  });
  test("a classic game takes drawings with points; they just score nothing", () => {
    expect(gameQuestionProblems("teacher", [{ type: "drawing", gamePoints: "standard" }])).toEqual([]);
  });
  test("a relay refuses drawings with points once, with the relay reason", () => {
    const problems = gameQuestionProblems("student", [{ type: "drawing", gamePoints: "standard" }], true);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Team Relay");
  });
  test("a relay still refuses essays and empty quizzes", () => {
    const problems = gameQuestionProblems("student", [{ type: "essay", gamePoints: "none" }], true);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("Team Relay");
    expect(gameQuestionProblems("student", [], true)).toHaveLength(1);
  });
  test("a relay takes ordinary and code questions when student-paced", () => {
    expect(gameQuestionProblems("student", [...mcq, { type: "code", gamePoints: "standard" }], true)).toEqual([]);
  });
});

describe("gameQuestionProblems without a relay", () => {
  test("a game takes essays, whatever their game points", () => {
    expect(gameQuestionProblems("teacher", [{ type: "essay", gamePoints: "standard" }])).toEqual([]);
    expect(gameQuestionProblems("student", [{ type: "essay", gamePoints: "none" }])).toEqual([]);
  });
  test("a teacher-paced game takes code and SQL questions", () => {
    expect(gameQuestionProblems("teacher", [{ type: "code", gamePoints: "standard" }])).toEqual([]);
    expect(gameQuestionProblems("teacher", [{ type: "sql", gamePoints: "double" }])).toEqual([]);
  });
});
