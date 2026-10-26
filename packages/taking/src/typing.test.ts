import { expect, test } from "bun:test";
import { logEdits, logTyped, typedTypes } from "./typing.ts";
import { analyzeTyping, applyEdit, maxEdits, replay } from "./typing-analysis.ts";
import type { Typing } from "./types.ts";

const startedAt = new Date(Date.now() - 5000).toISOString();

test("logTyped records the replaced range and the inserted text", () => {
  const typing: Typing = {};
  logTyped(typing, "q", startedAt, "hello world", "hello brave world");
  const edit = typing.q?.[0];
  expect(edit?.slice(1)).toEqual([6, 6, "brave "]);
  logTyped(typing, "q", startedAt, "same", "same");
  expect(typing.q).toHaveLength(1);
  logTyped(typing, "q", startedAt, undefined, ["a", "b"]);
  expect(typing.q?.[1]?.slice(1)).toEqual([0, 0, "a\nb"]);
});

test("logTyped stops at the cap and logEdits keeps editor edits", () => {
  const typing: Typing = { q: Array.from({ length: maxEdits }, () => [0, 0, 0, "x"]) };
  logTyped(typing, "q", startedAt, "a", "ab");
  expect(typing.q).toHaveLength(maxEdits);
  const other: Typing = {};
  logEdits(other, "c", startedAt, [{ from: 0, to: 0, insert: "x" }, { from: 1, to: 1, insert: "y" }]);
  expect(other.c?.map((e) => e.slice(1))).toEqual([[0, 0, "x"], [1, 1, "y"]]);
  expect(typedTypes.has("essay")).toBe(true);
  expect(typedTypes.has("code")).toBe(false);
});

test("replay and applyEdit rebuild the text", () => {
  const edits = [[0, 0, 0, "ab"], [10, 1, 1, "X"]] as const;
  expect(applyEdit("", edits[0])).toBe("ab");
  expect(replay("", edits)).toBe("aXb");
  expect(replay("", edits, 1)).toBe("ab");
});

test("analyzeTyping flags bulk inserts, robot typing and mismatches", () => {
  const typed = Array.from({ length: 50 }, (_, i) => [i * 20, i, i, "a"] as [number, number, number, string]);
  const robot = analyzeTyping("", typed, "a".repeat(50));
  expect(robot.flags).toEqual(["robot_typing"]);
  expect(robot.typedChars).toBe(50);
  expect(robot.robotRuns[0]?.chars).toBe(50);

  const bulk = analyzeTyping("", [[100, 0, 0, "x".repeat(40)]], "x".repeat(40));
  expect(bulk.flags).toEqual(["bulk_insert"]);
  expect(bulk.largestInsert).toEqual({ chars: 40, at: 100 });

  const slow = analyzeTyping("", [[0, 0, 0, "a"], [3 * 60_000, 1, 1, "b"]], "ab");
  expect(slow.idleGaps).toBe(1);
  expect(slow.flags).toEqual([]);

  expect(analyzeTyping("", [[0, 0, 0, "a"]], "zzz").flags).toEqual(["replay_mismatch"]);
  expect(analyzeTyping("start", [], "start").flags).toEqual([]);
});
