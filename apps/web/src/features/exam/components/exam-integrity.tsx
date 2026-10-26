"use client";

import { useMemo } from "react";
import type { IntegrityEvent, IntegritySettings } from "@examinus/domain/quiz";
import { useIntegrityLog } from "@examinus/taking/integrity";
import { webSensors } from "@/lib/platform/web-sensors";

// Empties the clipboard so notes copied before the exam can't be pasted. Needs a click to be allowed.
export function clearClipboard() {
  navigator.clipboard?.writeText("").catch(() => {});
}

// Watches the student while they take it: logs leaving the page or full screen (with how long), blocks and
// logs copy, paste, right-click and printing, each only when its setting is on, and watches for pasted text,
// developer tools and split screen. Calls onLimit once they've left more often than allowed. Only runs while `active`.
// The log and the counting live in @examinus/taking; the browser's listeners in lib/platform/web-sensors.
export function useIntegrity({
  active,
  settings,
  needsFullscreen,
  initial,
  onLimit,
}: {
  active: boolean;
  settings: IntegritySettings;
  // Full screen is required and this browser can do it; "back" then means back in full screen.
  needsFullscreen: boolean;
  initial: IntegrityEvent[];
  onLimit: (events: IntegrityEvent[]) => void;
}) {
  const { trackFocus, blockRightClick, blockCopy, blockPaste, blockPrint, allowPasteInCode, blockSecondScreen } = settings;
  const sensors = useMemo(
    () => webSensors(settings, { needsFullscreen }),
    // `settings` only contributes the fields listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [needsFullscreen, trackFocus, blockRightClick, blockCopy, blockPaste, blockPrint, allowPasteInCode, blockSecondScreen],
  );
  return useIntegrityLog({ active, settings, initial, onLimit, sensors });
}

// The student's name and number tiled faintly over the exam, so a photo or screenshot shows who took it.
export function Watermark({ text }: { text: string }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200"><text x="20" y="120" transform="rotate(-24 180 100)" font-family="sans-serif" font-size="15" fill="rgb(128,128,128)" fill-opacity="0.16">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</text></svg>`;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 select-none"
      style={{ backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")` }}
    />
  );
}
