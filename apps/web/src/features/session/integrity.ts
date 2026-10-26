// Anti-cheating helpers shared by the exam screen, the server and the teacher's views.
import type { Session } from "@examinus/domain/quiz";

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
    [session.mode === "exam" && session.exam?.allowMobile === true, "Mobile app allowed"],
    [r.allowedClients?.length === 1, `${r.allowedClients?.[0] === "desktop" ? "Desktop app" : r.allowedClients?.[0] === "mobile" ? "Mobile app" : "Web browser"} only`],
  ];
  return rows.filter(([on]) => on).map(([, text]) => text);
}
