"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

// An action, or a page to open (`href`).
export type MenuItem = {
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
} & ({ onSelect: () => void; href?: never } | { href: string; onSelect?: never });

const enabledItems = "[role=menuitem]:not(:disabled)";

// A "more actions" button that opens a short list of actions under it. Closes on a pick, Esc or a click outside;
// arrow keys move between the items.
export function Menu({
  label,
  items,
  trigger,
  align = "right",
}: {
  label: string;
  items: MenuItem[];
  trigger?: ReactNode;
  // Which edge of the button the list lines up with.
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(enabledItems)?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>("[aria-haspopup=menu]")?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const elements = [...(list.current?.querySelectorAll<HTMLElement>(enabledItems) ?? [])];
    const at = elements.indexOf(document.activeElement as HTMLElement);
    elements[(at + (e.key === "ArrowDown" ? 1 : -1) + elements.length) % elements.length]?.focus();
  }

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
      >
        {trigger ?? <MoreHorizontal className="size-4" aria-hidden />}
      </button>
      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          className={clsx(
            "absolute z-20 mt-1 min-w-48 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => {
            const look = clsx(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm disabled:opacity-50 focus-visible:outline-none",
              item.danger ? "text-danger hover:bg-danger-soft focus:bg-danger-soft" : "hover:bg-surface-muted focus:bg-surface-muted",
            );
            const content = (
              <>
                {item.icon && <item.icon className="size-4 shrink-0" aria-hidden />}
                {item.label}
              </>
            );
            return item.href !== undefined ? (
              <Link key={item.label} href={item.href} role="menuitem" className={look} onClick={() => setOpen(false)}>
                {content}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={look}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
