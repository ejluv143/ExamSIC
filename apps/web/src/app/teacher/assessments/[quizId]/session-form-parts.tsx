"use client";

import clsx from "clsx";
import { Lock } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

// One numbered step of the session form: an icon, a heading and what it decides.
export function Section({
  number,
  icon,
  title,
  description,
  children,
}: {
  number: number;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const id = `session-section-${number}`;
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-surface">
      <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <h3 id={id} className="text-sm font-semibold">
            <span className="mr-1.5 text-muted">{number}.</span>
            {title}
          </h3>
          <p className="text-xs text-muted">{description}</p>
        </div>
      </header>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  );
}

// Arrow keys move through a radio group and select as they go, like native radio buttons.
function moveInGroup<T extends string>(
  e: KeyboardEvent<HTMLElement>,
  options: readonly { value: T; disabled?: boolean }[],
  current: T,
  pick: (value: T) => void,
) {
  const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
  if (step === 0) return;
  e.preventDefault();
  const from = options.findIndex((o) => o.value === current);
  for (let i = 1; i <= options.length; i++) {
    const index = (from + step * i + options.length * i) % options.length;
    const next = options[index]!;
    if (next.disabled) continue;
    pick(next.value);
    const group = e.currentTarget.parentElement;
    requestAnimationFrame(() => group?.querySelectorAll<HTMLElement>('[role="radio"]')[index]?.focus());
    return;
  }
}

export type CardOption<T extends string> = {
  value: T;
  label: string;
  description: string;
  icon: ReactNode;
};

// A choice made by clicking a big card with an icon (radio group semantics: one tab stop, arrow keys move).
export function RadioCards<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly CardOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => moveInGroup(e, options, value, onChange)}
            className={clsx(
              "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              selected
                ? "border-primary bg-primary-soft ring-1 ring-primary"
                : "border-border bg-surface hover:bg-surface-muted",
            )}
          >
            <span
              className={clsx(
                "grid size-9 place-items-center rounded-lg",
                selected ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted",
              )}
              aria-hidden
            >
              {o.icon}
            </span>
            <span className="text-sm font-semibold">{o.label}</span>
            <span className="text-xs text-muted">{o.description}</span>
          </button>
        );
      })}
    </div>
  );
}

export type ChipOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

// A short choice as chips (radio group semantics). `locked` shows a lock: the value is fixed by the session's type.
export function ChipGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  locked,
}: {
  label: string;
  value: T;
  options: readonly ChipOption<T>[];
  onChange: (value: T) => void;
  locked?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        const off = o.disabled || locked;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={off}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => moveInGroup(e, options, value, onChange)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60",
              selected
                ? "border-primary bg-primary-soft font-medium text-primary"
                : "border-border bg-surface hover:bg-surface-muted",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
      {locked && <Lock className="size-3.5 text-muted" aria-label="Fixed for this type" />}
    </div>
  );
}
