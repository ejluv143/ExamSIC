// Exam mode (the serious mode): the anti-cheat settings the API refuses to let a teacher turn off, the strict
// defaults, the honor pledge and rules students accept, phone detection and the paper version printed on results.
import type { IntegritySettings } from "./quiz.ts";

// Settings an exam session can't do without. A teacher may only add stricter ones. One device per attempt and the
// heartbeat are always on for every session, so they have no switch.
export const examLockedSettings = [
  ["requireFullscreen", "Require full screen"],
  ["trackFocus", "Log switching tabs or apps"],
  ["blockSecondScreen", "Allow one screen only"],
  ["blockRightClick", "Block right-click"],
  ["blockCopy", "Block copy and cut"],
  ["blockPaste", "Block paste and dragging text in"],
  ["blockPrint", "Block printing and saving"],
  ["clearClipboardOnStart", "Clear the clipboard when the student starts"],
  ["watermark", "Watermark with the student's name"],
] as const satisfies readonly (readonly [keyof IntegritySettings, string])[];

// The labels of the locked settings that are off; empty when the exam is allowed.
export function lockedSettingsOff(integrity: IntegritySettings): string[] {
  return examLockedSettings.filter(([key]) => !integrity[key]).map(([, label]) => label);
}

// What a new exam session starts with. Everything except `allowPasteInCode` can be changed.
export const examDefaults = {
  autoSubmitAfter: 3,
  computersOnly: true,
  lateJoinMinutes: 15,
  attemptsAllowed: 1,
  resultsRelease: "manual",
  allowPasteInCode: false,
  // How long after its last check-in an attempt may resume on the same device without the teacher's approval.
  deviceGraceMinutes: 5,
} as const;

export const defaultHonorPledge =
  "I will do this exam on my own. I will not copy, use notes, other people, websites or AI tools unless the exam says I may, and I will not share the questions or my answers with anyone. I understand that cheating can lead to a failing grade and disciplinary action.";

// Shown before an exam starts; the student ticks that they read them.
export const examRules = [
  "Use a computer with one screen. Phones and tablets can't take this exam.",
  "Stay in full screen until you submit. Leaving full screen or the page is recorded and reported to your teacher.",
  "Don't open other tabs or apps, and don't use a second device.",
  "You can't copy, paste, print or right-click during the exam.",
  "The timer keeps running if you lose your connection. If you reload on the same computer you continue where you stopped; on another computer your teacher must approve it first.",
  "You won't see scores or correct answers until your teacher releases the results.",
] as const;

// What the API says to a student whose attempt must wait for the teacher (another device, or away too long). The
// web app recognises it by this text.
export const deviceApprovalMessage =
  "Your teacher must approve this device before you can continue the exam. Keep this page open; it continues when they allow it.";

// What the API says when an exam is for computers only and the request came from a phone or tablet.
export const computersOnlyMessage = "This exam is for computers only. Phones and tablets can't take it.";

// Whether a browser is a phone or tablet. `mobileHint` is the `Sec-CH-UA-Mobile` client hint ("?1" on phones),
// `platform` the `Sec-CH-UA-Platform` hint; both are optional because only Chromium sends them. An iPad that
// pretends to be a Mac is caught by `touchPoints` (navigator.maxTouchPoints) in the browser's check.
export function isPhoneOrTablet(input: {
  userAgent?: string | undefined;
  mobileHint?: string | undefined;
  platform?: string | undefined;
  touchPoints?: number | undefined;
}): boolean {
  const ua = input.userAgent ?? "";
  if (input.mobileHint?.trim() === "?1") return true;
  const platform = (input.platform ?? "").replaceAll('"', "").toLowerCase();
  if (platform === "android" || platform === "ios") return true;
  if (/android|iphone|ipad|ipod|mobile|tablet|silk|kindle|windows phone|blackberry|opera mini/i.test(ua)) return true;
  return /macintosh/i.test(ua) && (input.touchPoints ?? 0) > 1;
}

// A short code for the version of a student's paper (its shuffle), derived from the attempt's seed, so the
// results and the printout can tell two students' papers apart: "A7K2-9QX".
export function paperVersion(seed: number): string {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    return h;
  };
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = () => letters[next() % letters.length]!;
  return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}`;
}
