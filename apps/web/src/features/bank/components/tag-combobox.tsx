"use client";

import { useId, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import clsx from "clsx";
import { inputBase } from "@/components/ui";

const GAP = 4;
const LIST_MAX = 224;

// A text field for a subject or topic that suggests the tags already in use and accepts a new one. Editable
// combobox with a list: arrows move through the suggestions, Enter or a click picks one, Esc closes the list.
// The list is in the top layer, so a dialog or a scrolling card never clips it. Give it a visible <label> through
// `id`, or an `aria-label`.
export function TagCombobox({
  value,
  onChange,
  options,
  id,
  placeholder,
  className,
  autoFocus,
  ...aria
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  id?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const needle = value.trim().toLowerCase();
  // Suggestions that contain what is typed; an exact match alone needs no list.
  const matches = options.filter((o) => o.toLowerCase().includes(needle) && o.toLowerCase() !== needle);
  const showing = open && matches.length > 0;

  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    if (!showing) {
      if (el.matches(":popover-open")) el.hidePopover();
      return;
    }
    const position = () => {
      const r = input.current!.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - GAP * 2;
      const above = r.top - GAP * 2;
      const height = Math.min(el.scrollHeight, LIST_MAX);
      const up = below < height && above > below;
      const maxHeight = Math.min(LIST_MAX, up ? above : below);
      setPlace({ top: up ? r.top - GAP - Math.min(height, maxHeight) : r.bottom + GAP, left: r.left, width: r.width, maxHeight });
    };
    if (!el.matches(":popover-open")) el.showPopover();
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [showing, matches.length]);

  function pick(i: number) {
    const option = matches[i];
    if (option !== undefined) onChange(option);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (matches.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a < 0 ? (step === 1 ? 0 : matches.length - 1) : (a + step + matches.length) % matches.length));
    } else if (e.key === "Enter" && showing && active >= 0) {
      // Picks the suggestion instead of submitting the form around the field.
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape" && showing) {
      // Closes the list, not the dialog around it.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  const activeId = showing && active >= 0 ? `${listId}-${active}` : undefined;
  return (
    <>
      <input
        ref={input}
        id={id}
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-label={aria["aria-label"]}
        aria-describedby={aria["aria-describedby"]}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={clsx(inputBase, "w-full", className)}
      />
      <ul
        ref={list}
        id={listId}
        popover="manual"
        role="listbox"
        aria-label={aria["aria-label"] ?? "Suggestions"}
        // Keeps focus in the field, so a click on a suggestion doesn't blur (and close) the list first.
        onMouseDown={(e) => e.preventDefault()}
        style={place ? { top: place.top, left: place.left, width: place.width, maxHeight: place.maxHeight } : undefined}
        className="fixed inset-auto m-0 overflow-y-auto rounded-xl border border-border bg-surface p-1 text-sm text-foreground shadow-lg"
      >
        {matches.map((option, i) => (
          <li
            key={option}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            onPointerMove={() => setActive(i)}
            onClick={() => pick(i)}
            className={clsx("cursor-default truncate rounded-lg px-3 py-2 select-none", i === active && "bg-surface-muted")}
          >
            {option}
          </li>
        ))}
      </ul>
    </>
  );
}

// A labelled tag field. The label is tied to the input by `htmlFor` (not by wrapping it), so the open list of
// suggestions is not part of the field's name.
export function TagField({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & Omit<ComponentProps<typeof TagCombobox>, "id" | "aria-label" | "aria-describedby">) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <TagCombobox id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
