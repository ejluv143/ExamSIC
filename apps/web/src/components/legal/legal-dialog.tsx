"use client";

import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui";

// A link-styled button that opens a document in a floating card over the page. Esc, the close button or a
// click outside the card closes it.
export function LegalDialog({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Inside a checkbox's label: open the document without ticking the box.
          e.preventDefault();
          dialog.current?.showModal();
        }}
        className="font-medium text-primary underline-offset-2 hover:underline"
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        aria-label={title}
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
        className="m-auto w-[min(42rem,calc(100vw-2rem))] max-h-[min(85vh,52rem)] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex open:flex-col motion-safe:open:animate-[fade-in_0.18s_ease-out]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <footer className="flex justify-end border-t border-border px-6 py-3">
          <Button onClick={() => dialog.current?.close()}>Done</Button>
        </footer>
      </dialog>
    </>
  );
}
