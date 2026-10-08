"use client";

import clsx from "clsx";
import type { Question, TrueFalseQuestion } from "@examora/contract";

export function TrueFalseEditor({ q, onChange }: { q: TrueFalseQuestion; onChange: (q: Question) => void }) {
  return (
    <div role="group" aria-label="Correct answer" className="flex gap-2">
      {[true, false].map((value) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={q.answer === value}
          onClick={() => onChange({ ...q, answer: value })}
          className={clsx(
            "rounded-lg border px-4 py-2 text-sm font-medium",
            q.answer === value ? "border-success bg-success-soft text-success" : "border-border hover:bg-surface-muted",
          )}
        >
          {value ? "True" : "False"}
        </button>
      ))}
    </div>
  );
}
