import { expect, test } from "bun:test";
import type { IntegrityEvent } from "@examinus/domain/quiz";
import { IntegrityLog, settleMs, type IntegrityNotice } from "./integrity.ts";

function setup(initial: IntegrityEvent[] = []) {
  const clock = { t: Date.parse("2026-01-01T00:00:00Z") };
  const notices: IntegrityNotice[] = [];
  const log = new IntegrityLog(initial, { onChange: () => {}, onNotice: (n) => notices.push(n), now: () => clock.t });
  return { clock, notices, log };
}

// Takes a started log through the settle that closes the opening incident.
function started() {
  const s = setup();
  s.log.begin();
  s.log.settle(true);
  s.clock.t += settleMs;
  s.log.settle(true);
  return s;
}

test("the switch at start belongs to no incident", () => {
  const { log, notices } = setup();
  log.begin();
  log.away("left_page", "x");
  expect(log.log).toEqual([]);
  expect(notices).toEqual([]);
});

test("leaving counts once per incident and the duration is filled in after settling", () => {
  const { log, clock, notices } = started();
  log.away("left_page", "gone");
  log.away("alt_tab", "again");
  expect(log.log.map((e) => e.type)).toEqual(["left_page"]);
  expect(notices).toEqual([{ kind: "away", message: "gone" }]);
  // Held back while the student is away.
  expect(log.pending(0)).toEqual({ events: [], end: 0 });
  clock.t += 4000;
  log.settle(true);
  clock.t += 200;
  log.settle(false); // a blip resets the settle
  clock.t += 100;
  log.settle(true);
  clock.t += settleMs;
  log.settle(true);
  const event = log.log[0];
  expect(event?.durationMs).toBe(4000 + 200 + 100);
  expect(log.pending(0).events).toHaveLength(1);
  log.away("switched_app", "next");
  expect(log.log).toHaveLength(2);
});

test("leaving full screen after re-entering is a new incident; without re-entering it is the same one", () => {
  const { log, clock } = started();
  log.away("exit_fullscreen", "out", { fullscreenExit: true });
  expect(log.log).toHaveLength(1);
  clock.t += 1000;
  log.away("exit_fullscreen", "out", { fullscreenExit: true });
  expect(log.log).toHaveLength(1);
  log.reenteredFullscreen();
  clock.t += 500;
  log.away("exit_fullscreen", "out again", { fullscreenExit: true });
  expect(log.log).toHaveLength(2);
  expect(log.log[0]?.durationMs).toBe(1500);
});

test("record logs events and shows a blocked notice only with one", () => {
  const { log, notices } = started();
  log.record("mouse_left");
  log.record("copy", { notice: "Copying is turned off." });
  expect(log.log.map((e) => e.type)).toEqual(["mouse_left", "copy"]);
  expect(notices).toEqual([{ kind: "blocked", message: "Copying is turned off." }]);
});

test("pending stops before the open away event, finish closes it", () => {
  const { log, clock } = started();
  log.record("copy");
  log.away("left_page", "x");
  log.record("copy");
  expect(log.pending(0)).toEqual({ events: [log.log[0]!], end: 1 });
  clock.t += 2500;
  const all = log.finish();
  expect(all[1]?.durationMs).toBe(2500);
  expect(log.pending(1).events).toHaveLength(2);
});

test("limit fires once, after more away incidents than allowed, with the log closed", () => {
  const { log, clock } = started();
  expect(log.limit(null)).toBeNull();
  log.away("left_page", "x");
  expect(log.limit(1)).toBeNull();
  clock.t += 100;
  log.settle(true);
  clock.t += settleMs;
  log.settle(true);
  log.away("alt_tab", "y");
  clock.t += 700;
  const all = log.limit(1);
  expect(all?.map((e) => e.type)).toEqual(["left_page", "alt_tab", "auto_submitted"]);
  expect(all?.[1]?.durationMs).toBe(700);
  expect(log.limit(1)).toBeNull();
});

test("withoutTracking suppresses leaving until shortly after", async () => {
  const { log, clock } = started();
  const result = log.withoutTracking(() => {
    log.away("switched_app", "dialog");
    return 7;
  });
  expect(result).toBe(7);
  expect(log.log).toEqual([]);
  await new Promise((r) => setTimeout(r, 350));
  clock.t += 10;
  log.away("switched_app", "real");
  expect(log.log).toHaveLength(1);
});
