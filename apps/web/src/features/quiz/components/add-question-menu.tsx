"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { questionTypeLabel } from "@/lib/format";
import { newBlankQuestion } from "@/components/question-kinds/blank/editor-model";
import { newQuestion } from "@/features/quiz/question-defaults";
import { QuestionTypeIcon, questionStyle } from "@/components/question-kinds/question-style";
import { questionTypesFor, subjectAreaLabel } from "@/lib/subjects";
import { questionTypes } from "@examinus/domain/question";
import type { Question, QuestionType } from "@examinus/domain/question";
import type { SubjectArea } from "@examinus/domain/roles";

type AddOption = { key: string; type: QuestionType; label: string; hint: string; make: () => Question };

const option = (type: QuestionType, hint: string): AddOption => ({ key: type, type, label: questionTypeLabel[type], hint, make: () => newQuestion(type) });

// Every entry the menu can offer, in sections: blank questions get one entry per way of answering.
const sections: { title: string; options: readonly AddOption[] }[] = [
  {
    title: "Choose",
    options: [
      option("multiple_choice", "One or more right choices"),
      option("true_false", "A statement to judge"),
      option("matching", "Pair the two columns"),
      option("categorization", "Sort items into groups"),
      option("ordering", "Put the steps in order"),
      option("hotspot", "Point at a spot on a picture"),
    ],
  },
  {
    title: "Write",
    options: [
      { key: "blank:fill", type: "blank", label: "Identification", hint: "One answer typed on a line", make: () => newBlankQuestion("fill") },
      {
        key: "blank:boxes",
        type: "blank",
        label: "Identification in boxes",
        hint: "One box per letter of the answer",
        make: () => newBlankQuestion("fill", undefined, "boxes"),
      },
      {
        key: "blank:inline",
        type: "blank",
        label: "Fill in the blank",
        hint: "Blanks inside the sentence",
        make: () => ({ ...newBlankQuestion("fill"), prompt: "A {{primary key|PK}} uniquely identifies each {{row|record}} in a table.", acceptedAnswers: [] }),
      },
      { key: "blank:cloze", type: "blank", label: "Cloze", hint: "A passage: typed, dropdown or word bank", make: () => newBlankQuestion("cloze") },
      option("enumeration", "List several answers"),
      option("numeric", "A number, with a tolerance"),
      option("essay", "Long answer, graded by you"),
    ],
  },
  {
    title: "Make",
    options: [option("drawing", "Draw, upload or take a photo"), option("code", "Run against test cases"), option("sql", "A query on your tables")],
  },
];

const menuWidth = 528;

// "Add question": a menu of the question types the quiz's subject offers, with a switch for all of them.
export function AddQuestionMenu({
  area,
  onAdd,
  label = "Add question",
  variant = "secondary",
  className,
  allTypes = false,
}: {
  area: SubjectArea;
  // Offers every question type from the start, for a place that isn't tied to one subject (the question bank).
  allTypes?: boolean;
  onAdd: (question: Question) => void;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(allTypes);
  // Where the open menu sits on screen, and the element it is rendered into.
  const [place, setPlace] = useState<{ top: number; left: number; up: boolean; host: Element } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const offered = new Set<QuestionType>(showAll ? questionTypes : questionTypesFor[area]);
  const shown = sections
    .map((s) => ({ ...s, options: s.options.filter((o) => offered.has(o.type)) }))
    .filter((s) => s.options.length > 0);

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
      const width = Math.min(menuWidth, window.innerWidth - 16);
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
          data-question-menu
          style={{ top: place.top, left: place.left }}
          className={clsx(
            "fixed z-[100] max-h-[min(28rem,calc(100dvh-1rem))] w-[min(33rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-lg",
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
          {shown.map((section) => (
            <section key={section.title} aria-label={section.title} className="mt-1">
              <h3 className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{section.title}</h3>
              <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                {section.options.map((o) => (
                  <li key={o.key}>
                    <button
                      type="button"
                      onClick={() => {
                        onAdd(o.make());
                        setOpen(false);
                      }}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className={clsx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-md", questionStyle[o.type].soft)}>
                        <QuestionTypeIcon type={o.type} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm">{o.label}</span>
                        <span className="block truncate text-xs text-muted">{o.hint}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
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
