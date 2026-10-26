"use client";

import clsx from "clsx";
import type { EditorProps } from "../views/editor";

export function Editor({ q, onChange }: EditorProps<"true_false">) {
  return (
    <div role="group" aria-label="Correct answer" className="grid grid-cols-2 gap-2">
      {[true, false].map((value) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={q.answer === value}
          onClick={() => onChange({ ...q, answer: value })}
          className={clsx(
            "rounded-lg border px-4 py-2.5 text-sm font-medium",
            q.answer === value ? "border-success bg-success-soft text-success" : "border-border hover:bg-surface-muted",
          )}
        >
          {value ? "True" : "False"}
        </button>
      ))}
    </div>
  );
}
