"use client";

import clsx from "clsx";

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-surface-muted p-0.5 text-sm">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={clsx(
            "rounded-md px-3 py-1 font-medium",
            value === v ? "bg-surface shadow-sm" : "text-muted hover:text-foreground",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
