"use client";

import clsx from "clsx";
import { AssetImage } from "@/components/asset-image";
import { Markdown } from "@/components/markdown";
import type { InputProps } from "../views/input";

const letter = (i: number) => String.fromCharCode(65 + i);

export function Input({ q, value: answer, onChange, assetUrls, tap }: InputProps<"multiple_choice">) {
  const value = Array.isArray(answer) || typeof answer === "string" ? answer : undefined;
  if (tap)
    return (
      <div className="grid flex-1 auto-rows-fr gap-3 sm:grid-cols-2">
        {q.choices.map((c, i) => (
          <button
            key={c.id}
            type="button"
            disabled={tap.disabled}
            onClick={() => {
              onChange(c.id);
              tap.submit(c.id);
            }}
            className={clsx(
              "animate-pop-in min-h-16 rounded-xl px-5 py-4 text-left text-lg font-semibold transition-transform active:scale-95 disabled:opacity-50 sm:text-xl",
              tap.styles[i % tap.styles.length],
              value === c.id && "ring-4 ring-foreground",
            )}
            style={{ animationDelay: `${0.15 + i * 0.07}s` }}
          >
            <Markdown inline assetUrls={assetUrls}>
              {c.text || "(image)"}
            </Markdown>
          </button>
        ))}
      </div>
    );
  const picked = q.multipleCorrect ? (Array.isArray(value) ? value : []) : [typeof value === "string" ? value : ""];
  // Choices with pictures are cards in a grid; plain ones stay a list.
  const cards = q.choices.some((c) => c.imageId);
  return (
    <div>
      {q.multipleCorrect && <p className="mb-2 text-xs text-muted">Select all that apply.</p>}
      <div
        className={cards ? "grid grid-cols-1 gap-3 @md:grid-cols-2" : "space-y-2"}
        role={q.multipleCorrect ? "group" : "radiogroup"}
      >
        {q.choices.map((c, i) => {
          const checked = picked.includes(c.id);
          return (
            <label
              key={c.id}
              className={clsx(
                "flex cursor-pointer gap-3 rounded-lg border text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
                cards ? "flex-col p-3" : "items-center px-3 py-2.5",
                checked ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-muted",
              )}
            >
              {c.imageId && <AssetImage id={c.imageId} alt={c.alt ?? ""} assetUrls={assetUrls} className="max-h-48 w-full object-contain" />}
              <span className="flex min-w-0 items-center gap-3">
                <input
                  type={q.multipleCorrect ? "checkbox" : "radio"}
                  name={q.id}
                  checked={checked}
                  onChange={() =>
                    onChange(
                      q.multipleCorrect ? (checked ? picked.filter((x) => x !== c.id) : [...picked, c.id]) : c.id,
                    )
                  }
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="font-medium text-muted">{letter(i)}.</span>
                <Markdown inline className="min-w-0" assetUrls={assetUrls}>
                  {c.text}
                </Markdown>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
