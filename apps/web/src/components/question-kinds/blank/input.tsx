"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Markdown } from "@/components/markdown";
import { Select } from "@/components/select";
import { inputBase } from "@/components/ui";
import type { InputProps } from "../views/input";

const blankInput =
  "mx-1 w-36 max-w-full border-0 border-b-2 border-border bg-transparent px-1 py-0.5 text-center focus:border-primary focus:outline-none";

export function Input({ q, value: answer, onChange, assetUrls }: InputProps<"blank">) {
  const value = Array.isArray(answer) || typeof answer === "string" ? answer : undefined;
  const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const given = Array.from({ length: Math.max(1, q.blankCount) }, (_, i) => list[i] ?? "");
  const [selected, setSelected] = useState<number | null>(null);
  const setAt = (i: number, v: string) => onChange(given.map((x, j) => (j === i ? v : x)));

  const bank = q.clozeInput === "bank";
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
    const lengths = q.boxes[i];
    if (lengths)
      return <LetterBoxes lengths={lengths} value={given[i] ?? ""} onChange={(v) => setAt(i, v)} label={`Blank ${i + 1}`} />;
    if (q.clozeInput === "dropdown")
      return (
        <Select
          value={given[i]}
          onChange={(v) => setAt(i, v)}
          aria-label={`Blank ${i + 1}`}
          size="xs"
          className="mx-1 max-w-full"
          triggerClassName="text-sm"
          // "Choose…" stays pickable, so a student can empty the blank again.
          options={[
            { value: "", label: <span className="text-muted">Choose…</span>, textValue: "Choose" },
            ...(q.options[i] ?? []).map((o) => ({ value: o, label: o })),
          ]}
        />
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
      <Markdown renderBlank={renderBlank} className="leading-10" assetUrls={assetUrls}>
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

// One box per letter, words apart, drawn inside the sentence. The answer is the letters joined, words separated by a
// space; typing moves to the next box, Backspace on an empty box to the one before, and a paste fills from the box it
// lands in. The boxes keep their own letters (the saved answer can't say which boxes were skipped); a saved answer
// fills them from the first.
function LetterBoxes({
  lengths,
  value,
  onChange,
  label,
}: {
  lengths: readonly number[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const total = lengths.reduce((sum, n) => sum + n, 0);
  const [letters, setLetters] = useState(() => Array.from({ length: total }, (_, i) => value.replace(/\s+/g, "")[i] ?? ""));
  // Key presses can land before the render that follows the last one: handlers read this copy.
  const current = useRef(letters);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  // Letters back into words of the given lengths.
  const update = (next: string[]) => {
    current.current = next;
    setLetters(next);
    const words: string[] = [];
    let at = 0;
    for (const n of lengths) {
      words.push(next.slice(at, at + n).join(""));
      at += n;
    }
    onChange(words.join(" ").replace(/\s+/g, " ").trim());
  };
  const clear = (i: number) => update(current.current.map((l, j) => (j === i ? "" : l)));
  const set = (i: number, chars: string) => {
    const next = [...current.current];
    const incoming = chars.replace(/\s+/g, "").split("");
    for (let k = 0; k < incoming.length && i + k < total; k++) next[i + k] = incoming[k]!;
    update(next);
    refs.current[Math.min(total - 1, i + Math.max(1, incoming.length))]?.focus();
  };
  let index = 0;
  return (
    <span role="group" aria-label={`${label}, ${total} letters`} className="mx-1 inline-flex flex-wrap items-center gap-x-3 gap-y-1 align-middle">
      {lengths.map((n, w) => (
        <span key={w} className="inline-flex gap-1">
          {Array.from({ length: n }, () => {
            const i = index++;
            return (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                value={letters[i]}
                maxLength={total}
                aria-label={`${label}, letter ${i + 1}`}
                autoCapitalize="off"
                autoComplete="off"
                className={clsx(inputBase, "size-9 flex-none px-0 text-center text-lg font-medium uppercase")}
                onChange={(e) => {
                  // The box already holds a letter: the new one replaces it.
                  const was = current.current[i] ?? "";
                  const typed = e.target.value.replace(was, "") || e.target.value;
                  if (typed === "") clear(i);
                  else set(i, typed);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && (current.current[i] ?? "") === "" && i > 0) {
                    e.preventDefault();
                    clear(i - 1);
                    refs.current[i - 1]?.focus();
                  } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
                  else if (e.key === "ArrowRight" && i < total - 1) refs.current[i + 1]?.focus();
                }}
              />
            );
          })}
        </span>
      ))}
    </span>
  );
}
