"use client";

import { inputClass } from "@/components/ui";
import { parseNumber } from "@/lib/math";
import type { InputProps } from "../views/input";

export function Input({ q, value, onChange }: InputProps<"numeric">) {
  const text = typeof value === "string" ? value : "";
  const n = parseNumber(text);
  return (
        <div>
          <div className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => onChange(e.target.value)}
              inputMode="decimal"
              placeholder="Your answer"
              aria-label="Your answer"
              className={`${inputClass} max-w-48`}
            />
            {q.unit && <span className="text-sm text-muted">{q.unit}</span>}
          </div>
          <p className="mt-1 text-xs text-muted">
            {text.trim() && n === null
              ? "Type a number, like 12, -3.5, 3/4 or 1 1/2."
              : "Numbers only. Fractions like 3/4 are fine."}
          </p>
        </div>
  );
}
