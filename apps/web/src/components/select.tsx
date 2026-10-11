"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption<T extends string = string> = {
  value: T;
  label: ReactNode;
  // A second, muted line under the label.
  description?: ReactNode;
  disabled?: boolean;
  // Options with the same group are listed under its name; keep them next to each other.
  group?: string;
  // What type-ahead matches when the label isn't plain text.
  textValue?: string;
};

type Size = "md" | "sm" | "xs";
const sizes: Record<Size, string> = { md: "px-3 py-2", sm: "px-2.5 py-1.5", xs: "px-2 py-1" };

// How a pick was made, for callers that treat a click as the whole edit but wait for Enter after arrow keys.
export type SelectSource = "pointer" | "keyboard";

type Props<T extends string> = {
  options: readonly SelectOption<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T, source: SelectSource) => void;
  // Shown, muted, while the value matches no option (usually "").
  placeholder?: string;
  // Submits the value with a form; with `required`, an empty value blocks the submit like a native select.
  name?: string;
  required?: boolean;
  disabled?: boolean;
  size?: Size;
  // Sizes the control (w-full, w-36, max-w-44…).
  className?: string;
  // Extra classes for the button itself (text size, border colour…).
  triggerClassName?: string;
} & Omit<ComponentProps<"button">, "value" | "defaultValue" | "onChange" | "className" | "children" | "type" | "disabled">;

const LIST_MAX = 288;
const GAP = 4;

