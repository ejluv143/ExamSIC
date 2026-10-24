"use client";

import clsx from "clsx";
import { SlidersHorizontal, TextCursorInput } from "lucide-react";
import { useRef, useSyncExternalStore } from "react";
import { MarkdownEditor } from "./markdown-editor";
import { inputClass } from "./ui";

// Where the teacher's choice of editor is kept, for every text box on the page.
const storageKey = "examinus:editor:markdown";

// Text that only the markdown editor shows faithfully: emphasis, code, math, pictures, links, headings, tables.
const looksLikeMarkdown = (text: string) => /(\*\*|__|`|\$|!\[|\]\(|^#{1,6}\s|^\s*\|.*\|\s*$|<[a-z]+[\s>])/m.test(text);

// The preference is an external store: every box on the page follows a change at once, and the server renders
// without it (null: not chosen yet).
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
};
const readPreference = (): "1" | "0" | null => {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === "1" || stored === "0" ? stored : null;
  } catch {
    return null;
  }
};
const writePreference = (markdown: boolean) => {
  try {
    localStorage.setItem(storageKey, markdown ? "1" : "0");
  } catch {
    // A browser without storage only loses the preference.
  }
  listeners.forEach((fn) => fn());
};

// A plain text box for what students read. Markdown (formatting, math, pictures) is an advanced setting: the
// teacher turns it on from the box, the choice is remembered for every box, and text that already uses markdown
// opens in the markdown editor so nothing is hidden. `blanks` adds "Insert blank" ({{answer}}) to the simple box too.
export function TextEditor({
  value,
  onChange,
  label,
  rows = 4,
  placeholder,
  blanks,
  assetUrls,
  images,
  bare,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  rows?: number;
  placeholder?: string;
  blanks?: boolean;
  assetUrls?: Record<string, string>;
  images?: boolean;
  // Classes of a borderless, auto-growing simple box (for writing in place on a page that looks like the result);
  // its helper row then only shows while the box has focus. The markdown editor keeps its frame and toolbar.
  bare?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Markdown the text already uses is never hidden; otherwise the stored preference decides.
  const preferred = useSyncExternalStore(subscribe, readPreference, () => null);
  const forced = looksLikeMarkdown(value) && preferred !== "1";
  const advanced = forced || preferred === "1";

  function insertBlank() {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const inner = value.slice(start, end) || "answer";
    onChange(`${value.slice(0, start)}{{${inner}}}${value.slice(end)}`);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + 2, start + 2 + inner.length);
    });
  }

  const switchButton = (
    <button
      type="button"
      onClick={() => writePreference(!advanced)}
      className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
      title={advanced ? "Back to plain text" : "Formatting, math, pictures and links"}
    >
      <SlidersHorizontal className="size-3.5" aria-hidden />
      {advanced ? "Simple text" : "Markdown editor"}
    </button>
  );

  if (advanced)
    return (
      <div className="space-y-1">
        <MarkdownEditor
          value={value}
          onChange={onChange}
          label={label}
          rows={rows}
          placeholder={placeholder}
          blanks={blanks}
          assetUrls={assetUrls}
          images={images}
        />
        <div className="flex items-center px-1">
          {forced ? <span className="text-xs text-muted">This text uses markdown, so the markdown editor stays on.</span> : switchButton}
        </div>
      </div>
    );

  return (
    <div className={clsx("space-y-1", bare !== undefined && "group")}>
      <textarea
        ref={ref}
        aria-label={label}
        value={value}
        rows={bare === undefined ? rows : 1}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={bare === undefined ? clsx(inputClass, "block resize-y") : clsx("block w-full resize-none bg-transparent [field-sizing:content] outline-none placeholder:text-muted/70", bare)}
      />
      <div className={clsx("flex items-center gap-3 px-1", bare !== undefined && "hidden group-focus-within:flex")}>
        {blanks && (
          <button type="button" onClick={insertBlank} className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
            <TextCursorInput className="size-3.5" aria-hidden /> Insert blank
          </button>
        )}
        {switchButton}
      </div>
    </div>
  );
}
