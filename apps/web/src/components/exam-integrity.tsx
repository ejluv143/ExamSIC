"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { awayCount } from "@/lib/integrity";
import type { IntegrityEvent, IntegrityEventType, IntegritySettings } from "@examora/contract";

export type IntegrityNotice = { kind: "away" | "blocked"; message: string } | null;

// Leaving counts once per incident: from when the student leaves until they're back (focused, and in
// full screen when that's required) and have stayed back this long. Going in and out of full screen
// briefly takes focus away on many systems; those blips belong to the same incident, not new ones.
const settleMs = 1500;
// More than this many characters appearing in one go isn't typing.
const bulkInputChars = 30;
// Docked developer tools make the window's outside bigger than its page by about this much.
const devtoolsGap = 200;

type ExtendedScreen = Screen & { isExtended?: boolean };

// Chrome and Edge report a second monitor; other browsers can't tell, so this is false there.
export function hasSecondScreen() {
  return typeof window !== "undefined" && (window.screen as ExtendedScreen).isExtended === true;
}

// Empties the clipboard so notes copied before the exam can't be pasted. Needs a click to be allowed.
export function clearClipboard() {
  navigator.clipboard?.writeText("").catch(() => {});
}

// Watches the student while they take it: logs leaving the page or full screen (with how long), blocks and
// logs copy, paste, right-click and printing, each only when its setting is on, and watches for pasted text,
// developer tools and split screen. Calls onLimit once they've left more often than allowed. Only runs while `active`.
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
  // Every event in time order. An away event's duration is filled in when the student is back, so the
  // list lives in a ref and `events` mirrors it for rendering.
  const log = useRef(initial);
  const [events, setEvents] = useState(initial);
  const [notice, setNotice] = useState<IntegrityNotice>(null);
  const [secondScreen, setSecondScreen] = useState(false);
  // An incident is open from leaving until the student has settled back; starts open so the switch
  // into full screen at Start doesn't count.
  const incident = useRef(true);
  // The away event waiting for its duration (index in `log`), and when the student left.
  const open = useRef<{ index: number; since: number } | null>(null);
  // Our own confirm() dialogs blur the window; they shouldn't count against the student.
  const suppressed = useRef(false);
  const limitReached = useRef(false);
  const latestOnLimit = useRef(onLimit);
  useEffect(() => {
    latestOnLimit.current = onLimit;
  });

  const {
    trackFocus,
    blockRightClick,
    blockCopy,
    blockPaste,
    blockPrint,
    allowPasteInCode,
    blockSecondScreen,
    autoSubmitAfter,
  } = settings;

  // Closes the open away event with the time the student was gone.
  const closeOpen = useCallback((until: number) => {
    const current = open.current;
    if (!current) return;
    open.current = null;
    const event = log.current[current.index];
    if (!event) return;
    log.current = log.current.map((e, i) =>
      i === current.index ? { ...e, durationMs: Math.max(0, Math.round(until - current.since)) } : e,
    );
    setEvents(log.current);
  }, []);

  useEffect(() => {
    if (!active) return;
    const record = (type: IntegrityEventType) => {
      log.current = [...log.current, { type, at: new Date().toISOString() }];
      setEvents(log.current);
    };

    // Back means on the page and, when full screen is required, in full screen. Focus isn't checked
    // then: browsers report it unreliably while switching into full screen.
    const isBack = () =>
      document.visibilityState === "visible" && (needsFullscreen ? !!document.fullscreenElement : document.hasFocus());
    // While an incident is open, check a few times a second; close it once the student has stayed back
    // for settleMs. (Waiting for an event to say they're back isn't reliable: the focus or full-screen
    // event can arrive before the browser reports the new state.)
    let backSince: number | null = null;
    const settle = setInterval(() => {
      if (!incident.current) return;
      if (!isBack()) backSince = null;
      else if (backSince === null) backSince = Date.now();
      else if (Date.now() - backSince >= settleMs) {
        incident.current = false;
        closeOpen(backSince);
      }
    }, 300);
    // Whether the student went (back) into full screen since the last warning.
    let reentered = false;
    const recordAway = (type: IntegrityEventType, message: string) => {
      backSince = null;
      if (incident.current || suppressed.current) return;
      incident.current = true;
      reentered = false;
      record(type);
      open.current = { index: log.current.length - 1, since: Date.now() };
      setNotice({ kind: "away", message });
    };
    incident.current = true;
    const blocked = (type: IntegrityEventType, message: string) => (e: Event) => {
      e.preventDefault();
      record(type);
      setNotice({ kind: "blocked", message });
    };

    const listeners: [EventTarget, string, EventListener][] = [];
    const on = (target: EventTarget, name: string, fn: EventListener) => {
      target.addEventListener(name, fn);
      listeners.push([target, name, fn]);
    };
    const timers: ReturnType<typeof setInterval>[] = [settle];

    if (trackFocus) {
      // Alt+Tab can't be blocked by a web page, but the Alt (or Windows/Cmd) key just before leaving gives it away.
      let modifierAt = 0;
      on(document, "keydown", (e) => {
        if (["Alt", "Meta", "OS"].includes((e as KeyboardEvent).key)) modifierAt = Date.now();
      });
      on(document, "visibilitychange", () => {
        if (document.visibilityState === "hidden") recordAway("left_page", "You switched tabs or minimized the browser.");
      });
      on(window, "blur", () => {
        // A tab switch also blurs; wait a moment so visibilitychange can claim it first, and ignore
        // focus blips that are over by then.
        setTimeout(() => {
          if (document.hasFocus() || document.visibilityState === "hidden") return;
          if (Date.now() - modifierAt < 1500) recordAway("alt_tab", "You switched apps (Alt+Tab).");
          else recordAway("switched_app", "You switched to another app or window.");
        }, 150);
      });
      // The pointer leaving the window, e.g. onto another monitor. Logged, not counted as a warning.
      let mouseLeftAt = 0;
      on(document.documentElement, "mouseleave", () => {
        if (Date.now() - mouseLeftAt < 10_000) return;
        mouseLeftAt = Date.now();
        record("mouse_left");
      });

      // On a computer, a window much smaller than the screen means split screen or notes beside the exam.
      // On a phone, split screen shrinks the page too (unless the keyboard is what shrank it). Logged once
      // each time it shrinks, after the resize settles.
      let timer: ReturnType<typeof setTimeout> | undefined;
      let small = false;
      const phone = window.matchMedia("(pointer: coarse)").matches;
      const onResize = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (phone) {
            const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
            const now = !typing && (window.innerWidth < screen.availWidth * 0.85 || window.innerHeight < screen.availHeight * 0.6);
            if (now && !small) record("split_screen");
            if (!typing) small = now;
          } else {
            const now = window.innerWidth < screen.availWidth * 0.85 || window.innerHeight < screen.availHeight * 0.7;
            if (now && !small && !document.fullscreenElement) record("window_resize");
            small = now;
          }
        }, 500);
      };
      on(window, "resize", onResize);
      on(window, "orientationchange", onResize);

      // Developer tools docked to the window show as a big gap between the window and the page. Rough: it
      // is only logged, and only once per opening.
      if (!phone) {
        let devtoolsOpen = false;
        timers.push(
          setInterval(() => {
            const docked =
              !document.fullscreenElement &&
              (window.outerWidth - window.innerWidth > devtoolsGap || window.outerHeight - window.innerHeight > devtoolsGap);
            if (docked && !devtoolsOpen) record("devtools_open");
            devtoolsOpen = docked;
          }, 2000),
        );
      }

      // Can't be blocked, only noticed (Windows fires it on key up).
      on(document, "keyup", (e) => {
        if ((e as KeyboardEvent).key === "PrintScreen") record("screenshot");
      });

      // Text that shows up all at once wasn't typed: pasted, an auto-typer, or a script filling the box.
      const lengths = new WeakMap<EventTarget, number>();
      on(document, "focusin", (e) => {
        const el = e.target;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) lengths.set(el, el.value.length);
      });
      on(document, "input", (e) => {
        const el = e.target;
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
        const before = lengths.get(el) ?? el.value.length;
        lengths.set(el, el.value.length);
        if (el.value.length - before > bulkInputChars) {
          record("bulk_input");
          setNotice({ kind: "blocked", message: "A large amount of text appeared at once." });
        }
      });
    }

    if (blockSecondScreen && "isExtended" in window.screen) {
      let wasExtended = false;
      const check = () => {
        const extended = hasSecondScreen();
        setSecondScreen(extended);
        if (extended && !wasExtended) recordAway("second_screen", "A second screen was connected.");
        wasExtended = extended;
      };
      check();
      // Chrome fires "change" on screen when monitors are added or removed (not in the DOM types yet).
      on(window.screen as unknown as EventTarget, "change", check);
    }

    if (needsFullscreen) {
      on(document, "fullscreenchange", () => {
        if (document.fullscreenElement) {
          reentered = true;
          return;
        }
        // Leaving full screen after going back into it is always a new warning, however quickly it
        // happens. Without going back in first (Alt+Tab drops full screen too) it's the same warning.
        if (reentered) {
          incident.current = false;
          closeOpen(Date.now());
        }
        recordAway("exit_fullscreen", "You left full screen.");
      });
    }

    // Each switch blocks and logs one thing and nothing else.
    if (blockCopy) {
      on(document, "copy", blocked("copy", "Copying is turned off."));
      on(document, "cut", blocked("copy", "Copying is turned off."));
    }
    if (blockPaste) {
      // Paste is allowed (but logged) in the code editor when the teacher chose so.
      const inCode = (e: Event) => allowPasteInCode && e.target instanceof Element && !!e.target.closest(".cm-editor");
      const pasteIn = (e: Event) => {
        if (inCode(e)) record("paste");
        else blocked("paste", "Pasting is turned off.")(e);
      };
      on(document, "paste", pasteIn);
      // Catches pasting by any route (phone long-press menu, extensions) and dropping text into a box.
      on(document, "beforeinput", (e) => {
        const type = (e as InputEvent).inputType;
        // A paste in the code editor was already logged by its paste event.
        if (type.startsWith("insertFromPaste")) {
          if (!inCode(e)) blocked("paste", "Pasting is turned off.")(e);
        } else if (type === "insertFromDrop") blocked("drop", "Dragging text in is turned off.")(e);
      });
      on(document, "dragstart", (e) => e.preventDefault());
      on(document, "dragover", (e) => e.preventDefault());
      on(document, "drop", blocked("drop", "Dragging text in is turned off."));
    }
    if (blockRightClick) on(document, "contextmenu", blocked("right_click", "Right-click is turned off."));
    if (blockPrint) {
      on(window, "beforeprint", () => record("print"));
      on(document, "keydown", (e) => {
        const k = e as KeyboardEvent;
        const key = k.key.toLowerCase();
        if ((k.ctrlKey || k.metaKey) && (key === "p" || key === "s")) blocked("print", "Printing and saving are turned off.")(k);
      });
    }

    return () => {
      timers.forEach(clearInterval);
      listeners.forEach(([target, name, fn]) => target.removeEventListener(name, fn));
    };
  }, [
    active,
    trackFocus,
    needsFullscreen,
    blockRightClick,
    blockCopy,
    blockPaste,
    blockPrint,
    allowPasteInCode,
    blockSecondScreen,
    closeOpen,
  ]);

  const timesAway = awayCount(events);
  // autoSubmitAfter is how many times a student may leave and come back; leaving once more submits.
  useEffect(() => {
    if (!active || autoSubmitAfter === null || limitReached.current || timesAway <= autoSubmitAfter) return;
    limitReached.current = true;
    const at = Date.now();
    closeOpen(at);
    latestOnLimit.current([...log.current, { type: "auto_submitted", at: new Date(at).toISOString() }]);
  }, [active, autoSubmitAfter, timesAway, closeOpen]);

  return {
    events,
    timesAway,
    notice,
    // A second monitor is connected right now; the exam is covered until it's unplugged.
    secondScreen: active && blockSecondScreen && secondScreen,
    dismissNotice: () => setNotice(null),
    // The events the server doesn't have yet that are complete: the one waiting for its duration (the student
    // is still away) and everything after it wait for the next round.
    pending(sent: number): { events: IntegrityEvent[]; end: number } {
      const end = open.current ? open.current.index : log.current.length;
      return { events: log.current.slice(sent, end), end };
    },
    // Everything, with the open away event closed at this moment: for the final submit.
    finish(): IntegrityEvent[] {
      closeOpen(Date.now());
      return log.current;
    },
    // Run something (like confirm()) that takes focus away without counting it as leaving.
    withoutTracking<T>(fn: () => T): T {
      suppressed.current = true;
      try {
        return fn();
      } finally {
        // The blur from a dialog can arrive just after it closes.
        setTimeout(() => {
          suppressed.current = false;
        }, 300);
      }
    },
  };
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