// The project's dropdown, in place of <select>: a button showing the choice, and a list in the top layer (so a
// dialog or a scrolling card never clips it). Keyboard as a select-only combobox: arrows, Home/End, type-ahead,
// Enter or Space to pick, Esc or Tab to close.
export function Select<T extends string>({
  options,
  value: controlled,
  defaultValue,
  onChange,
  placeholder,
  name,
  required,
  disabled,
  size = "md",
  className,
  triggerClassName,
  onKeyDown,
  ...buttonProps
}: Props<T>) {
  const [uncontrolled, setUncontrolled] = useState<T | undefined>(defaultValue);
  const value = controlled ?? uncontrolled;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const id = useId();
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  function step(from: number, by: 1 | -1) {
    for (let i = from + by; i >= 0 && i < options.length; i += by) if (!options[i]!.disabled) return i;
    return from;
  }
  const first = () => step(-1, 1);
  const last = () => step(options.length, -1);

  function show() {
    if (disabled) return;
    setActive(selectedIndex >= 0 && !options[selectedIndex]!.disabled ? selectedIndex : first());
    setOpen(true);
  }
  function choose(i: number, source: SelectSource) {
    const option = options[i];
    setOpen(false);
    if (!option || option.disabled) return;
    if (controlled === undefined) setUncontrolled(option.value);
    if (option.value !== value) onChange?.(option.value, source);
  }

  // Into the top layer, under the button, or above it when there's more room there.
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    if (!open) {
      if (el.matches(":popover-open")) el.hidePopover();
      return;
    }
    const position = () => {
      const r = trigger.current!.getBoundingClientRect();
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) list.current?.children.namedItem(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  function typeAhead(key: string) {
    const now = Date.now();
    typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : "") + key.toLowerCase(), at: now };
    const from = open ? active : selectedIndex;
    const start = Math.max(0, from + (typed.current.text.length > 1 ? 0 : 1));
    const order = options.map((_, k) => (start + k) % options.length);
    return order.find((k) => {
      const o = options[k]!;
      return !o.disabled && (o.textValue ?? (typeof o.label === "string" ? o.label : o.value)).toLowerCase().startsWith(typed.current.text);
    });
  }

  function handleKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        show();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const match = typeAhead(e.key);
        if (match !== undefined) {
          e.preventDefault();
          setActive(match);
          setOpen(true);
        }
      }
      return;
    }
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((a) => step(a, 1)),
      ArrowUp: () => setActive((a) => step(a, -1)),
      Home: () => setActive(first()),
      End: () => setActive(last()),
      PageDown: () => setActive((a) => Math.min(last(), step(a + 9, 1))),
      PageUp: () => setActive((a) => Math.max(first(), step(a - 9, -1))),
      Enter: () => choose(active, "keyboard"),
      " ": () => choose(active, "keyboard"),
      Escape: () => setOpen(false),
    };
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    const run = keys[e.key];
    if (run) {
      // Also keeps Esc from closing a dialog around the dropdown.
      e.preventDefault();
      e.stopPropagation();
      run();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const match = typeAhead(e.key);
      if (match !== undefined) setActive(match);
    }
  }

  return (
    <div ref={root} className={clsx("relative inline-block align-middle", className)}>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        aria-required={required || undefined}
        disabled={disabled}
        {...buttonProps}
        onClick={(e) => {
          buttonProps.onClick?.(e);
          if (e.defaultPrevented) return;
          if (open) setOpen(false);
          else show();
        }}
        // Open, the list takes its keys first; closed, the caller's handler goes first and can preventDefault.
        onKeyDown={(e) => {
          if (open) {
            handleKey(e);
            if (!e.defaultPrevented) onKeyDown?.(e);
            return;
          }
          onKeyDown?.(e);
          if (!e.defaultPrevented) handleKey(e);
        }}
        className={clsx(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface text-left text-sm transition-colors",
          "hover:border-muted/60 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
          open && "border-primary ring-2 ring-primary/20",
          sizes[size],
          triggerClassName,
        )}
      >
        <span className={clsx("min-w-0 truncate", !selected && "text-muted")}>{selected ? selected.label : (placeholder ?? "\u00a0")}</span>
        <ChevronDown className={clsx("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {name !== undefined && (
        // A real input, so the form submits the value and `required` blocks an empty one; focus goes to the button.
        <input
          tabIndex={-1}
          aria-hidden
          name={name}
          value={value ?? ""}
          required={required}
          disabled={disabled}
          onChange={() => {}}
          onFocus={() => trigger.current?.focus()}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full opacity-0"
        />
      )}
      <div
        ref={list}
        id={`${id}-list`}
        popover="manual"
        role="listbox"
        aria-label={buttonProps["aria-label"]}
        // Keeps focus on the button, and stops a click inside a <label> from re-opening the list through it.
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => e.preventDefault()}
        style={place ? { top: place.top, left: place.left, minWidth: place.width, maxHeight: place.maxHeight } : undefined}
        className="fixed inset-auto m-0 max-w-[min(24rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-border bg-surface p-1 text-sm text-foreground shadow-lg"
      >
        {options.map((o, i) => (
          <OptionRow
            key={`${o.value}-${i}`}
            id={`${id}-${i}`}
            option={o}
            heading={o.group !== undefined && o.group !== options[i - 1]?.group ? o.group : undefined}
            selected={i === selectedIndex}
            active={i === active}
            onHover={() => !o.disabled && setActive(i)}
            onPick={() => choose(i, "pointer")}
          />
        ))}
      </div>
    </div>
  );
}

function OptionRow<T extends string>({
  id,
  option,
  heading,
  selected,
  active,
  onHover,
  onPick,
}: {
  id: string;
  option: SelectOption<T>;
  heading?: string;
  selected: boolean;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  return (
    <>
      {heading && (
        <div role="presentation" className="px-3 pt-2.5 pb-1 text-xs font-semibold tracking-wide text-muted uppercase first:pt-1.5">
          {heading}
        </div>
      )}
      <div
        id={id}
        role="option"
        aria-selected={selected}
        aria-disabled={option.disabled || undefined}
        onPointerMove={onHover}
        onClick={option.disabled ? undefined : onPick}
        className={clsx(
          "flex cursor-default items-start gap-2 rounded-lg px-3 py-2 select-none",
          option.disabled ? "opacity-50" : active && "bg-surface-muted",
          selected && "font-medium text-primary",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block">{option.label}</span>
          {option.description && <span className="block text-xs font-normal text-muted">{option.description}</span>}
        </span>
        <Check className={clsx("mt-0.5 size-4 shrink-0", !selected && "invisible")} aria-hidden />
      </div>
    </>
  );
}
