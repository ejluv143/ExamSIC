"use client";

import { useState, type ClipboardEventHandler } from "react";
import clsx from "clsx";
import type {
  StudentBlankQuestion,
  StudentEssayQuestion,
  StudentMatchingQuestion,
  StudentMultipleChoiceQuestion,
} from "@examora/contract";
import { Markdown } from "./markdown";
import { MarkdownEditor } from "./markdown-editor";
import { inputClass } from "./ui";

const letter = (i: number) => String.fromCharCode(65 + i);

// Markdown as plain text, for places that only take text (the options of a <select>).
export function plainText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\$+/g, "")
    .replace(/[*_`~#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const selectClass = `${inputClass} appearance-auto`;

export function ChoiceAnswer({
  q,
  value,
  onChange,
}: {
  q: StudentMultipleChoiceQuestion;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}) {
  const picked = q.multipleCorrect ? (Array.isArray(value) ? value : []) : [typeof value === "string" ? value : ""];
  return (
    <div>
      {q.multipleCorrect && <p className="mb-2 text-xs text-muted">Select all that apply.</p>}
      <div className="space-y-2" role={q.multipleCorrect ? "group" : "radiogroup"}>
        {q.choices.map((c, i) => {
          const checked = picked.includes(c.id);
          return (
            <label
              key={c.id}
              className={clsx(
                "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
                checked ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-muted",
              )}
            >
              <input
                type={q.multipleCorrect ? "checkbox" : "radio"}
                name={q.id}
                checked={checked}
                onChange={() =>
                  onChange(
                    q.multipleCorrect ? (checked ? picked.filter((x) => x !== c.id) : [...picked, c.id]) : c.id,
                  )
                }
                className="size-4 shrink-0 accent-primary"
              />
              <span className="font-medium text-muted">{letter(i)}.</span>
              <Markdown inline className="min-w-0">
                {c.text}
              </Markdown>
            </label>
          );
        })}
      </div>
    </div>
  );
}

const blankInput =
  "mx-1 w-36 max-w-full border-0 border-b-2 border-border bg-transparent px-1 py-0.5 text-center focus:border-primary focus:outline-none";

export function BlankAnswer({
  q,
  value,
  onChange,
}: {
  q: StudentBlankQuestion;
  value: string[] | string | undefined;
  onChange: (v: string[]) => void;
}) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const given = Array.from({ length: Math.max(1, q.blankCount) }, (_, i) => list[i] ?? "");
  const [selected, setSelected] = useState<number | null>(null);
  const setAt = (i: number, v: string) => onChange(given.map((x, j) => (j === i ? v : x)));

  if (q.mode === "identification")
    return (
      <div className="space-y-2">
        <Markdown>{q.prompt}</Markdown>
        <input
          value={given[0]}
          onChange={(e) => onChange([e.target.value])}
          placeholder="Your answer"
          aria-label="Your answer"
          className={inputClass}
        />
      </div>
    );

  const bank = q.clozeInput === "bank" && q.mode === "cloze";
  const counts = new Map<string, number>();
  for (const w of q.bank) counts.set(w, (counts.get(w) ?? 0) + 1);
  const used = (w: string) => given.filter((x) => x === w).length;

  function pick(word: string) {
    const target = selected !== null && !given[selected] ? selected : given.findIndex((x) => !x);
    if (target < 0) return;
    setAt(target, word);
    setSelected(null);
  }

  function renderBlank(i: number) {
    if (i >= given.length) return null;
    if (!bank && q.clozeInput === "dropdown")
      return (
        <select
          value={given[i]}
          onChange={(e) => setAt(i, e.target.value)}
          aria-label={`Blank ${i + 1}`}
          className="mx-1 max-w-full rounded-md border border-border bg-surface px-1.5 py-1 text-sm"
        >
          <option value="">Choose…</option>
          {(q.options[i] ?? []).map((o, k) => (
            <option key={k} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    if (bank)
      return (
        <button
          type="button"
          aria-label={given[i] ? `Blank ${i + 1}: ${given[i]}. Tap to return the word` : `Blank ${i + 1}, empty`}
          onClick={() => (given[i] ? setAt(i, "") : setSelected(selected === i ? null : i))}
          className={clsx(
            "mx-1 inline-block min-h-8 min-w-20 rounded-md border-b-2 px-2 py-0.5 align-baseline",
            given[i] ? "border-primary bg-primary-soft" : "border-border bg-surface-muted",
            selected === i && "outline-2 outline-primary",
          )}
        >
          {given[i] || "\u00a0"}
        </button>
      );
    return (
      <input
        value={given[i]}
        onChange={(e) => setAt(i, e.target.value)}
        aria-label={`Blank ${i + 1}`}
        className={blankInput}
      />
    );
  }

  return (
    <div className="space-y-3">
      <Markdown renderBlank={renderBlank} className="leading-10">
        {q.prompt}
      </Markdown>
      {bank && (
        <div className="flex flex-wrap gap-2" aria-label="Word bank">
          {[...counts.keys()].map((w) => (
            <button
              key={w}
              type="button"
              disabled={used(w) >= (counts.get(w) ?? 0)}
              onClick={() => pick(w)}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-40"
            >
              {w}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MatchingAnswer({
  q,
  value,
  onChange,
}: {
  q: StudentMatchingQuestion;
  value: string[] | undefined;
  onChange: (v: string[]) => void;
}) {
  const given = q.left.map((_, i) => (Array.isArray(value) ? (value[i] ?? "") : ""));
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {q.left.map((item, i) => (
          <li key={item.id} className="flex flex-col gap-1.5 @lg:flex-row @lg:items-center @lg:gap-3">
            <div className="flex min-w-0 flex-1 gap-2 text-sm">
              <span className="text-muted">{i + 1}.</span>
              <Markdown inline>{item.text}</Markdown>
            </div>
            <select
              value={given[i]}
              onChange={(e) => onChange(given.map((x, j) => (j === i ? e.target.value : x)))}
              aria-label={`Match for item ${i + 1}`}
              className={`${selectClass} @lg:max-w-64`}
            >
              <option value="">Choose…</option>
              {q.right.map((r, k) => (
                <option key={r.id} value={r.id}>
                  {letter(k)}. {plainText(r.text)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <ol className="space-y-1 rounded-lg bg-surface-muted p-3 text-sm" aria-label="Choices">
        {q.right.map((r, k) => (
          <li key={r.id} className="flex gap-2">
            <span className="font-medium text-muted">{letter(k)}.</span>
            <Markdown inline>{r.text}</Markdown>
          </li>
        ))}
      </ol>
    </div>
  );
}

// The essay is written in markdown. `onPaste` is passed to the text box so the exam can block pasting.
export function EssayAnswer({
  value,
  onChange,
  onPaste,
}: {
  q?: StudentEssayQuestion;
  value: string | undefined;
  onChange: (v: string) => void;
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>;
}) {
  return (
    <MarkdownEditor
      value={value ?? ""}
      onChange={onChange}
      label="Your answer"
      rows={8}
      placeholder="Write your answer…"
      onPaste={onPaste}
    />
  );
}
