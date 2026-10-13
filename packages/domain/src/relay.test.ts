import { describe, expect, test } from "bun:test";
import type { RelaySettings } from "./quiz.ts";
import { defaultRelay } from "./quiz.ts";
import {
  balanceTeams,
  generatePassword,
  nextTeamName,
  normalizePassword,
  partitionQuestions,
  randomizeTeams,
  relayPasswordMaxLength,
  relayPasswordProblem,
  relaySettingsProblem,
  relayTeamPoints,
  relayWrongGuessPenalty,
  rescuePoints,
  retryPoints,
  shareOut,
  slotOrder,
  slotState,
  splitPassword,
  teamsStartProblem,
} from "./relay.ts";

const range = (n: number, prefix = "p") => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const sizes = (teams: Record<string, string[]>) => Object.values(teams).map((m) => m.length);
const spread = (n: number[]) => Math.max(...n) - Math.min(...n);

describe("nextTeamName", () => {
  test("colours first, then numbered teams", () => {
    expect(nextTeamName([])).toBe("Red");
    expect(nextTeamName(["Red", "Green"])).toBe("Blue");
    expect(nextTeamName(["Red", "Blue", "Green", "Yellow", "Purple", "Orange", "Pink", "Teal", "Gold", "Silver", "Navy", "Lime"])).toBe("Team 13");
    expect(
      nextTeamName(["Red", "Blue", "Green", "Yellow", "Purple", "Orange", "Pink", "Teal", "Gold", "Silver", "Navy", "Lime", "Team 13"]),
    ).toBe("Team 14");
  });
});

describe("randomizeTeams", () => {
  const ids = ["a", "b", "c"];
  test("places every player exactly once with sizes within 1 and the maximum", () => {
    for (const n of [1, 2, 3, 7, 8, 12]) {
      const players = range(n);
      const out = randomizeTeams(players, ids, 4, 42)!;
      expect(out).not.toBeNull();
      expect(Object.keys(out).sort()).toEqual(ids);
      expect(Object.values(out).flat().sort()).toEqual([...players].sort());
      expect(spread(sizes(out))).toBeLessThanOrEqual(1);
      expect(Math.max(...sizes(out))).toBeLessThanOrEqual(4);
    }
  });
  test("same seed gives the same result; other seeds can differ", () => {
    const players = range(9);
    expect(randomizeTeams(players, ids, 4, 7)).toEqual(randomizeTeams(players, ids, 4, 7));
    const results = new Set(Array.from({ length: 20 }, (_, s) => JSON.stringify(randomizeTeams(players, ids, 4, s))));
    expect(results.size).toBeGreaterThan(1);
  });
  test("null when there are more players than places or no teams", () => {
    expect(randomizeTeams(range(13), ids, 4, 1)).toBeNull();
    expect(randomizeTeams(range(12), ids, 4, 1)).not.toBeNull();
    expect(randomizeTeams(range(2), [], 4, 1)).toBeNull();
  });
  test("does not modify its input", () => {
    const players = range(5);
    randomizeTeams(players, ids, 4, 3);
    expect(players).toEqual(range(5));
  });
});

