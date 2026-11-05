import { describe, expect, test } from "bun:test";
import { frozenSettings, isFrozen, keepFrozen, sameSetting, type FrozenSetting } from "./freeze.ts";

// Setting x status: true where the setting is locked.
const table: Record<FrozenSetting, [scheduled: boolean, lobby: boolean, running: boolean, ended: boolean]> = {
  mode: [false, true, true, true],
  pacing: [false, true, true, true],
  opensAt: [false, true, true, true],
  classId: [false, true, true, true],
  oneQuestionAtATime: [false, false, true, true],
  questionTimeLimitSeconds: [false, false, true, true],
  navigation: [false, false, true, true],
  maxMarked: [false, false, true, true],
  integrity: [false, false, true, true],
  exam: [false, false, true, true],
  mastery: [false, false, true, true],
  relay: [false, false, true, true],
  relayPassword: [false, false, true, true],
  relayClues: [false, false, true, true],
};

describe("isFrozen", () => {
  for (const [setting, expected] of Object.entries(table) as [FrozenSetting, boolean[]][])
    test(setting, () => {
      expect(["scheduled", "lobby", "running", "ended"].map((s) => isFrozen(setting, s as never))).toEqual(expected);
    });
});

describe("frozenSettings", () => {
  test("nothing is locked before the session opens", () => {
    expect(frozenSettings("scheduled")).toEqual([]);
  });

  test("the lobby locks what defines the session, the relay still changes", () => {
    expect(frozenSettings("lobby")).toEqual(["mode", "pacing", "opensAt", "classId"]);
  });

  test("a started session also locks the rules students started under, and refuses relay edits", () => {
    expect(frozenSettings("running", "refuse")).toEqual(["relay", "relayPassword", "relayClues"]);
    expect(frozenSettings("running", "keep")).toContain("integrity");
  });
});

describe("keepFrozen", () => {
  const edited = { mode: "game", navigation: "free", timeLimitMinutes: 60 };
  const current = { mode: "quiz", navigation: "forward" };

  test("a scheduled session takes every edit", () => {
    expect(keepFrozen(edited, current, "scheduled")).toEqual(edited);
  });

  test("the lobby keeps the type but not the paper rules", () => {
    expect(keepFrozen(edited, current, "lobby")).toEqual({ mode: "quiz", navigation: "free", timeLimitMinutes: 60 });
  });

  test("a running session keeps both, and settings that aren't locked stay as edited", () => {
    expect(keepFrozen(edited, current, "running")).toEqual({ mode: "quiz", navigation: "forward", timeLimitMinutes: 60 });
  });
});

describe("sameSetting", () => {
  test("ignores the order of keys, not of list items", () => {
    expect(sameSetting({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
    expect(sameSetting(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameSetting(null, null)).toBe(true);
    expect(sameSetting(null, {})).toBe(false);
  });
});
