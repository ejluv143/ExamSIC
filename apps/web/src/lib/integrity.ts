// Anti-cheating helpers shared by the exam screen, the server and the teacher's views.
import type { IntegrityEvent, IntegrityEventType, Session } from "@examora/contract";

export const integrityEventLabel: Record<IntegrityEventType, string> = {
  left_page: "Switched tabs or minimized the browser (time away is recorded)",
  switched_app: "Switched to another app or window",
  alt_tab: "Switched apps (Alt+Tab)",
  mouse_left: "Moved the mouse off the exam",
  window_resize: "Made the window smaller (split screen or resized)",
  second_screen: "Connected a second screen",
  exit_fullscreen: "Exited full screen (time out of full screen is recorded)",
  copy: "Tried to copy",
  paste: "Tried to paste",
  drop: "Tried to drag text in",
  bulk_input: "Large text appeared at once (possible paste or auto-typer)",
  right_click: "Tried to right-click",
  print: "Tried to print or save",
  screenshot: "Pressed Print Screen",
  auto_submitted: "Submitted automatically (too many warnings)",
  late_submit: "Submitted after the time limit",
  disconnected: "Lost the connection to the server (time offline is recorded)",
  device_changed: "Continued the attempt on a different device or browser",
  network_changed: "Network address changed during the attempt",
  shared_device: "Another student used the same device",
  shared_network: "Another student used the same network address",
  too_fast: "Answered faster than a person normally can",
  devtools_open: "Opened the browser developer tools",
  split_screen: "Used split screen or a floating window",
};

// Leaving counts toward auto-submit; mouse movement and blocked copy/paste attempts are only logged.
const awayTypes = new Set<IntegrityEventType>(["left_page", "switched_app", "alt_tab", "second_screen", "exit_fullscreen"]);
export const isAway = (e: IntegrityEvent) => awayTypes.has(e.type);
export const awayCount = (events: readonly IntegrityEvent[]) => events.filter(isAway).length;

// "1 min 5 s", "45 s", "2 h 3 min"; "—" for nothing.
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  if (total <= 0) return "—";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return sec > 0 ? `${m} min ${sec} s` : `${m} min`;
  return `${sec} s`;
}

// Short names of the anti-cheating and prevention settings that are on, for a session's summary.
export function sessionRuleChips(session: Session): string[] {
  const r = session.integrity;
  const rows: [boolean, string][] = [
    [r.requireFullscreen, "Full screen"],
    [r.trackFocus, "Tab and app switches logged"],
    [r.blockSecondScreen, "One screen only"],
    [r.blockRightClick, "Right-click blocked"],
    [r.blockCopy, "Copy blocked"],
    [r.blockPaste, r.allowPasteInCode ? "Paste blocked (allowed in code)" : "Paste blocked"],
    [r.blockPrint, "Print blocked"],
    [r.clearClipboardOnStart, "Clipboard cleared"],
    [r.watermark, "Watermark"],
    [r.autoSubmitAfter !== null, `Auto-submit after ${r.autoSubmitAfter} ${r.autoSubmitAfter === 1 ? "chance" : "chances"}`],
    [session.oneQuestionAtATime, "One question at a time"],
    [session.navigation === "marked_only", "Back to marked questions only"],
    [session.navigation === "forward_only", "No going back"],
    [session.maxMarked === 0 && (session.mode === "quiz" || session.mode === "exam"), "No marking for review"],
    [session.questionTimeLimitSeconds !== null, `${session.questionTimeLimitSeconds} s per question`],
    [session.lateJoinMinutes !== null, `Late join up to ${session.lateJoinMinutes} min`],
    [session.roomPasswordRequired, "Room password"],
    [session.ipRestricted, "Network restricted"],
  ];
  return rows.filter(([on]) => on).map(([, text]) => text);
}