describe("balanceTeams", () => {
  type Balanced = { teams: Record<string, string[]>; unassigned: string[] };
  const all = (r: Balanced) => [...Object.values(r.teams).flat(), ...r.unassigned].sort();
  test("already balanced stays unchanged with no moves", () => {
    const teams = { a: ["1", "2"], b: ["3", "4"], c: ["5", "6", "7"] };
    const r = balanceTeams(teams, [], 4);
    expect(r.teams).toEqual(teams);
    expect(r.unassigned).toEqual([]);
    expect(r.moved).toBe(0);
  });
  test("evens out sizes with the fewest moves, big teams give up their most recent members", () => {
    const r = balanceTeams({ a: ["1", "2", "3", "4"], b: ["5"], c: [] }, [], 4);
    expect(spread(sizes(r.teams))).toBeLessThanOrEqual(1);
    expect(r.moved).toBe(2);
    expect(r.teams.a).toEqual(["1", "2"]);
    expect(all(r)).toEqual(["1", "2", "3", "4", "5"]);
  });
  test("the biggest teams keep the extra places", () => {
    // 4 players over 3 teams: sizes 2,1,1; the biggest team keeps the extra place and gives up one.
    const r = balanceTeams({ a: ["1", "2", "3"], b: ["4"], c: [] }, [], 4);
    expect(r.teams.a).toEqual(["1", "2"]);
    expect(r.teams.b).toEqual(["4"]);
    expect(r.teams.c).toEqual(["3"]);
    expect(r.moved).toBe(1);
  });
  test("unassigned players fill the smallest teams first", () => {
    const r = balanceTeams({ a: ["1", "2", "3"], b: ["4"], c: ["5", "6"] }, ["7", "8"], 4);
    expect(r.moved).toBe(0);
    expect(r.teams.b).toEqual(["4", "7"]);
    expect(r.teams.c).toEqual(["5", "6", "8"]);
    expect(r.teams.a).toEqual(["1", "2", "3"]);
    expect(r.unassigned).toEqual([]);
  });
  test("only unassigned players: dealt out evenly", () => {
    const r = balanceTeams({ a: [], b: [], c: [] }, range(7), 4);
    expect(sizes(r.teams).sort()).toEqual([2, 2, 3]);
    expect(r.moved).toBe(0);
    expect(all(r)).toEqual(range(7).sort());
  });
  test("capped by the maximum, leftovers stay unassigned", () => {
    const r = balanceTeams({ a: ["1"], b: [] }, range(7, "u"), 3);
    expect(sizes(r.teams)).toEqual([3, 3]);
    expect(r.unassigned).toHaveLength(2);
    expect(all(r)).toHaveLength(8);
    expect(new Set(all(r)).size).toBe(8);
  });
  test("an over-full team is cut down to the maximum", () => {
    const r = balanceTeams({ a: ["1", "2", "3", "4", "5"], b: [] }, [], 3);
    expect(r.teams.a).toHaveLength(3);
    expect(r.teams.b).toHaveLength(2);
    expect(r.unassigned).toEqual([]);
  });
  test("no teams", () => {
    expect(balanceTeams({}, ["x"], 4)).toEqual({ teams: {}, unassigned: ["x"], moved: 0 });
  });
  test("never loses or duplicates anyone and does not mutate input", () => {
    const teams = { a: ["1", "2", "3", "4"], b: ["5", "6"], c: [] as string[], d: ["7"] };
    const copy = structuredClone(teams);
    const r = balanceTeams(teams, ["8", "9"], 4);
    expect(teams).toEqual(copy);
    expect(all(r)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(spread(sizes(r.teams))).toBeLessThanOrEqual(1);
  });
});

describe("teamsStartProblem", () => {
  test("a one-member team can start", () => {
    expect(teamsStartProblem([{ name: "Red", members: ["a", "b"] }, { name: "Blue", members: ["c"] }], 4)).toBeNull();
    expect(teamsStartProblem([{ name: "Solo", members: ["a"] }], 1)).toBeNull();
  });
  test("names an over-full team", () => {
    const p = teamsStartProblem([{ name: "Red", members: ["a", "b"] }, { name: "Green", members: range(5) }], 4);
    expect(p).toContain("Green");
    expect(p).toContain("4");
  });
  test("ignores empty teams", () => {
    expect(teamsStartProblem([{ name: "Red", members: ["a", "b"] }, { name: "Blue", members: [] }], 4)).toBeNull();
  });
  test("a problem when every team is empty or there are none", () => {
    expect(teamsStartProblem([{ name: "Red", members: [] }], 4)).not.toBeNull();
    expect(teamsStartProblem([], 4)).not.toBeNull();
  });
});

describe("partitionQuestions", () => {
  const qs = range(10, "q");
  test("no overlap, none dropped, shares within 1, for team sizes 2 to 4", () => {
    for (const n of [2, 3, 4]) {
      const members = range(n, "m");
      const out = partitionQuestions(qs, members, 5)!;
      expect(Object.keys(out)).toEqual(members);
      expect(Object.values(out).flat().sort()).toEqual([...qs].sort());
      expect(spread(sizes(out))).toBeLessThanOrEqual(1);
    }
  });
  test("deterministic per seed", () => {
    expect(partitionQuestions(qs, ["a", "b", "c"], 9)).toEqual(partitionQuestions(qs, ["a", "b", "c"], 9));
  });
  test("exactly as many questions as members: one each", () => {
    const out = partitionQuestions(["x", "y"], ["a", "b"], 1)!;
    expect(sizes(out)).toEqual([1, 1]);
  });
  test("null when members outnumber questions or there are none", () => {
    expect(partitionQuestions(["x", "y"], ["a", "b", "c"], 1)).toBeNull();
    expect(partitionQuestions(qs, [], 1)).toBeNull();
  });
});

describe("shareOut", () => {
  test("goes to the least loaded member", () => {
    expect(shareOut(["q1", "q2"], { a: 5, b: 1, c: 3 })).toEqual({ a: [], b: ["q1", "q2"], c: [] });
  });
  test("keeps balancing as loads grow", () => {
    expect(shareOut(["q1", "q2", "q3"], { a: 2, b: 0 })).toEqual({ a: ["q3"], b: ["q1", "q2"] });
  });
  test("ties go to the member listed first", () => {
    expect(shareOut(["q1", "q2", "q3"], { a: 0, b: 0, c: 0 })).toEqual({ a: ["q1"], b: ["q2"], c: ["q3"] });
  });
  test("nobody to share with", () => {
    expect(shareOut(["q1"], {})).toEqual({});
  });
});

describe("splitPassword", () => {
  const join = (kind: "letter" | "word" | "coordinate" | "clue", pieces: string[]) => pieces.join(kind === "word" ? " " : kind === "clue" ? " / " : "");
  test("letters: pieces rejoin to the password for more, fewer and equal slots", () => {
    for (const slots of [1, 3, 6, 10, 20]) {
      const pieces = splitPassword("Planet", [], "letter", slots);
      expect(pieces.join("")).toBe("PLANET");
      expect(pieces).toHaveLength(Math.min(6, slots));
      expect(Math.max(...pieces.map((p) => p.length)) - Math.min(...pieces.map((p) => p.length))).toBeLessThanOrEqual(1);
    }
  });
  test("letters ignore spaces and punctuation, keep accents", () => {
    expect(splitPassword("ab-c d", [], "letter", 10)).toEqual(["A", "B", "C", "D"]);
    expect(splitPassword("niño", [], "letter", 10)).toEqual(["N", "I", "Ñ", "O"]);
  });
  test("coordinates split like letters", () => {
    expect(splitPassword("abcd", [], "coordinate", 2)).toEqual(["AB", "CD"]);
  });
  test("words", () => {
    expect(splitPassword("red  green blue", [], "word", 5)).toEqual(["red", "green", "blue"]);
    expect(splitPassword("a b c d e", [], "word", 2)).toEqual(["a b c", "d e"]);
    for (const slots of [1, 2, 3, 4]) expect(join("word", splitPassword("a b c", [], "word", slots))).toBe("a b c");
  });
  test("clues", () => {
    expect(splitPassword("x", ["one", " ", "two", "three"], "clue", 2)).toEqual(["one / two", "three"]);
    expect(splitPassword("x", ["one", "two"], "clue", 5)).toEqual(["one", "two"]);
  });
  test("no pieces without slots or units", () => {
    expect(splitPassword("abc", [], "letter", 0)).toEqual([]);
    expect(splitPassword("abc", [], "letter", -3)).toEqual([]);
    expect(splitPassword("!!!", [], "letter", 3)).toEqual([]);
    expect(splitPassword("x", [], "clue", 3)).toEqual([]);
  });
});

describe("normalizePassword", () => {
  test("ignores case, spaces and punctuation", () => {
    expect(normalizePassword("  Hello, World! ")).toBe("helloworld");
    expect(normalizePassword("HELLO-world")).toBe(normalizePassword("hello world"));
    expect(normalizePassword("a1 b2")).toBe("a1b2");
  });
  test("keeps Ñ distinct from N", () => {
    expect(normalizePassword("Ñ")).toBe("ñ");
    expect(normalizePassword("Ñ")).not.toBe(normalizePassword("N"));
    expect(normalizePassword("niño")).not.toBe(normalizePassword("nino"));
  });
  test("composed and decomposed accents match", () => {
    expect(normalizePassword("n\u0303")).toBe(normalizePassword("\u00f1"));
  });
});

describe("relayPasswordProblem", () => {
  test("fine cases", () => {
    expect(relayPasswordProblem(null, [], "letter")).toBeNull();
    expect(relayPasswordProblem("planet", [], "word")).toBeNull();
    expect(relayPasswordProblem("planet", ["a clue"], "clue")).toBeNull();
  });
  test("too long or empty password", () => {
    expect(relayPasswordProblem("a".repeat(relayPasswordMaxLength + 1), [], "letter")).not.toBeNull();
    expect(relayPasswordProblem("a".repeat(relayPasswordMaxLength), [], "letter")).toBeNull();
    expect(relayPasswordProblem("  !! ", [], "letter")).not.toBeNull();
  });
  test("clue pieces need a password and clues within limits", () => {
    expect(relayPasswordProblem(null, ["x"], "clue")).not.toBeNull();
    expect(relayPasswordProblem("pw", [], "clue")).not.toBeNull();
    expect(relayPasswordProblem("pw", ["  ", ""], "clue")).not.toBeNull();
    expect(relayPasswordProblem("pw", Array(101).fill("c"), "clue")).not.toBeNull();
    expect(relayPasswordProblem("pw", Array(100).fill("c"), "clue")).toBeNull();
    expect(relayPasswordProblem("pw", ["c".repeat(201)], "clue")).not.toBeNull();
    expect(relayPasswordProblem("pw", ["c".repeat(200)], "clue")).toBeNull();
  });
});

describe("generatePassword", () => {
  test("deterministic per seed", () => {
    for (const kind of ["letter", "word", "coordinate"] as const) expect(generatePassword(11, kind, 6)).toBe(generatePassword(11, kind, 6));
  });
  test("word kind has at most three words and at least one", () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const slots of [0, 1, 2, 3, 10]) {
        const n = generatePassword(seed, "word", slots).split(" ").length;
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(3);
        expect(n).toBe(Math.max(1, Math.min(slots, 3)));
      }
    }
  });
  test("letter kind is a valid password of about the slot count", () => {
    for (let seed = 0; seed < 20; seed++) {
      const w = generatePassword(seed, "letter", 6);
      expect(w).toMatch(/^[a-z]+$/);
      expect(w).toHaveLength(6);
      expect(relayPasswordProblem(w, [], "letter")).toBeNull();
    }
    expect(generatePassword(1, "letter", 1).length).toBeGreaterThanOrEqual(4);
    expect(generatePassword(1, "letter", 50).length).toBeLessThanOrEqual(9);
  });
});

