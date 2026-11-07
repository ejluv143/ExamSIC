"use client";

import clsx from "clsx";
import { Code2, Type } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { MarkdownEditor } from "./markdown-editor";
import { RichTextEditor } from "./rich-text-editor";

// Where the teacher's choice of editor is kept, for every text box on the page ("1": markdown, "0": rich text).
const storageKey = "examinus:editor:markdown";

// The preference is an external store: every box on the page follows a change at once, and the server renders
// without it (null: not chosen yet, which means rich text).
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

// A text box for what students read, written either in a rich text editor (formatting shown as it will look) or in
// the markdown editor (the syntax, with a preview). Both write the same markdown. The teacher picks one under the
// box and the choice is remembered for every box; text the rich editor can't show faithfully opens in markdown, so
// nothing is lost. `blanks` adds a way to write {{answer}} blanks.
export function TextEditor({
  value,
  onChange,
  label,
  rows = 4,
  placeholder,
  blanks,
  assetUrls,
  images,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  rows?: number;
  placeholder?: string;
  blanks?: boolean;
  assetUrls?: Record<string, string>;
  images?: boolean;
}) {
  const preferred = useSyncExternalStore(subscribe, readPreference, () => null);
  // This box's text uses markdown the rich editor would change: it stays in markdown until the page is reloaded.
  const [unsupported, setUnsupported] = useState(false);
  const markdown = unsupported || preferred === "1";

  const option = (on: boolean) =>
    clsx(
      "inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors",
      on ? "bg-primary text-primary-foreground shadow-depth" : "text-muted hover:bg-surface-muted hover:text-foreground",
    );
  const switcher = (
    <div className="flex flex-wrap items-center gap-2 px-1 pt-1">
      <div role="radiogroup" aria-label={`Editor for ${label}`} className="inline-flex gap-0.5 rounded-lg bg-surface-muted/70 p-0.5">
        <button
          type="button"
          role="radio"
          aria-checked={!markdown}
          disabled={unsupported}
          onClick={() => writePreference(false)}
          className={clsx(option(!markdown), "disabled:cursor-not-allowed disabled:opacity-50")}
        >
          <Type className="size-3.5" aria-hidden /> Rich text
        </button>
        <button type="button" role="radio" aria-checked={markdown} onClick={() => writePreference(true)} className={option(markdown)}>
          <Code2 className="size-3.5" aria-hidden /> Markdown
        </button>
      </div>
      {unsupported && <span className="text-xs text-muted">This text uses formatting only the markdown editor shows.</span>}
    </div>
  );

  if (markdown)
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
        {switcher}
      </div>
    );

  return (
    <div className="space-y-1">
      <RichTextEditor
        value={value}
        onChange={onChange}
        label={label}
        rows={rows}
        placeholder={placeholder}
        blanks={blanks}
        assetUrls={assetUrls}
        images={images}
        onUnsupported={() => setUnsupported(true)}
      />
      {switcher}
    </div>
  );
}
