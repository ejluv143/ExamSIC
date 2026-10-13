import { describe, expect, test } from "bun:test";
import { formatJoinKey, joinKeyAlphabet, joinKeyLength, newJoinKey, normalizeJoinKey } from "./join-key.ts";

describe("join keys", () => {
  test("the alphabet has no look-alikes and no repeats", () => {
    for (const ch of "0O1IL") expect(joinKeyAlphabet).not.toContain(ch);
    expect(new Set(joinKeyAlphabet).size).toBe(joinKeyAlphabet.length);
    expect(joinKeyAlphabet).toBe(joinKeyAlphabet.toUpperCase());
    expect(joinKeyLength).toBe(7);
  });

  test("a new key is seven characters from the alphabet", () => {
    for (let i = 0; i < 500; i++) {
      const key = newJoinKey();
      expect(key).toHaveLength(joinKeyLength);
      for (const ch of key) expect(joinKeyAlphabet).toContain(ch);
    }
  });

  test("new keys differ", () => {
    expect(new Set(Array.from({ length: 200 }, newJoinKey)).size).toBeGreaterThan(190);
  });

  test("normalizing ignores case, spaces and dashes", () => {
    expect(normalizeJoinKey("abcdefg")).toBe("ABCDEFG");
    expect(normalizeJoinKey("abc-defg")).toBe("ABCDEFG");
    expect(normalizeJoinKey(" a b c - d e f g ")).toBe("ABCDEFG");
    expect(normalizeJoinKey("ABC\tDEFG\n")).toBe("ABCDEFG");
  });

  test("a key of the wrong length or with look-alikes is refused", () => {
    expect(normalizeJoinKey("")).toBeNull();
    expect(normalizeJoinKey("ABCDEF")).toBeNull();
    expect(normalizeJoinKey("ABCDEFGH")).toBeNull();
    expect(normalizeJoinKey("ABCDEF0")).toBeNull();
    expect(normalizeJoinKey("ABCDEFO")).toBeNull();
    expect(normalizeJoinKey("ABCDEF1")).toBeNull();
    expect(normalizeJoinKey("ABCDEFI")).toBeNull();
    expect(normalizeJoinKey("ABCDEFL")).toBeNull();
    expect(normalizeJoinKey("ABCDEF!")).toBeNull();
  });

  test("formatting puts a dash after the third character", () => {
    expect(formatJoinKey("ABCDEFG")).toBe("ABC-DEFG");
  });

  test("a formatted key normalizes back to itself", () => {
    for (let i = 0; i < 100; i++) {
      const key = newJoinKey();
      expect(normalizeJoinKey(formatJoinKey(key))).toBe(key);
      expect(normalizeJoinKey(formatJoinKey(key).toLowerCase())).toBe(key);
    }
  });
});
