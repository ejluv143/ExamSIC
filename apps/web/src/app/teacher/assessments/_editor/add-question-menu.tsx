"use client";

import { useEffect, useRef, useState } from "react";
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
  const root = useRef<HTMLDivElement>(null);
  const options = addOptions(showAll ? questionTypes : questionTypesFor[area]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
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
        variant={variant}
        className={className}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Plus className="size-4" aria-hidden /> {label}
      </Button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 w-64 rounded-xl border border-border bg-surface p-2 shadow-lg">
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
        </div>
      )}
    </div>
  );
}
