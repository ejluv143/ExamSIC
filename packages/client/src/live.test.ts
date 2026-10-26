import { describe, expect, test } from "bun:test";
import { backoffMs, makeLiveClient, type Issued, type LiveStatus } from "./live.ts";

describe("backoffMs", () => {
  test("doubles from 1 s and caps at 15 s", () => {
    const steps = [1, 2, 3, 4, 5, 6, 7, 20].map((n) => backoffMs(n, 0.5));
    expect(steps).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000]);
  });

  test("jitters between 0.75x and 1.25x", () => {
    expect(backoffMs(1, 0)).toBe(750);
    expect(backoffMs(1, 1)).toBe(1250);
    expect(backoffMs(3, 0)).toBe(3000);
  });
});

describe("makeLiveClient", () => {
  test("a refused ticket closes with its message and never retries", async () => {
    let asked = 0;
    const statuses: [LiveStatus, string | undefined][] = [];
    const closed = Promise.withResolvers<void>();
    const { followLobby } = makeLiveClient({
      requestTicket: async () => {
        asked++;
        return { error: "No." };
      },
    });
    const stop = followLobby("s1", {
      onEvent: () => {},
      onStatus: (s, m) => {
        statuses.push([s, m]);
        if (s === "closed") closed.resolve();
      },
    });
    await closed.promise;
    stop();
    expect(statuses).toEqual([
      ["connecting", undefined],
      ["closed", "No."],
    ]);
    expect(asked).toBe(1);
  });

  test("a missing ticket reconnects, and wake ends the backoff early", async () => {
    let asked = 0;
    const statuses: LiveStatus[] = [];
    const sleeping = Promise.withResolvers<void>();
    const retried = Promise.withResolvers<void>();
    const cleaned = Promise.withResolvers<void>();
    let signal: (() => void) | undefined;
    const { followGame } = makeLiveClient({
      requestTicket: async (): Promise<Issued | null> => {
        asked++;
        if (asked === 2) retried.resolve();
        return null;
      },
      wake: (s) => {
        signal = s;
        sleeping.resolve();
        return () => cleaned.resolve();
      },
    });
    const stop = followGame("s1", { onEvent: () => {}, onStatus: (s) => statuses.push(s) });
    await sleeping.promise;
    expect(asked).toBe(1);
    signal!();
    await retried.promise;
    await cleaned.promise;
    stop();
    expect(statuses.slice(0, 2)).toEqual(["connecting", "reconnecting"]);
  });
});
