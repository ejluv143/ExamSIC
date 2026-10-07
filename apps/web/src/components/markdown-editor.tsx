"use client";

import clsx from "clsx";
import { Bold, Code, Italic, Link2, List, ListOrdered, Sigma, TextCursorInput, type LucideIcon } from "lucide-react";
import { useRef, useState, type ClipboardEventHandler } from "react";
import { inputClass } from "./ui";
import { Markdown } from "./markdown";

type Tool = { label: string; icon: LucideIcon; apply: (selected: string) => { text: string; select?: [number, number] } };

const wrap = (before: string, after: string, placeholder: string) => (selected: string) => {
  const inner = selected || placeholder;
  return { text: `${before}${inner}${after}`, select: [before.length, before.length + inner.length] as [number, number] };
};
const prefixLines = (prefix: (i: number) => string, placeholder: string) => (selected: string) => {
  const text = (selected || placeholder).split("\n").map((line, i) => prefix(i) + line).join("\n");
  return { text };
};

const tools: Tool[] = [
  { label: "Bold", icon: Bold, apply: wrap("**", "**", "bold") },
  { label: "Italic", icon: Italic, apply: wrap("*", "*", "italic") },
  { label: "Code", icon: Code, apply: wrap("`", "`", "code") },
  { label: "Bulleted list", icon: List, apply: prefixLines(() => "- ", "item") },
  { label: "Numbered list", icon: ListOrdered, apply: prefixLines((i) => `${i + 1}. `, "item") },
  { label: "Math", icon: Sigma, apply: wrap("$", "$", "x^2") },
  { label: "Link", icon: Link2, apply: (s) => ({ text: `[${s || "text"}](https://)`, select: [1, 1 + (s || "text").length] }) },
];

const blankTool: Tool = { label: "Insert blank", icon: TextCursorInput, apply: wrap("{{", "}}", "answer") };

// A text box for markdown with a small toolbar and a Preview tab. `blanks` adds the "Insert blank" button,
// which writes {{answer}} (or wraps the selected text).
export function MarkdownEditor({
  value,
  onChange,
  label,
  rows = 4,
  placeholder,
  blanks,
  onPaste,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  // Names the text box for screen readers.
  label: string;
  rows?: number;
  placeholder?: string;
  blanks?: boolean;
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  function run(tool: Tool) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { text, select } = tool.apply(value.slice(start, end));
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      const [a, b] = select ?? [text.length, text.length];
      el?.setSelectionRange(start + a, start + b);
    });
  }

  const tab = (active: boolean) =>
    clsx("rounded-md px-2.5 py-1 text-xs font-medium", active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-muted");

  return (
    <div className="rounded-lg border border-border bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
        <button type="button" className={tab(!preview)} onClick={() => setPreview(false)}>
          Write
        </button>
        <button type="button" className={tab(preview)} onClick={() => setPreview(true)}>
          Preview
        </button>
        {!preview && (
          <div className="ml-auto flex flex-wrap items-center gap-0.5">
            {(blanks ? [...tools, blankTool] : tools).map((tool) => (
              <button
                key={tool.label}
                type="button"
                title={tool.label}
                aria-label={tool.label}
                disabled={disabled}
                onClick={() => run(tool)}
                className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
              >
                <tool.icon className="size-4" />
              </button>
            ))}
          </div>
        )}
      </div>
      {preview ? (
        <div className="min-h-16 px-3 py-2 text-sm">
          {value.trim() ? (
            <Markdown renderBlank={(_, answers) => <span className="rounded bg-primary-soft px-1.5 font-medium text-primary underline decoration-dotted">{answers.join(" | ") || "\u00a0\u00a0\u00a0\u00a0"}</span>}>{value}</Markdown>
          ) : (
            <p className="text-muted">Nothing to preview.</p>
          )}
        </div>
      ) : (
        <textarea
          ref={ref}
          aria-label={label}
          value={value}
          rows={rows}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          className={clsx(inputClass, "block resize-y border-0 font-mono text-[13px] focus:ring-0")}
        />
      )}
    </div>
  );
}