describe("slotOrder", () => {
  test("a permutation, stable per team, differs between teams", () => {
    const items = range(10);
    const a = slotOrder(items, "team-a");
    expect([...a].sort()).toEqual([...items].sort());
    expect(slotOrder(items, "team-a")).toEqual(a);
    expect(slotOrder(items, "team-b")).not.toEqual(a);
    expect(items).toEqual(range(10));
  });
});

describe("slotState", () => {
  const retryOff = { retry: false, retryLimit: 2, rescue: false };
  const base = { owner: null, ownerOn: true, ownerless: false, rescue: null, settings: retryOff } as const;
  test("unlocked by a correct owner answer or a correct rescue", () => {
    expect(slotState({ ...base, owner: { correct: true, retries: 0 } })).toBe("unlocked");
    expect(slotState({ ...base, owner: { correct: false, retries: 0 }, rescue: { correct: true } })).toBe("unlocked");
  });
  test("open until the owner answers", () => {
    expect(slotState(base)).toBe("open");
    expect(slotState({ ...base, settings: { ...retryOff, retry: true, rescue: true } })).toBe("open");
  });
  test("retry off: one wrong answer locks, or can be rescued", () => {
    expect(slotState({ ...base, owner: { correct: false, retries: 0 } })).toBe("locked");
    expect(slotState({ ...base, owner: { correct: false, retries: 0 }, settings: { ...retryOff, rescue: true } })).toBe("rescue");
  });
  test("a timeout (correct null) counts as wrong", () => {
    expect(slotState({ ...base, owner: { correct: null, retries: 0 } })).toBe("locked");
  });
  test("retry on: open for retry until the limit", () => {
    const settings = { retry: true, retryLimit: 2, rescue: false };
    expect(slotState({ ...base, settings, owner: { correct: false, retries: 0 } })).toBe("retry");
    expect(slotState({ ...base, settings, owner: { correct: false, retries: 1 } })).toBe("retry");
    expect(slotState({ ...base, settings, owner: { correct: false, retries: 2 } })).toBe("locked");
    expect(slotState({ ...base, settings: { ...settings, rescue: true }, owner: { correct: false, retries: 2 } })).toBe("rescue");
  });
  test("leaving the question ends the retry", () => {
    const settings = { retry: true, retryLimit: 3, rescue: true };
    expect(slotState({ ...base, settings, ownerOn: false, owner: { correct: false, retries: 0 } })).toBe("rescue");
    expect(slotState({ ...base, settings: { ...settings, rescue: false }, ownerOn: false, owner: { correct: false, retries: 0 } })).toBe("locked");
  });
  test("ownerless: rescuable only when rescue is on", () => {
    expect(slotState({ ...base, ownerless: true })).toBe("locked");
    expect(slotState({ ...base, ownerless: true, settings: { ...retryOff, rescue: true } })).toBe("rescue");
  });
  test("rescuing while claimed; a failed rescue locks it for good", () => {
    const settings = { ...retryOff, rescue: true };
    expect(slotState({ ...base, settings, owner: { correct: false, retries: 0 }, rescue: { correct: null } })).toBe("rescuing");
    expect(slotState({ ...base, settings, ownerless: true, owner: null, rescue: { correct: null } })).toBe("rescuing");
    expect(slotState({ ...base, settings, owner: { correct: false, retries: 0 }, rescue: { correct: false } })).toBe("locked");
  });
});

