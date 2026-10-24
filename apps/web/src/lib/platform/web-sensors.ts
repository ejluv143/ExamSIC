import type { IntegrityEmit, IntegritySensor } from "@examinus/taking/integrity";
import { integrityNotice } from "@examinus/copy/integrity";
import type { IntegrityEventType, IntegritySettings } from "@examinus/domain/quiz";

// More characters appearing in one go isn't typing.
const bulkInputChars = 30;
// Docked developer tools make the window's outside bigger than its page by about this much.
const devtoolsGap = 200;

type ExtendedScreen = Screen & { isExtended?: boolean };

// Chrome and Edge report a second monitor; other browsers can't tell, so this is false there.
export function hasSecondScreen() {
  return typeof window !== "undefined" && (window.screen as ExtendedScreen).isExtended === true;
}

// What watches a browser tab. Each switch is only watched when its setting is on, so a quiz that blocks nothing
// listens to nothing. `needsFullscreen`: full screen is required and this browser can do it; "back" then means back
// in full screen.
export function webSensors(settings: IntegritySettings, { needsFullscreen }: { needsFullscreen: boolean }): IntegritySensor[] {
  const { trackFocus, blockRightClick, blockCopy, blockPaste, blockPrint, allowPasteInCode, blockSecondScreen } = settings;
  const sensors: IntegritySensor[] = [
    {
      // Back means on the page and, when full screen is required, in full screen. Focus isn't checked
      // then: browsers report it unreliably while switching into full screen.
      back: () => document.visibilityState === "visible" && (needsFullscreen ? !!document.fullscreenElement : document.hasFocus()),
      start: () => () => {},
    },
  ];
  if (trackFocus) sensors.push({ start: trackFocusListeners });
  if (blockSecondScreen) sensors.push({ start: secondScreenListener });
  if (needsFullscreen) sensors.push({ start: fullscreenListener });
  if (blockCopy) sensors.push({ start: (emit) => copyListeners(emit) });
  if (blockPaste) sensors.push({ start: (emit) => pasteListeners(emit, allowPasteInCode) });
  if (blockRightClick) sensors.push({ start: (emit) => listen([[document, "contextmenu", blocked(emit, "right_click", integrityNotice.rightClick)]]) });
  if (blockPrint) sensors.push({ start: printListeners });
  return sensors;
}

type Listener = [EventTarget, string, EventListener];

// Adds the listeners; returns what removes them (and clears the timers).
function listen(listeners: Listener[], timers: ReturnType<typeof setInterval>[] = []) {
  for (const [target, name, fn] of listeners) target.addEventListener(name, fn);
  return () => {
    timers.forEach(clearInterval);
    for (const [target, name, fn] of listeners) target.removeEventListener(name, fn);
  };
}

// Blocks the action and logs it with a notice.
const blocked = (emit: IntegrityEmit, type: IntegrityEventType, message: string) => (e: Event) => {
  e.preventDefault();
  emit.record(type, { notice: message });
};

function trackFocusListeners(emit: IntegrityEmit) {
  const listeners: Listener[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];
  const on = (target: EventTarget, name: string, fn: EventListener) => listeners.push([target, name, fn]);

  // Alt+Tab can't be blocked by a web page, but the Alt (or Windows/Cmd) key just before leaving gives it away.
  let modifierAt = 0;
  on(document, "keydown", (e) => {
    if (["Alt", "Meta", "OS"].includes((e as KeyboardEvent).key)) modifierAt = Date.now();
  });
  on(document, "visibilitychange", () => {
    if (document.visibilityState === "hidden") emit.away("left_page", integrityNotice.leftPage);
  });
  on(window, "blur", () => {
    // A tab switch also blurs; wait a moment so visibilitychange can claim it first, and ignore
    // focus blips that are over by then.
    setTimeout(() => {
      if (document.hasFocus() || document.visibilityState === "hidden") return;
      if (Date.now() - modifierAt < 1500) emit.away("alt_tab", integrityNotice.altTab);
      else emit.away("switched_app", integrityNotice.switchedApp);
    }, 150);
  });
  // The pointer leaving the window, e.g. onto another monitor. Logged, not counted as a warning.
  let mouseLeftAt = 0;
  on(document.documentElement, "mouseleave", () => {
    if (Date.now() - mouseLeftAt < 10_000) return;
    mouseLeftAt = Date.now();
    emit.record("mouse_left");
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
        if (now && !small) emit.record("split_screen");
        if (!typing) small = now;
      } else {
        const now = window.innerWidth < screen.availWidth * 0.85 || window.innerHeight < screen.availHeight * 0.7;
        if (now && !small && !document.fullscreenElement) emit.record("window_resize");
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
        if (docked && !devtoolsOpen) emit.record("devtools_open");
        devtoolsOpen = docked;
      }, 2000),
    );
  }

  // Can't be blocked, only noticed (Windows fires it on key up).
  on(document, "keyup", (e) => {
    if ((e as KeyboardEvent).key === "PrintScreen") emit.record("screenshot");
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
    if (el.value.length - before > bulkInputChars) emit.record("bulk_input", { notice: integrityNotice.bulkInput });
  });

  const stop = listen(listeners, timers);
  return () => {
    clearTimeout(timer);
    stop();
  };
}

