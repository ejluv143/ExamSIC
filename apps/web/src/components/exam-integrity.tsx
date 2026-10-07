"use client";

import { useEffect, useRef, useState } from "react";
import { awayCount } from "@/lib/integrity";
import type { IntegrityEvent, IntegrityEventType, IntegritySettings } from "@/lib/types";

export type IntegrityNotice = { kind: "away" | "blocked"; message: string } | null;

// Leaving full screen and leaving the page often happen together (Alt+Tab); count that as one.
const sameIncidentMs = 1500;
// More than this many characters appearing in one go isn't typing.
const bulkInputChars = 30;

type ExtendedScreen = Screen & { isExtended?: boolean };

// Chrome and Edge report a second monitor; other browsers can't tell, so this is false there.
export function hasSecondScreen() {
  return typeof window !== "undefined" && (window.screen as ExtendedScreen).isExtended === true;
}

// Empties the clipboard so notes copied before the exam can't be pasted. Needs a click to be allowed.
export function clearClipboard() {
  navigator.clipboard?.writeText("").catch(() => {});
}

// Watches the student while they take it: logs leaving the page or full screen, blocks copy/paste,
// and calls onLimit once they've been away too often. Only runs while `active`.
export function useIntegrity({
  active,
  settings,
  initial,
  onLimit,
}: {
  active: boolean;
  settings: IntegritySettings;
  initial: IntegrityEvent[];
  onLimit: (events: IntegrityEvent[]) => void;
}) {
  const [events, setEvents] = useState(initial);
  const [notice, setNotice] = useState<IntegrityNotice>(null);
  const [secondScreen, setSecondScreen] = useState(false);
  const away = useRef(false);
  const lastAwayAt = useRef(0);
  // Our own confirm() dialogs blur the window; they shouldn't count against the student.
  const suppressed = useRef(false);
  const limitReached = useRef(false);
  const latestOnLimit = useRef(onLimit);
  useEffect(() => {
    latestOnLimit.current = onLimit;
  });

  const { trackFocus, requireFullscreen, blockCopyPaste, blockSecondScreen, autoSubmitAfter } = settings;

  useEffect(() => {
    if (!active) return;
    const record = (type: IntegrityEventType) =>
      setEvents((prev) => [...prev, { type, at: new Date().toISOString() }]);

    const recordAway = (type: IntegrityEventType, message: string) => {
      const now = Date.now();
      if (now - lastAwayAt.current < sameIncidentMs) return;
      lastAwayAt.current = now;
      record(type);
      setNotice({ kind: "away", message });
    };
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

    if (trackFocus) {
      // Alt+Tab can't be blocked by a web page, but the Alt (or Windows/Cmd) key just before leaving gives it away.
      let modifierAt = 0;
      on(document, "keydown", (e) => {
        if (["Alt", "Meta", "OS"].includes((e as KeyboardEvent).key)) modifierAt = Date.now();
      });
      const back = () => {
        away.current = false;
      };
      on(document, "visibilitychange", () => {
        if (document.visibilityState !== "hidden") return back();
        if (away.current || suppressed.current) return;
        away.current = true;
        recordAway("left_page", "You switched tabs or minimized the browser.");
      });
      on(window, "blur", () => {
        if (away.current || suppressed.current) return;
        // A tab switch also blurs; wait a moment so visibilitychange can claim it first.
        setTimeout(() => {
          if (away.current || suppressed.current || document.hasFocus()) return;
          away.current = true;
          if (Date.now() - modifierAt < 1500) recordAway("alt_tab", "You switched apps (Alt+Tab).");
          else recordAway("switched_app", "You switched to another app or window.");
        }, 150);
      });
      on(window, "focus", back);
      // The pointer leaving the window, e.g. onto another monitor. Logged, not counted as a warning.
      let mouseLeftAt = 0;
      on(document.documentElement, "mouseleave", () => {
        if (Date.now() - mouseLeftAt < 10_000) return;
        mouseLeftAt = Date.now();
        record("mouse_left");
      });
    }

    if (trackFocus) {
      // A window much smaller than the screen means split screen or notes beside the exam. Logged once
      // each time it shrinks, after the resize settles.
      let timer: ReturnType<typeof setTimeout> | undefined;
      let small = false;
      on(window, "resize", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const now = window.innerWidth < screen.availWidth * 0.85 || window.innerHeight < screen.availHeight * 0.7;
          if (now && !small && !document.fullscreenElement) record("window_resize");
          small = now;
        }, 500);
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

    if (requireFullscreen) {
      on(document, "fullscreenchange", () => {
        if (!document.fullscreenElement) recordAway("exit_fullscreen", "You left full screen.");
      });
    }

    if (blockCopyPaste) {
      on(document, "copy", blocked("copy", "Copying is turned off."));
      on(document, "cut", blocked("copy", "Copying is turned off."));
      on(document, "paste", blocked("paste", "Pasting is turned off."));
      // Catches pasting by any route (phone long-press menu, extensions) and dropping text into a box.
      on(document, "beforeinput", (e) => {
        const type = (e as InputEvent).inputType;
        if (type.startsWith("insertFromPaste")) blocked("paste", "Pasting is turned off.")(e);
        else if (type === "insertFromDrop") blocked("drop", "Dragging text in is turned off.")(e);
      });
      on(document, "dragstart", (e) => e.preventDefault());
      on(document, "dragover", (e) => e.preventDefault());
      on(document, "drop", blocked("drop", "Dragging text in is turned off."));
      // Text that shows up all at once wasn't typed: an auto-typer or a script filling the box.
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
      on(document, "contextmenu", blocked("right_click", "Right-click is turned off."));
      on(window, "beforeprint", () => record("print"));
      on(document, "keydown", (e) => {
        const k = e as KeyboardEvent;
        const key = k.key.toLowerCase();
        const mod = k.ctrlKey || k.metaKey;
        if (mod && (key === "p" || key === "s")) blocked("print", "Printing and saving are turned off.")(k);
        // Developer tools: F12, Ctrl+Shift+I/J/C, Cmd+Option+I/J/C. Blocked, not logged.
        else if (key === "f12" || (mod && (k.shiftKey || k.altKey) && ["i", "j", "c"].includes(key))) k.preventDefault();
      });
      // Can't be blocked, only noticed (Windows fires it on key up).
      on(document, "keyup", (e) => {
        if ((e as KeyboardEvent).key === "PrintScreen") record("screenshot");
      });
    }

    return () => listeners.forEach(([target, name, fn]) => target.removeEventListener(name, fn));
  }, [active, trackFocus, requireFullscreen, blockCopyPaste, blockSecondScreen]);

  const timesAway = awayCount(events);
  useEffect(() => {
    if (!active || autoSubmitAfter === null || limitReached.current || timesAway < autoSubmitAfter) return;
    limitReached.current = true;
    latestOnLimit.current([...events, { type: "auto_submitted", at: new Date().toISOString() }]);
  }, [active, autoSubmitAfter, timesAway, events]);

  return {
    events,
    timesAway,
    notice,
    // A second monitor is connected right now; the exam is covered until it's unplugged.
    secondScreen: active && blockSecondScreen && secondScreen,
    dismissNotice: () => setNotice(null),
    // Run something (like confirm()) that takes focus away without counting it as leaving.
    withoutTracking<T>(fn: () => T): T {
      suppressed.current = true;
      try {
        return fn();
      } finally {
        // The blur from a dialog can arrive just after it closes.
        setTimeout(() => {
          suppressed.current = false;
          away.current = false;
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
