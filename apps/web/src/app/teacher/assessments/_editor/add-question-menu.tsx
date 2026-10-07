"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { blankModeLabel, questionTypeLabel } from "@/lib/format";
import { newBlankQuestion, newQuestion } from "@/lib/question-defaults";
import { questionTypesFor, subjectAreaLabel } from "@/lib/subjects";
import { blankModes, questionTypes } from "@examora/contract";
import type { Question, QuestionType, SubjectArea } from "@examora/contract";

type AddOption = { key: string; label: string; make: () => Question };

// What the menu offers: blank questions get one entry per mode.
const addOptions = (types: readonly QuestionType[]): AddOption[] =>
  types.flatMap((type): AddOption[] =>
    type === "blank"
      ? blankModes.map((mode) => ({ key: `blank:${mode}`, label: blankModeLabel[mode], make: () => newBlankQuestion(mode) }))
      : [{ key: type, label: questionTypeLabel[type], make: () => newQuestion(type) }],
  );

// "Add question": a menu of the question types the quiz's subject offers, with a switch for all of them.
export function AddQuestionMenu({
  area,
  onAdd,
  label = "Add question",
  variant = "secondary",
  className,
}: {
  area: SubjectArea;
  onAdd: (question: Question) => void;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Where the open menu sits on screen, and the element it is rendered into.
  const [place, setPlace] = useState<{ top: number; left: number; up: boolean; host: Element } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const options = addOptions(showAll ? questionTypes : questionTypesFor[area]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    // The menu is fixed to the screen, so it follows the button when anything scrolls or the window resizes.
    const position = () => {
      const r = button.current?.getBoundingClientRect();
      if (!r) return;
      const width = 256;
      const up = window.innerHeight - r.bottom < 320 && r.top > window.innerHeight - r.bottom;
      setPlace({
        top: up ? r.top - 4 : r.bottom + 4,
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
        up,
        // Outside the editor's boxes, so no scrolling panel clips it and nothing paints over it. Inside a modal
        // dialog it must stay in the dialog, which sits above everything else on the page.
        host: root.current?.closest("dialog") ?? document.body,
      });
    };
    position();
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
      // So reopening never flashes the menu where it last was.
      setPlace(null);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <Button
        ref={button}
        variant={variant}
        className={className}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Plus className="size-4" aria-hidden /> {label}
      </Button>
      {open && place && createPortal(
        <div
          ref={menu}
          style={{ top: place.top, left: place.left }}
          className={clsx(
            "fixed z-[100] max-h-[min(24rem,calc(100dvh-1rem))] w-64 overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-lg",
            place.up && "-translate-y-full",
          )}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              button.current?.focus();
            }
          }}
        >
          <p className="px-2 pb-1 text-xs text-muted">
            {showAll ? "All question types" : `${subjectAreaLabel[area]} question types`}
          </p>
          <ul>
            {options.map((option) => (
              <li key={option.key}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(option.make());
                    setOpen(false);
                  }}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="mt-1 w-full border-t border-border px-2 pt-2 text-left text-xs text-muted underline hover:text-foreground"
          >
            {showAll ? `Only ${subjectAreaLabel[area]} types` : "Show all question types"}
          </button>
        </div>,
        place.host,
      )}
    </div>
  );
}
