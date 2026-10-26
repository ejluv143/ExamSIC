import { expect, test } from "bun:test";
import { questionTypes } from "@examinus/domain/question";
import { refusalScreen } from "./errors.ts";
import { integrityEventLabel } from "./integrity.ts";
import { questionLabel, questionTypeLabel } from "./question-types.ts";
import { modeLabel } from "./modes.ts";
import { statusLabel } from "./status.ts";

test("refusal tags map to the take screens", () => {
  expect(refusalScreen("DeviceApprovalRequired")).toBe("waiting");
  expect(refusalScreen("ComputersOnly")).toBe("computers_only");
  for (const tag of ["DeviceAttestationRequired", "Forbidden", "OpenElsewhere", "ClientOutdated"]) expect(refusalScreen(tag)).toBe("blocked");
  expect(refusalScreen("AttemptOver")).toBeNull();
  expect(refusalScreen("toString")).toBeNull();
});

test("every question type, mode and status has a label", () => {
  for (const type of questionTypes) expect(questionLabel({ type })).toBe(questionTypeLabel[type]);
  expect(modeLabel("exam")).toBe("Exam");
  expect(statusLabel.running).toBe("Open");
  expect(Object.values(integrityEventLabel).every((l) => l.length > 0)).toBe(true);
});
