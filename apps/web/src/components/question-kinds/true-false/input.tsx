"use client";

import clsx from "clsx";
import type { InputProps } from "../views/input";

export function Input({ value, onChange, tap }: InputProps<"true_false">) {
  if (tap)
    return (
      <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-3">
        {[true, false].map((v, i) => (
          <button
            key={String(v)}
            type="button"
            disabled={tap.disabled}
            onClick={() => {
              onChange(v);
              tap.submit(v);
            }}
            className={clsx(
              "animate-pop-in min-h-20 rounded-xl text-2xl font-bold transition-transform active:scale-95 disabled:opacity-50 sm:text-3xl",
              tap.styles[i],
              value === v && "ring-4 ring-foreground",
            )}
            style={{ animationDelay: `${0.15 + i * 0.07}s` }}
          >
            {v ? "True" : "False"}
          </button>
        ))}
      </div>
    );
  return (
        <div className="grid grid-cols-2 gap-2">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={value === v}
              onClick={() => onChange(v)}
              className={clsx(
                "rounded-lg border px-4 py-2.5 text-sm font-medium",
                value === v ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-surface-muted",
              )}
            >
              {v ? "True" : "False"}
            </button>
          ))}
        </div>
  );
}