describe("points", () => {
  test("retryPoints loses the penalty per retry and never goes below 0", () => {
    expect(retryPoints(1000, 0, 25)).toBe(1000);
    expect(retryPoints(1000, 1, 25)).toBe(750);
    expect(retryPoints(1000, 2, 25)).toBe(500);
    expect(retryPoints(1000, 5, 25)).toBe(0);
    expect(retryPoints(1000, 3, 0)).toBe(1000);
    expect(retryPoints(0, 2, 25)).toBe(0);
  });
  test("rescuePoints is a percentage", () => {
    expect(rescuePoints(1000, 50)).toBe(500);
    expect(rescuePoints(1000, 0)).toBe(0);
    expect(rescuePoints(1000, 100)).toBe(1000);
    expect(rescuePoints(333, 50)).toBe(167);
  });
  const team = { memberPoints: 1000, roundMs: 600_000, solveBonus: 500, wrongGuesses: 0 };
  test("not solved: no bonus", () => {
    expect(relayTeamPoints({ ...team, solvedAfterMs: null })).toBe(1000);
  });
  test("bonus shrinks with time, half at the end of the round", () => {
    expect(relayTeamPoints({ ...team, solvedAfterMs: 0 })).toBe(1500);
    expect(relayTeamPoints({ ...team, solvedAfterMs: 300_000 })).toBe(1375);
    expect(relayTeamPoints({ ...team, solvedAfterMs: 600_000 })).toBe(1250);
    const at = (ms: number) => relayTeamPoints({ ...team, solvedAfterMs: ms });
    expect(at(100_000)).toBeGreaterThan(at(200_000));
  });
  test("solve time is clamped to the round", () => {
    expect(relayTeamPoints({ ...team, solvedAfterMs: 900_000 })).toBe(1250);
    expect(relayTeamPoints({ ...team, solvedAfterMs: -5 })).toBe(1500);
  });
  test("each wrong guess costs the penalty and the total never goes below 0", () => {
    expect(relayTeamPoints({ ...team, solvedAfterMs: null, wrongGuesses: 2 })).toBe(1000 - 2 * relayWrongGuessPenalty);
    expect(relayTeamPoints({ ...team, memberPoints: 50, solvedAfterMs: null, wrongGuesses: 3 })).toBe(0);
  });
});

