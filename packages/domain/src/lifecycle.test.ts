import { describe, expect, test } from "bun:test";
import { lifecycleControls, type LifecycleControls } from "./lifecycle.ts";
import type { SessionMode, SessionStatus } from "./quiz.ts";

const names = (c: LifecycleControls) =>
  Object.entries(c)
    .filter(([, on]) => on)
    .map(([name]) => name);

describe("lifecycleControls", () => {
  const table: [SessionStatus, SessionMode, string[]][] = [
    ["scheduled", "quiz", ["openLobby"]],
    ["scheduled", "game", ["openLobby"]],
    ["lobby", "quiz", ["start", "startFromList", "end", "live"]],
    ["lobby", "exam", ["start", "startFromList", "end", "live"]],
    ["lobby", "game", ["start", "end", "live"]],
    ["running", "quiz", ["pause", "end", "live"]],
    ["running", "mastery", ["pause", "end", "live"]],
    ["running", "game", ["pause", "end", "live"]],
    ["ended", "quiz", []],
    ["ended", "game", []],
  ];
  for (const [status, mode, allowed] of table) {
    test(`${status} ${mode}`, () => {
      expect(names(lifecycleControls({ status, mode }))).toEqual(allowed);
    });
  }

  test("a paused running session can resume, not pause", () => {
    expect(names(lifecycleControls({ status: "running", mode: "quiz", paused: true }))).toEqual(["resume", "end", "live"]);
  });

  test("release needs manual release and a session past scheduled", () => {
    for (const status of ["lobby", "running", "ended"] as const)
      expect(lifecycleControls({ status, mode: "quiz", resultsRelease: "manual" }).release).toBe(true);
    expect(lifecycleControls({ status: "scheduled", mode: "quiz", resultsRelease: "manual" }).release).toBe(false);
    for (const resultsRelease of ["immediately", "after_close"] as const)
      expect(lifecycleControls({ status: "ended", mode: "quiz", resultsRelease }).release).toBe(false);
  });
});
