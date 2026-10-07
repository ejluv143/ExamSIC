"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Plus, X } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Button, inputBase, inputClass, Switch } from "@/components/ui";
import type { Question } from "@examora/contract";

export const newId = () => crypto.randomUUID().slice(0, 8);

// The points a part is worth: whole or half points.
export const validPoints = (n: number) => Number.isFinite(n) && n >= 0 && Number.isInteger(n * 2);

// Weights follow the units (blanks, pairs, items, tests): when the editor adds or removes one, so do they.
export type Weighted = Extract<Question, { type: "blank" | "matching" | "enumeration" | "code" }>;
export const weightsAdd = (q: Weighted) => (q.weights?.length ? { weights: [...q.weights, 1] } : {});
export const weightsRemove = (q: Weighted, i: number) =>
  q.weights?.length ? { weights: q.weights.filter((_, j) => j !== i) } : {};

// Whole or half points. Keeps what was typed until it is valid, so "1." or an empty box isn't thrown away.
export function PointsInput({
  value,
  onChange,
  readOnly,
  label,
  className = "w-20",
}: {
  value: number;
  onChange: (points: number) => void;
  readOnly?: boolean;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);
  const invalid = draft !== null && !validPoints(draft.trim() === "" ? NaN : Number(draft));
  return (
    <span className="inline-flex flex-col">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.5}
        value={text}
        readOnly={readOnly}
        aria-label={label}
        aria-invalid={invalid}
        title={readOnly ? "Set by the pool" : "Whole or half points"}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = e.target.value.trim() === "" ? NaN : Number(e.target.value);
          if (validPoints(n)) onChange(n);
        }}
        onBlur={() => setDraft(null)}
        className={clsx(inputBase, className, "py-1", invalid && "border-danger", readOnly && "bg-surface-muted")}
      />
      {invalid && <span className="text-xs text-danger">Whole or half points only.</span>}
    </span>
  );
}

// An on/off option of a question, shown as a switch.
export function Check2({
  checked,
  onChange,
  children,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return <Switch checked={checked} onChange={onChange} label={children} description={hint} />;
}

export function CaseToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <Check2 checked={checked} onChange={onChange}>Case-sensitive</Check2>;
}

// A short markdown text: one line to type, and a preview below it when it uses markdown or math.
export function InlineField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={inputClass}
      />
      {/[*_`$\\[<~|]/.test(value) && (
        <p className="mt-1 px-1 text-sm text-muted">
          <Markdown inline>{value}</Markdown>
        </p>
      )}
    </div>
  );
}

// A list of short texts (accepted answers, wrong options, extra words) with add and remove buttons.
export function StringList({
  values,
  onChange,
  placeholder,
  addLabel,
  label,
  min = 0,
}: {
  values: readonly string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  addLabel: string;
  label: string;
  min?: number;
}) {
  return (
    <div className="space-y-2">
      {values.map((value, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
            placeholder={placeholder}
            aria-label={`${label} ${i + 1}`}
            className={inputClass}
          />
          <Button
            variant="ghost"
            className="px-2"
            aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
            disabled={values.length <= min}
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" className="text-primary" onClick={() => onChange([...values, ""])}>
        <Plus className="size-4" /> {addLabel}
      </Button>
    </div>
  );
}

export const pts = (n: number) => `${n} ${n === 1 ? "pt" : "pts"}`;

export const mono = `${inputClass} font-mono text-xs`;

// Hides floating-point noise like 50.230000000000004.
export const tidy = (n: number) => Number(n.toPrecision(12));
