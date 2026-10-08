"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowUpToLine, ChevronDown, ChevronsDownUp, ChevronsUpDown, ListTree, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { QuestionTypeIcon } from "@/lib/question-style";
import { partTotals, plainText, roman, partName, type EditorPart } from "@/lib/quiz-editor";
import type { Question, SubjectArea } from "@examora/contract";
import { AddQuestionMenu } from "./add-question-menu";

export type TocTarget = { kind: "details" } | { kind: "part"; id: string } | { kind: "question"; id: string };

// The DOM ids the views give to what the contents list points at.
export const tocDomId = (t: TocTarget) =>
  t.kind === "details" ? "quiz-details" : t.kind === "part" ? `part-${t.id}` : `question-${t.id}`;

// The item being read: the last one whose top has scrolled up to the middle of the screen. The contents list highlights it.
function useActiveItem(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("\n");
  useEffect(() => {
    const list = key ? key.split("\n") : [];
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = list[0] ?? null;
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= window.innerHeight / 2) current = id;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [key]);
  return active;
}

// Quiz details, then each part with its questions: click one to jump to it.
function TocList({
  parts,
  problems,
  detailsProblem,
  area,
  active,
  onGo,
  onAddPart,
  onAddQuestion,
}: TocProps & { active: string | null }) {
  // Parts are accordions: open by default; the teacher folds the ones they aren't working on.
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const setPartOpen = (id: string, open: boolean) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });

  const item = (domId: string, target: TocTarget, className: string, content: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onGo(target)}
      aria-current={active === domId ? "location" : undefined}
      className={clsx(
        "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary",
        active === domId && "bg-primary-soft font-medium text-primary hover:bg-primary-soft",
        className,
      )}
    >
      {content}
    </button>
  );

  const dot = (message: string | undefined) =>
    message && (
      <span className="ml-auto shrink-0">
        <span aria-hidden className="block size-2 rounded-full bg-warning" title={message} />
        <span className="sr-only">Needs attention: {message}</span>
      </span>
    );

  return (
    <nav aria-label="Quiz contents" className="text-sm">
      <ul className="space-y-0.5">
        <li>
          {item(
            "quiz-details",
            { kind: "details" },
            "font-medium",
            <>
              Quiz details
              {dot(detailsProblem ? "the title or instructions need fixing" : undefined)}
            </>,
          )}
        </li>
        {parts.map((part, pi) => {
          const totals = partTotals(part);
          const before = parts.slice(0, pi).reduce((n, p) => n + p.questions.length, 0);
          const partActive = active === `part-${part.id}`;
          const open = !folded.has(part.id);
          const listId = `toc-part-${part.id}`;
          const issues = part.questions.filter((q) => problems.has(q.id)).length;
          return (
            <li key={part.id} className="mt-2 border-t border-border pt-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPartOpen(part.id, !open)}
                  aria-expanded={open}
                  aria-controls={listId}
                  aria-label={`${open ? "Fold" : "Unfold"} ${partName(part, pi)}`}
                  className="shrink-0 rounded-md p-1 text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <ChevronDown className={clsx("size-4 transition-transform", !open && "-rotate-90")} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPartOpen(part.id, true);
                    onGo({ kind: "part", id: part.id });
                  }}
                  aria-current={partActive ? "location" : undefined}
                  className={clsx(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left font-semibold hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary",
                    partActive && "bg-primary-soft text-primary hover:bg-primary-soft",
                  )}
                >
                  <span className="shrink-0 text-xs font-bold tabular-nums text-muted">{roman(pi + 1)}.</span>
                  <span className="min-w-0 flex-1 truncate">{partName(part, pi)}</span>
                  <span className="shrink-0 text-xs font-normal tabular-nums text-muted">
                    {totals.questionCount} q · {totals.totalPoints} pts
                  </span>
                  {/* A folded part still says when one of its questions needs attention. */}
                  {!open && dot(issues > 0 ? `${issues} ${issues === 1 ? "question needs" : "questions need"} fixing` : undefined)}
                </button>
              </div>
              {open && (
                <div id={listId}>
                  <ul className="mt-0.5 pl-6">
                    {part.questions.map((q: Question, qi) => {
                      const number = before + qi + 1;
                      const problem = problems.get(q.id);
                      return (
                        <li key={q.id}>
                          {item(
                            `question-${q.id}`,
                            { kind: "question", id: q.id },
                            "text-xs",
                            <>
                              <span className="w-5 shrink-0 text-right tabular-nums text-muted">{number}</span>
                              <QuestionTypeIcon type={q.type} />
                              <span className="min-w-0 flex-1 truncate">{plainText(q.prompt) || "No text yet"}</span>
                              {dot(problem && `question ${number} ${problem}`)}
                            </>,
                          )}
                        </li>
                      );
                    })}
                    {part.questions.length === 0 && <li className="px-2 py-1 text-xs text-muted">No questions yet</li>}
                  </ul>
                  <AddQuestionMenu
                    area={area}
                    variant="ghost"
                    className="ml-6 px-2 py-1 text-xs text-primary"
                    onAdd={(q) => onAddQuestion(part.id, q)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Button variant="ghost" className="mt-2 w-full justify-start text-primary" onClick={onAddPart}>
        <Plus className="size-4" aria-hidden /> Add part
      </Button>
    </nav>
  );
}

type TocProps = {
  parts: EditorPart[];
  problems: Map<string, string>;
  detailsProblem: boolean;
  // The quiz's subject area: decides the question types "Add question" offers.
  area: SubjectArea;
  onGo: (target: TocTarget) => void;
  onAddPart: () => void;
  onAddQuestion: (partId: string, question: Question) => void;
};

// Where the reader is, e.g. "Part II · Q4".
function locationLabel(parts: EditorPart[], active: string | null): string {
  if (!active || active === "quiz-details") return "Quiz details";
  let number = 0;
  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi]!;
    if (active === `part-${part.id}`) return `Part ${roman(pi + 1)}`;
    for (const q of part.questions) {
      number++;
      if (active === `question-${q.id}`) return `Part ${roman(pi + 1)} · Q${number}`;
    }
  }
  return "Quiz details";
}

// The floating action bar at the bottom of the screen: the contents (in a panel above the bar) and quick actions.
export function Toc({
  showExpand,
  onExpandAll,
  onCollapseAll,
  ...props
}: TocProps & { showExpand: boolean; onExpandAll: () => void; onCollapseAll: () => void }) {
  const { parts } = props;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const ids = ["quiz-details", ...parts.flatMap((p) => [`part-${p.id}`, ...p.questions.map((q) => `question-${q.id}`)])];
  const active = useActiveItem(ids);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element;
      // The "Add question" menu is drawn outside the bar, but belongs to it.
      if (root.current?.contains(target) || target.closest("[data-question-menu]")) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const bar = "shrink-0 px-2.5 py-1.5 text-sm";

  return (
    <div
      ref={root}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto relative flex max-w-full flex-col items-center">
        {open && (
          <div
            id={panelId}
            role="region"
            aria-label="Contents"
            className="absolute bottom-full mb-2 max-h-[min(34rem,calc(100dvh-8rem))] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-xl"
          >
            <TocList
              {...props}
              active={active}
              onGo={(t) => {
                close();
                props.onGo(t);
              }}
              onAddPart={() => {
                close();
                props.onAddPart();
              }}
              onAddQuestion={(partId, q) => {
                close();
                props.onAddQuestion(partId, q);
              }}
            />
          </div>
        )}
        <div
          role="toolbar"
          aria-label="Quiz actions"
          className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1.5 shadow-xl"
        >
          <Button
            ref={trigger}
            variant={open ? "primary" : "secondary"}
            className="shrink-0 rounded-full"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
          >
            <ListTree className="size-4" aria-hidden /> Contents
          </Button>
          <span
            aria-live="polite"
            className="hidden shrink-0 px-2 text-sm font-medium tabular-nums text-muted min-[430px]:inline"
            title="Where you are in the quiz"
          >
            {locationLabel(parts, active)}
          </span>
          <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
          <Button variant="ghost" className={clsx(bar, "rounded-full")} onClick={props.onAddPart} aria-label="Add part" title="Add part">
            <Plus className="size-4" aria-hidden />
            <span className="hidden sm:inline">Add part</span>
          </Button>
          {showExpand && (
            <>
              <Button variant="text" className={clsx(bar, "rounded-full")} onClick={onExpandAll} aria-label="Expand all" title="Expand all">
                <ChevronsUpDown className="size-4" aria-hidden />
                <span className="hidden md:inline">Expand all</span>
              </Button>
              <Button variant="text" className={clsx(bar, "rounded-full")} onClick={onCollapseAll} aria-label="Collapse all" title="Collapse all">
                <ChevronsDownUp className="size-4" aria-hidden />
                <span className="hidden md:inline">Collapse all</span>
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            className={clsx(bar, "rounded-full")}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Back to top"
            title="Back to top"
          >
            <ArrowUpToLine className="size-4" aria-hidden />
            <span className="hidden md:inline">Top</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
