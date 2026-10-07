"use client";

import { useId, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { QuestionTypeBadge } from "@/lib/question-style";
import { plainText } from "@/lib/quiz-editor";
import type { Question } from "@examora/contract";
import { QuestionFields } from "./question-fields";

// One question as a compact card: number, type, points and a preview of the text. Opening it shows every field.
export function QuestionCard({
  question: q,
  number,
  expanded,
  onToggle,
  problem,
  first,
  last,
  poolLocked,
  onChange,
  onMove,
  onRemove,
  headerExtra,
  bodyExtra,
}: {
  question: Question;
  number: number;
  expanded: boolean;
  onToggle: () => void;
  // What is wrong with the question (from the quiz's checks), if anything.
  problem?: string;
  first: boolean;
  last: boolean;
  poolLocked: boolean;
  onChange: (q: Question) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  // Shown next to the buttons, e.g. the drag handle and "Move to part".
  headerExtra?: ReactNode;
  // Shown above the fields of an open question, e.g. "Move to part".
  bodyExtra?: ReactNode;
}) {
  const bodyId = useId();
  const preview = plainText(q.prompt);
  return (
    <div
      className={clsx("rounded-xl border border-border bg-surface", expanded && "shadow-sm")}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5 sm:px-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={`Question ${number}: ${expanded ? "collapse" : "edit"}`}
          className="flex min-w-0 flex-1 basis-64 items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
        >
          {expanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
          )}
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-muted text-sm font-semibold tabular-nums">
            {number}
          </span>
          <QuestionTypeBadge type={q.type} mode={q.type === "blank" ? q.mode : undefined} />
          <span className={clsx("min-w-0 flex-1 truncate text-sm", !preview && "italic text-muted")}>
            {preview || "No question text yet"}
          </span>
          {problem && (
            <span title={`Question ${number} ${problem}`} className="shrink-0 text-warning">
              <TriangleAlert className="size-4" aria-hidden />
              <span className="sr-only">Needs attention: question {number} {problem}</span>
            </span>
          )}
          <span className="shrink-0 text-sm tabular-nums text-muted">
            {q.points} {q.points === 1 ? "pt" : "pts"}
          </span>
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {headerExtra}
          <Button variant="ghost" className="px-2" aria-label={`Move question ${number} up`} disabled={first} onClick={() => onMove(-1)}>
            <ArrowUp className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" className="px-2" aria-label={`Move question ${number} down`} disabled={last} onClick={() => onMove(1)}>
            <ArrowDown className="size-4" aria-hidden />
          </Button>
          <Button variant="danger" className="px-2" aria-label={`Delete question ${number}`} onClick={onRemove}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      {expanded && (
        <div id={bodyId} className="space-y-5 border-t border-border p-3 sm:p-4">
          {bodyExtra && <div className="flex justify-end">{bodyExtra}</div>}
          <QuestionFields question={q} number={number} onChange={onChange} poolLocked={poolLocked} />
        </div>
      )}
    </div>
  );
}
