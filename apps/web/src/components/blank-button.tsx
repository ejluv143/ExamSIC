"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { blankMarker } from "@examinus/domain/blanks";

// The textarea styles that decide where text wraps, copied onto the measuring copy.
const mirrored = [
  "direction",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "tabSize",
  "textIndent",
  "textTransform",
  "wordSpacing",
] as const;

type Spot = { left: number; top: number; height: number; right: number };

// Where the caret is, in the coordinates of the textarea's offset parent: the text up to the caret is laid out in a
// hidden copy of the textarea and the end of it is measured. Null when the browser can't say.
function caretSpot(el: HTMLTextAreaElement): Spot | null {
  try {
    const style = getComputedStyle(el);
    const copy = document.createElement("div");
    for (const name of mirrored) copy.style[name] = style[name];
    copy.style.position = "absolute";
    copy.style.visibility = "hidden";
    copy.style.top = "0";
    copy.style.left = "-9999px";
    copy.style.boxSizing = "border-box";
    copy.style.width = `${el.clientWidth}px`;
    copy.style.whiteSpace = "pre-wrap";
    copy.style.overflowWrap = "break-word";
    copy.textContent = el.value.slice(0, el.selectionEnd);
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    copy.append(marker);
    document.body.append(copy);
    const spot = { left: marker.offsetLeft, top: marker.offsetTop, height: marker.offsetHeight };
    copy.remove();
    return {
      left: el.offsetLeft + el.clientLeft + spot.left - el.scrollLeft,
      top: el.offsetTop + el.clientTop + spot.top - el.scrollTop,
      height: spot.height,
      right: el.offsetLeft + el.clientLeft + el.clientWidth,
    };
  } catch {
    return null;
  }
}

const choices = [
  { label: "Identification", hint: "{{answer}}", boxes: false },
  { label: "One letter per box", hint: "{{#answer}}", boxes: true },
] as const;

// A small "+ Blank" button that floats beside the caret while the text box is focused. Its menu writes a blank
// ({{answer}} or {{#answer}}) at the caret, or around the selected text, and selects the answer to type over. Render
// it inside a `relative` wrapper that holds only the textarea.
export function BlankButton({
  target,
  value,
  onChange,
}: {
  target: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(null);

  // Focus, typing, caret moves and scrolling all move the button, so the spot is measured in their handlers.
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const measure = () => setSpot(caretSpot(el));
    const leave = (e: FocusEvent) => {
      if (e.relatedTarget instanceof Node && (box.current?.contains(e.relatedTarget) || e.relatedTarget === el)) return;
      setActive(false);
      setOpen(false);
    };
    const enter = () => {
      setActive(true);
      measure();
    };
    const move = () => {
      if (document.activeElement === el) measure();
    };
    el.addEventListener("focus", enter);
    el.addEventListener("blur", leave);
    el.addEventListener("input", move);
    el.addEventListener("scroll", move);
    document.addEventListener("selectionchange", move);
    return () => {
      el.removeEventListener("focus", enter);
      el.removeEventListener("blur", leave);
      el.removeEventListener("input", move);
      el.removeEventListener("scroll", move);
      document.removeEventListener("selectionchange", move);
    };
  }, [target]);

  function insert(boxes: boolean) {
    const el = target.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const inner = value.slice(start, end) || "answer";
    onChange(value.slice(0, start) + blankMarker([inner], boxes) + value.slice(end));
    setOpen(false);
    const from = start + 2 + (boxes ? 1 : 0);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(from, from + inner.length);
    });
  }

  if (!active) return null;
  // Beside the caret, kept inside the box; the end of the text area when the caret can't be measured.
  const style = spot ? { left: Math.min(spot.left + 8, spot.right - 72), top: spot.top + spot.height / 2 } : undefined;

  return (
    <div
      ref={box}
      className={spot ? "absolute z-20 -translate-y-1/2" : "absolute right-2 bottom-2 z-20"}
      style={style}
      onBlur={(e) => {
        if (e.relatedTarget instanceof Node && (e.currentTarget.contains(e.relatedTarget) || e.relatedTarget === target.current)) return;
        setActive(false);
        setOpen(false);
      }}
      // The text box keeps focus (and its selection) while the button is pressed.
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        e.stopPropagation();
        setOpen(false);
        target.current?.focus();
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-primary shadow-sm hover:bg-primary-soft"
      >
        <Plus className="size-3" aria-hidden /> Blank
      </button>
      {open && (
        <div role="menu" aria-label="Insert blank" className="absolute top-full left-0 mt-1 w-48 rounded-lg border border-border bg-surface p-1 shadow-lg">
          {choices.map((c) => (
            <button
              key={c.label}
              type="button"
              role="menuitem"
              onClick={() => insert(c.boxes)}
              className="flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-muted"
            >
              {c.label}
              <code className="text-[11px] text-muted">{c.hint}</code>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
