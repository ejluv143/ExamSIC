"use client";

import { useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowLeft, Check, Flag, Lock, X } from "lucide-react";
import { Markdown } from "./markdown";
import { Button, Card } from "./ui";

// One question of the paper as the overview and the review screen show it.
export type NavItem = {
  questionId: string;
  // 1-based.
  number: number;
  answered: boolean;
  marked: boolean;
  // Its time ran out (one question at a time): it can't be opened again.
  closed: boolean;
  current: boolean;
  summary: string | null;
  // Why the student can't open it from here (one question at a time), or null.
  blocked: string | null;
};

// "12 answered · 3 marked · 5 left"
export function countsText(items: readonly NavItem[], marking: boolean): string {
  const answered = items.filter((i) => i.answered).length;
  return [
    `${answered} answered`,
    marking && `${items.filter((i) => i.marked).length} marked`,
    `${items.length - answered} left`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function tileLabel(item: NavItem): string {
  return [
    `Question ${item.number}`,
    item.closed ? "time ran out" : item.answered ? "answered" : "not answered",
    item.marked && "marked for review",
    item.current && "you're on it",
  ]
    .filter(Boolean)
    .join(", ");
}

// Every question as a numbered tile: answered, not answered, marked for review, the one the student is on.
export function QuestionOverview({
  items,
  marking,
  onOpen,
  onReview,
}: {
  items: readonly NavItem[];
  // Marking for review is on for this session.
  marking: boolean;
  onOpen: (item: NavItem) => void;
  onReview: () => void;
}) {
  const anyClosed = items.some((i) => i.closed);
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium tabular-nums" aria-live="polite">
        {countsText(items, marking)}
      </p>
      <ol className="grid grid-cols-6 gap-1.5" aria-label="Questions">
        {items.map((item) => (
          <li key={item.questionId}>
            <button
              type="button"
              aria-label={tileLabel(item)}
              title={item.blocked ?? tileLabel(item)}
              aria-current={item.current ? "step" : undefined}
              aria-disabled={item.blocked !== null || undefined}
              onClick={() => onOpen(item)}
              className={clsx(
                "relative grid aspect-square w-full place-items-center rounded-md border text-sm font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                item.closed
                  ? "border-border bg-surface-muted text-muted"
                  : item.answered
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-dashed border-muted/60 bg-surface hover:bg-surface-muted",
                item.marked && "border-warning",
                item.current && "ring-2 ring-primary ring-offset-1 ring-offset-surface",
                item.blocked !== null && "cursor-not-allowed opacity-50",
              )}
            >
              {item.number}
              {item.marked && (
                <Flag className="absolute -top-1.5 -right-1.5 size-3.5 fill-warning text-warning" aria-hidden />
              )}
              {item.closed ? (
                <Lock className="absolute right-0.5 bottom-0.5 size-2.5" aria-hidden />
              ) : (
                item.answered && <Check className="absolute right-0.5 bottom-0.5 size-2.5" aria-hidden />
              )}
            </button>
          </li>
        ))}
      </ol>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Legend">
        <li className="inline-flex items-center gap-1">
          <Check className="size-3 text-primary" aria-hidden /> Answered
        </li>
        <li className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm border border-dashed border-muted" aria-hidden /> Not answered
        </li>
        {marking && (
          <li className="inline-flex items-center gap-1">
            <Flag className="size-3 fill-warning text-warning" aria-hidden /> Marked
          </li>
        )}
        {items.some((i) => i.current) && (
          <li className="inline-flex items-center gap-1">
            <span className="size-3 rounded-sm ring-2 ring-primary" aria-hidden /> You&apos;re here
          </li>
        )}
        {anyClosed && (
          <li className="inline-flex items-center gap-1">
            <Lock className="size-3" aria-hidden /> Time ran out
          </li>
        )}
      </ul>
      <Button variant="secondary" className="w-full" onClick={onReview}>
        Review answers
      </Button>
    </div>
  );
}

// The paper with its overview: a side panel that can be hidden on wide screens, a sheet (`sheetOpen`) on phones.
export function NavigatorLayout({
  overview,
  panelOpen,
  sheetOpen,
  onCloseSheet,
  children,
}: {
  overview: ReactNode;
  panelOpen: boolean;
  sheetOpen: boolean;
  onCloseSheet: () => void;
  children: ReactNode;
}) {
  return (
    <div className={clsx("mx-auto", panelOpen ? "max-w-2xl @5xl:max-w-240" : "max-w-2xl")}>
      <div className="@5xl:flex @5xl:items-start @5xl:gap-6">
        <div className="min-w-0 flex-1">{children}</div>
        {panelOpen && (
          <aside aria-label="All questions" className="sticky top-4 hidden w-60 shrink-0 @5xl:block">
            <Card className="p-4">{overview}</Card>
          </aside>
        )}
      </div>
      {sheetOpen && <OverviewSheet onClose={onCloseSheet}>{overview}</OverviewSheet>}
    </div>
  );
}

// The overview on a phone: a sheet from the bottom of the screen.
function OverviewSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="overview-title"
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="overview-title" className="font-semibold">
            All questions
          </h2>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-surface-muted"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// The "Mark for review" switch on a question.
export function MarkToggle({ marked, busy, onToggle }: { marked: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={marked}
      disabled={busy}
      onClick={onToggle}
      className={clsx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50",
        marked ? "border-warning bg-warning-soft text-warning" : "border-border text-muted hover:bg-surface-muted",
      )}
    >
      <Flag className={clsx("size-3.5", marked && "fill-current")} aria-hidden />
      {marked ? "Marked for review" : "Mark for review"}
    </button>
  );
}

