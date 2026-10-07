// Anti-cheating helpers shared by the exam screen, the server and the teacher's views.
import type { IntegrityEvent, IntegrityEventType, IntegritySettings } from "@examora/contract";

export const integrityEventLabel: Record<IntegrityEventType, string> = {
  left_page: "Switched tabs or minimized the browser",
  switched_app: "Switched to another app or window",
  alt_tab: "Switched apps (Alt+Tab)",
  mouse_left: "Moved the mouse off the exam",
  window_resize: "Made the window smaller (split screen or resized)",
  second_screen: "Connected a second screen",
  exit_fullscreen: "Exited full screen",
  copy: "Tried to copy",
  paste: "Tried to paste",
  drop: "Tried to drag text in",
  bulk_input: "Large text appeared at once (possible paste or auto-typer)",
  right_click: "Tried to right-click",
  print: "Tried to print or save",
  screenshot: "Pressed Print Screen",
  auto_submitted: "Submitted automatically (too many warnings)",
  late_submit: "Submitted after the time limit",
};

// Leaving counts toward auto-submit; mouse movement and blocked copy/paste attempts are only logged.
const awayTypes = new Set<IntegrityEventType>(["left_page", "switched_app", "alt_tab", "second_screen", "exit_fullscreen"]);
export const isAway = (e: IntegrityEvent) => awayTypes.has(e.type);
export const awayCount = (events: readonly IntegrityEvent[]) => events.filter(isAway).length;

export function defaultIntegrity(mode: "quiz" | "exam"): IntegritySettings {
  return {
    requireFullscreen: true,
    trackFocus: true,
    blockSecondScreen: mode === "exam",
    blockCopyPaste: mode === "exam",
    watermark: mode === "exam",
    autoSubmitAfter: null,
  };
}