describe("relaySettingsProblem", () => {
  const ok = (patch: Partial<RelaySettings> = {}): RelaySettings => ({ ...defaultRelay, ...patch });
  test("classic games and the defaults are fine", () => {
    expect(relaySettingsProblem("teacher", null)).toBeNull();
    expect(relaySettingsProblem("student", null)).toBeNull();
    expect(relaySettingsProblem("student", ok())).toBeNull();
  });
  test("teacher pacing is refused", () => {
    expect(relaySettingsProblem("teacher", ok())).not.toBeNull();
  });
  const ranges: [keyof RelaySettings, number, number][] = [
    ["teamSize", 1, 4],
    ["teamCount", 1, 50],
    ["passwordAttempts", 1, 20],
    ["solveBonus", 0, 10000],
    ["roundMinutes", 1, 120],
    ["retryLimit", 1, 3],
    ["retryPenalty", 0, 100],
    ["rescuePoints", 0, 100],
  ];
  for (const [key, min, max] of ranges) {
    test(`${key}: ${min} to ${max}, whole numbers only`, () => {
      expect(relaySettingsProblem("student", ok({ [key]: min }))).toBeNull();
      expect(relaySettingsProblem("student", ok({ [key]: max }))).toBeNull();
      expect(relaySettingsProblem("student", ok({ [key]: min - 1 }))).not.toBeNull();
      expect(relaySettingsProblem("student", ok({ [key]: max + 1 }))).not.toBeNull();
      expect(relaySettingsProblem("student", ok({ [key]: min + 0.5 }))).not.toBeNull();
      expect(relaySettingsProblem("student", ok({ [key]: Number.NaN }))).not.toBeNull();
    });
  }
});
