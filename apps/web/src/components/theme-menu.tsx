"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Laptop, Moon, Palette, Sun, type LucideIcon } from "lucide-react";
import {
  accentLabels,
  accents,
  readAccent,
  readThemeMode,
  setAccent,
  setThemeMode,
  type Accent,
  type ThemeMode,
} from "@/lib/theme";

const modeOptions: { mode: ThemeMode; label: string; icon: LucideIcon }[] = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "system", label: "System", icon: Laptop },
];

// The swatch of each accent, in its light shade (the colours live in globals.css).
const swatch: Record<Accent, string> = {
  blue: "#2563eb",
  violet: "#5b3df5",
  emerald: "#047857",
  rose: "#e11d48",
  amber: "#b45309",
};

// "Appearance": light, dark or the system's mode, and the accent colour. Saved in this browser. In the sidebar it is a
// labelled row opening upward; in the landing page's header, an icon button opening downward.
export function ThemeMenu({ placement = "sidebar" }: { placement?: "sidebar" | "header" }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ThemeMode>("system");
  const [accent, setAccentState] = useState<Accent>("blue");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    // The saved choices are read when the menu opens; the boot script already applied them.
    setMode(readThemeMode());
    setAccentState(readAccent());
    setOpen((o) => !o);
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Appearance"
        className={clsx(
          "flex items-center focus-visible:outline-2 focus-visible:outline-primary",
          placement === "header"
            ? "size-9 justify-center rounded-lg border border-border text-muted hover:bg-surface-muted hover:text-foreground"
            : "w-full gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-muted hover:text-foreground rail:justify-center rail:px-0",
        )}
      >
        <Palette className="size-4 shrink-0" aria-hidden />
        <span className={placement === "header" ? "sr-only" : "rail:sr-only"}>Appearance</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Appearance"
          className={clsx(
            "absolute z-40 w-64 rounded-xl border border-border bg-surface p-3 shadow-xl",
            placement === "header"
              ? "top-full right-0 mt-2"
              : "bottom-full left-0 mb-2 rail:bottom-0 rail:left-full rail:mb-0 rail:ml-2",
          )}
        >
          <p className="mb-1.5 text-xs font-semibold text-muted uppercase">Mode</p>
          <div role="radiogroup" aria-label="Mode" className="grid grid-cols-3 gap-1 rounded-lg bg-surface-muted p-1">
            {modeOptions.map(({ mode: m, label, icon: Icon }) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => {
                  setThemeMode(m);
                  setMode(m);
                }}
                className={clsx(
                  "flex flex-col items-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                  mode === m ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-3 mb-1.5 text-xs font-semibold text-muted uppercase">Accent</p>
          <div role="radiogroup" aria-label="Accent" className="flex gap-2">
            {accents.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={accent === a}
                aria-label={accentLabels[a]}
                title={accentLabels[a]}
                onClick={() => {
                  setAccent(a);
                  setAccentState(a);
                }}
                className="grid size-8 place-items-center rounded-full text-white ring-offset-2 ring-offset-surface focus-visible:outline-2 focus-visible:outline-primary aria-checked:ring-2 aria-checked:ring-foreground/40"
                style={{ backgroundColor: swatch[a] }}
              >
                {accent === a && <Check className="size-4" aria-hidden />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
