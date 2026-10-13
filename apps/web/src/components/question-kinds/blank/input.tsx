"use client";

import { useState } from "react";
import clsx from "clsx";
import { blankStyle } from "@examinus/domain/kinds/blank";
import { Markdown } from "@/components/markdown";
import { Select } from "@/components/select";
import { inputClass } from "@/components/ui";
import type { InputProps } from "../views/input";

const blankInput =
  "mx-1 w-36 max-w-full border-0 border-b-2 border-border bg-transparent px-1 py-0.5 text-center focus:border-primary focus:outline-none";

export function Input({ q, value: answer, onChange, assetUrls }: InputProps<"blank">) {
  const value = Array.isArray(answer) || typeof answer === "string" ? answer : undefined;
  const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const given = Array.from({ length: Math.max(1, q.blankCount) }, (_, i) => list[i] ?? "");
  const [selected, setSelected] = useState<number | null>(null);
  const setAt = (i: number, v: string) => onChange(given.map((x, j) => (j === i ? v : x)));

  if (blankStyle(q) === "single")
    return (
      <div className="space-y-2">
        <Markdown assetUrls={assetUrls}>{q.prompt}</Markdown>
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
