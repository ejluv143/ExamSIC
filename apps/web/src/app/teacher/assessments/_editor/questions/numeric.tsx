"use client";

import clsx from "clsx";
import { useState } from "react";
import { inputClass } from "@/components/ui";
import { parseNumber } from "@/lib/math";
import type { Question } from "@examora/contract";
import { tidy } from "./shared";

export function NumericEditor({
  q,
  onChange,
}: {
  q: Extract<Question, { type: "numeric" }>;
  onChange: (q: Question) => void;
}) {
  // Kept as typed so "3/" or "-" mid-typing isn't thrown away.
  const [answerText, setAnswerText] = useState(String(q.answer));
  const parsed = parseNumber(answerText);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Students type a number. Decimals, fractions (3/4) and mixed numbers (1 1/2) are all read as numbers, so
        0.75 and 3/4 both match.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Correct answer</span>
          <input
            value={answerText}
            onChange={(e) => {
              setAnswerText(e.target.value);
              const n = parseNumber(e.target.value);
              if (n !== null) onChange({ ...q, answer: n });
            }}
            inputMode="decimal"
            aria-invalid={parsed === null}
            className={clsx(inputClass, parsed === null && "border-danger")}
          />
          {parsed === null && <span className="mt-1 block text-xs text-danger">Not a number.</span>}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Allowed error (±)</span>
          <input
            type="number"
            min={0}
            step="any"
            value={q.tolerance}
            onChange={(e) => onChange({ ...q, tolerance: Math.max(0, Number(e.target.value)) })}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Unit (optional)</span>
          <input
            value={q.unit}
            onChange={(e) => onChange({ ...q, unit: e.target.value })}
            placeholder="e.g. cm"
            className={inputClass}
          />
        </label>
      </div>
      <p className="text-xs text-muted">
        Accepts {q.tolerance > 0 ? `${tidy(q.answer - q.tolerance)} to ${tidy(q.answer + q.tolerance)}` : `exactly ${q.answer}`}
        {q.unit && ` ${q.unit}`}.
      </p>
    </div>
  );
}