function secondScreenListener(emit: IntegrityEmit) {
  if (!("isExtended" in window.screen)) return () => {};
  let wasExtended = false;
  const check = () => {
    const extended = hasSecondScreen();
    emit.secondScreen(extended);
    if (extended && !wasExtended) emit.away("second_screen", integrityNotice.secondScreen);
    wasExtended = extended;
  };
  check();
  // Chrome fires "change" on screen when monitors are added or removed (not in the DOM types yet).
  return listen([[window.screen as unknown as EventTarget, "change", check]]);
}

function fullscreenListener(emit: IntegrityEmit) {
  return listen([
    [
      document,
      "fullscreenchange",
      () => {
        if (document.fullscreenElement) emit.reenteredFullscreen();
        else emit.away("exit_fullscreen", integrityNotice.exitFullscreen, { fullscreenExit: true });
      },
    ],
  ]);
}

// Each switch blocks and logs one thing and nothing else.
function copyListeners(emit: IntegrityEmit) {
  const onCopy = blocked(emit, "copy", integrityNotice.copy);
  return listen([
    [document, "copy", onCopy],
    [document, "cut", onCopy],
  ]);
}

function pasteListeners(emit: IntegrityEmit, allowPasteInCode: boolean) {
  // Paste is allowed (but logged) in the code editor when the teacher chose so.
  const inCode = (e: Event) => allowPasteInCode && e.target instanceof Element && !!e.target.closest(".cm-editor");
  const blockPaste = blocked(emit, "paste", integrityNotice.paste);
  const blockDrop = blocked(emit, "drop", integrityNotice.drop);
  return listen([
    [document, "paste", (e) => (inCode(e) ? emit.record("paste") : blockPaste(e))],
    // Catches pasting by any route (phone long-press menu, extensions) and dropping text into a box.
    [
      document,
      "beforeinput",
      (e) => {
        const type = (e as InputEvent).inputType;
        // A paste in the code editor was already logged by its paste event.
        if (type.startsWith("insertFromPaste")) {
          if (!inCode(e)) blockPaste(e);
        } else if (type === "insertFromDrop") blockDrop(e);
      },
    ],
    // Blocking the browser's own drag and drop doesn't touch the drag-and-drop answers: those (dnd-kit, inside
    // `data-dnd-answer`) follow the mouse, finger and keyboard and never use native drag events. Blocking
    // dragstart even stops a native drag of a card's picture from cutting a pointer drag short.
    [document, "dragstart", (e) => e.preventDefault()],
    [document, "dragover", (e) => e.preventDefault()],
    [document, "drop", blockDrop],
  ]);
}

function printListeners(emit: IntegrityEmit) {
  const blockPrint = blocked(emit, "print", integrityNotice.print);
  return listen([
    [window, "beforeprint", () => emit.record("print")],
    [
      document,
      "keydown",
      (e) => {
        const k = e as KeyboardEvent;
        const key = k.key.toLowerCase();
        if ((k.ctrlKey || k.metaKey) && (key === "p" || key === "s")) blockPrint(k);
      },
    ],
  ]);
}
