"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronsLeft, ChevronsRight, ListTree, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { questionTypeLabel } from "@/lib/format";
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
  onGo,
  onAddPart,
  onAddQuestion,
}: TocProps) {
  const ids = ["quiz-details", ...parts.flatMap((p) => [`part-${p.id}`, ...p.questions.map((q) => `question-${q.id}`)])];
  const active = useActiveItem(ids);
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
                              <span className="shrink-0 rounded bg-surface-muted px-1 text-[10px] uppercase tracking-wide text-muted">
                                {questionTypeLabel[q.type].slice(0, 4)}
                              </span>
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

// The contents panel: sticky beside the editor on wide screens (it can fold away), a drawer on small ones.
export function Toc({ defaultFolded = false, ...props }: TocProps & { defaultFolded?: boolean }) {
  const [folded, setFolded] = useState(defaultFolded);
  const [drawer, setDrawer] = useState(false);
  return (
    <>
      {/* self-stretch: the aside runs the editor's full height, so its panel can stay in view while it scrolls. */}
      <aside
        className={clsx("hidden shrink-0 self-stretch lg:block", folded ? "w-10" : "w-72")}
        aria-label="Contents"
      >
        <div className="sticky top-16 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border border-border bg-surface p-2">
          <div className={clsx("mb-1 flex items-center", folded ? "justify-center" : "justify-between px-2")}>
            {!folded && <p className="text-xs font-semibold tracking-wide text-muted uppercase">Contents</p>}
            <button
              type="button"
              onClick={() => setFolded(!folded)}
              aria-expanded={!folded}
              aria-label={folded ? "Show contents" : "Hide contents"}
              className="rounded-md p-1 text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              {folded ? <ChevronsRight className="size-4" aria-hidden /> : <ChevronsLeft className="size-4" aria-hidden />}
            </button>
          </div>
          {!folded && <TocList {...props} />}
        </div>
      </aside>
      <div className="lg:hidden">
        <Button variant="secondary" onClick={() => setDrawer(true)} aria-haspopup="dialog">
          <ListTree className="size-4" aria-hidden /> Contents
        </Button>
        <Dialog open={drawer} onClose={() => setDrawer(false)} title="Contents" drawer>
          <TocList
            {...props}
            onGo={(t) => {
              setDrawer(false);
              props.onGo(t);
            }}
            onAddPart={() => {
              setDrawer(false);
              props.onAddPart();
            }}
            onAddQuestion={(partId, q) => {
              setDrawer(false);
              props.onAddQuestion(partId, q);
            }}
          />
        </Dialog>
      </div>
    </>
  );
}