// Before submitting: every question with its answer in a few words, the marked ones first.
export function ReviewScreen({
  items,
  marking,
  notice,
  onOpen,
  onBack,
  children,
}: {
  items: readonly NavItem[];
  marking: boolean;
  // Why the last "go to" didn't work.
  notice: string | null;
  onOpen: (item: NavItem) => void;
  onBack: () => void;
  // The submit button and its error.
  children: ReactNode;
}) {
  const marked = items.filter((i) => i.marked);
  const others = items.filter((i) => !i.marked);
  const list = (rows: readonly NavItem[]) => (
    <ul className="space-y-2">
      {rows.map((item) => (
        <li
          key={item.questionId}
          className={clsx(
            "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
            item.marked ? "border-warning bg-warning-soft" : "border-border",
          )}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-muted font-semibold tabular-nums">
            {item.number}
          </span>
          <span className="min-w-0 flex-1">
            {item.marked && (
              <span className="mr-1.5 inline-flex items-center gap-1 text-xs font-medium text-warning">
                <Flag className="size-3 fill-current" aria-hidden /> Marked
              </span>
            )}
            {item.summary !== null ? (
              <Markdown inline className="break-words">
                {item.summary}
              </Markdown>
            ) : (
              <span className="text-muted italic">Not answered</span>
            )}
            {item.closed && <span className="ml-1.5 text-xs text-muted">· Time ran out</span>}
          </span>
          {!item.current && !item.closed && (
            <Button
              variant="text"
              className={clsx("shrink-0", item.blocked !== null && "cursor-not-allowed opacity-50")}
              aria-disabled={item.blocked !== null || undefined}
              title={item.blocked ?? undefined}
              onClick={() => onOpen(item)}
            >
              Go to {item.number}
              <span className="sr-only">{item.blocked ? ` (${item.blocked})` : ""}</span>
            </Button>
          )}
          {item.current && <span className="shrink-0 text-xs text-muted">You&apos;re here</span>}
        </li>
      ))}
    </ul>
  );
  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Review your answers</h2>
          <p className="text-sm text-muted tabular-nums">{countsText(items, marking)}</p>
        </div>
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden /> Back to the questions
        </Button>
      </div>
      {notice && (
        <p role="alert" className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
          {notice}
        </p>
      )}
      {marking && (
        <section aria-labelledby="review-marked" className="space-y-2">
          <h3 id="review-marked" className="flex items-center gap-1.5 font-semibold">
            <Flag className="size-4 text-warning" aria-hidden /> Marked for review ({marked.length})
          </h3>
          {marked.length > 0 ? list(marked) : <p className="text-sm text-muted">You haven&apos;t marked any question.</p>}
        </section>
      )}
      <section aria-labelledby="review-others" className="space-y-2">
        <h3 id="review-others" className="font-semibold">
          {marking ? "Other questions" : "All questions"} ({others.length})
        </h3>
        {list(others)}
      </section>
      {children}
    </Card>
  );
}
