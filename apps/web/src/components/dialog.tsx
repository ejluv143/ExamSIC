"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import clsx from "clsx";
import { X } from "lucide-react";

// A modal on the browser's own <dialog>: it traps focus, closes on Esc, hands focus back to what opened it, and
// is named by its title. `drawer` slides it in from the left edge instead of centring it. Its content is only
// rendered while it is open, so a form inside starts fresh every time.
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  drawer = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={clsx(
        "bg-surface text-foreground shadow-xl backdrop:bg-black/40",
        drawer
          ? "m-0 h-dvh max-h-dvh w-80 max-w-[90vw] rounded-r-xl"
          : clsx(
              "m-auto max-h-[90dvh] w-[calc(100vw-2rem)] rounded-xl border border-border",
              size === "md" && "max-w-xl",
              size === "lg" && "max-w-3xl",
              size === "xl" && "max-w-6xl",
            ),
      )}
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col" style={{ maxHeight: drawer ? "100dvh" : "90dvh" }}>
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
