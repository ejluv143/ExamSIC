import { expect, test } from "bun:test";
import { createTimeSpent } from "./time-spent.ts";

test("adds up the stretches a question is shown and counts the running one", () => {
  let t = 1000;
  const spent = createTimeSpent(() => t);
  spent.show("a");
  t += 400;
  expect(spent.snapshot("a")).toBe(400);
  spent.hide("a");
  t += 5000;
  expect(spent.snapshot("a")).toBe(400);
  spent.show("a");
  t += 100;
  expect(spent.snapshot("a")).toBe(500);
  expect(spent.snapshot("b")).toBe(0);
});

test("show while counting and hide while hidden change nothing", () => {
  let t = 0;
  const spent = createTimeSpent(() => t);
  spent.hide("a");
  spent.show("a");
  t += 100;
  spent.show("a");
  t += 100;
  spent.hide("a");
  spent.hide("a");
  expect(spent.snapshot("a")).toBe(200);
});
