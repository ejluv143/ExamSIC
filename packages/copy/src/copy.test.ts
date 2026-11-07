import { expect, test } from "bun:test";
import { refusalScreen } from "./errors.ts";
import { integrityEventLabel } from "./integrity.ts";
import { modeLabel } from "./modes.ts";
import { statusLabel } from "./status.ts";
import { formatDelta, formatDuration, type DurationStyle } from "./duration.ts";
import { endedText, partHeading, partLabel, partMenuLabel, partName, pointsLabel, questionStarts, roman } from "./paper.ts";
import { rankSentence } from "./game.ts";
import { formatDate, formatDateTime, formatStamp, formatTime, formatTimeSeconds, fromLocalInput, manilaNoon, formatDay, shiftLocal, toLocalInput } from "./time.ts";

test("refusal tags map to the take screens", () => {
  expect(refusalScreen("DeviceApprovalRequired")).toBe("waiting");
  expect(refusalScreen("ComputersOnly")).toBe("computers_only");
  for (const tag of ["DeviceAttestationRequired", "Forbidden", "OpenElsewhere", "ClientOutdated"]) expect(refusalScreen(tag)).toBe("blocked");
  expect(refusalScreen("AttemptOver")).toBeNull();
  expect(refusalScreen("toString")).toBeNull();
});

test("modes, statuses and integrity events have labels", () => {
  expect(modeLabel("exam")).toBe("Exam");
  expect(statusLabel.running).toBe("Open");
  expect(Object.values(integrityEventLabel).every((l) => l.length > 0)).toBe(true);
});

test("each duration style at 0 ms, 59 s, 60 s and 1 h", () => {
  const at = (style: DurationStyle) => [0, 59_000, 60_000, 3_600_000].map((ms) => formatDuration(ms, style));
  expect(at("words")).toEqual(["—", "59 s", "1 min", "1 h"]);
  expect(at("compact")).toEqual(["0s", "59s", "1m 00s", "1h 00m"]);
  expect(at("clock")).toEqual(["0:00", "0:59", "1:00", "60:00"]);
  expect(at("countdown")).toEqual(["0:00", "0:59", "1:00", "60:00"]);
  expect(at("elapsed")).toEqual(["0:00", "0:59", "1:00", "60:00"]);
  for (const style of ["words", "compact", "clock"] as const) expect(formatDuration(null, style)).toBe("—");
});

test("duration styles round the way they are used", () => {
  expect(formatDuration(65_000, "words")).toBe("1 min 5 s");
  expect(formatDuration(7_380_000, "words")).toBe("2 h 3 min");
  expect(formatDuration(68_000, "compact")).toBe("1m 08s");
  expect(formatDuration(61_001, "countdown")).toBe("1:02");
  expect(formatDuration(1, "countdown")).toBe("0:01");
  expect(formatDuration(59_999, "elapsed")).toBe("0:59");
  expect(formatDuration(247_400, "clock")).toBe("4:07");
  expect(formatDelta(12_000)).toBe("+12s");
  expect(formatDelta(-8_000)).toBe("-8s");
});

test("Manila formatting of a UTC instant that crosses midnight", () => {
  const iso = "2026-11-04T17:30:05Z"; // 1:30:05 AM on 5 Nov in Manila
  expect(formatDate(iso)).toBe("Nov 5, 2026");
  expect(formatDateTime(iso)).toBe("Nov 5, 1:30 AM");
  expect(formatTime(iso)).toBe("1:30 AM");
  expect(formatTimeSeconds(iso)).toBe("1:30:05 AM");
  expect(formatStamp(iso)).toBe("Nov 5, 2026, 1:30:05 AM");
  expect(formatDay(iso)).toBe("Thursday, Nov 5");
  expect(formatDate(null)).toBe("—");
});

test("a calendar date held as Manila noon keeps its day", () => {
  expect(formatDay(manilaNoon("2026-11-05"))).toBe("Thursday, Nov 5");
});

test("Manila wall time round-trips through the instant", () => {
  const iso = fromLocalInput("2026-11-06T09:30");
  expect(iso).toBe("2026-11-06T09:30:00+08:00");
  expect(toLocalInput(iso)).toBe("2026-11-06T09:30");
  expect(toLocalInput(new Date(iso!).toISOString())).toBe("2026-11-06T09:30");
  expect(fromLocalInput("")).toBeNull();
  expect(toLocalInput(null)).toBe("");
  expect(shiftLocal("2026-11-06T23:30", 45)).toBe("2026-11-07T00:15");
});

test("part headings", () => {
  expect([1, 4, 9, 14, 19, 20].map(roman)).toEqual(["I", "IV", "IX", "XIV", "XIX", "XX"]);
  expect(partHeading("Matching", 2)).toBe("Part II – Matching");
  expect(partHeading("  ", 3)).toBe("Part III");
  expect(partHeading("Part I – Basics", 2)).toBe("Part I – Basics");
  expect(partHeading("part 4", 1)).toBe("part 4");
  expect(pointsLabel(1)).toBe("1 pt");
  expect(pointsLabel(5)).toBe("5 pts");
});

test("every end reason says why the attempt was submitted", () => {
  expect(endedText.teacher).toBe("Your teacher submitted your attempt.");
  expect(endedText.session_ended).toBe("Your teacher ended the session, so your attempt was submitted.");
  expect(endedText.time_up).toBe("Time ran out, so your attempt was submitted.");
});

test("rank sentences", () => {
  const row = { rank: 2, points: 1200 };
  expect(rankSentence(row, "final")).toBe("You finished #2 with 1,200 points");
  expect(rankSentence(row, "now")).toBe("You're #2 with 1,200 points");
  expect(rankSentence(row, { team: "Owls" })).toBe("Team Owls finished #2 with 1,200 points");
});

test("part names: a label, a list name, a menu label", () => {
  expect(partLabel(4)).toBe("Part IV");
  expect(partName("  Matching ", 2)).toBe("Matching");
  expect(partName(" ", 2)).toBe("Part 2");
  expect(partMenuLabel("Matching", 2)).toBe("Part II · Matching");
  expect(partMenuLabel(" ", 3)).toBe("Part III");
});

test("question numbers run on across parts from the first number given", () => {
  expect(questionStarts([2, 0, 3])).toEqual([1, 3, 3]);
  expect(questionStarts([2, 3], 5)).toEqual([5, 7]);
  expect(questionStarts([])).toEqual([]);
});
