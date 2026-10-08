"use client";

import { useId, type ReactNode } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronRight, Trash2, TriangleAlert } from "lucide-react";
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
  poolLocked,
  onChange,
  onRemove,
  headerExtra,
}: {
  question: Question;
  number: number;
  expanded: boolean;
  onToggle: () => void;
  // What is wrong with the question (from the quiz's checks), if anything.
  problem?: string;
  poolLocked: boolean;
  onChange: (q: Question) => void;
  onRemove: () => void;
  // Shown next to the delete button, e.g. the drag handle and the part picker.
  headerExtra?: ReactNode;
}) {
  const bodyId = useId();
  const preview = plainText(q.prompt);
  return (
    <div
      className={clsx("rounded-xl border border-border bg-surface", expanded && "shadow-sm")}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-0.5 sm:px-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
          aria-label={`Question ${number}: ${expanded ? "collapse" : "edit"}`}
          className="flex min-w-0 flex-1 basis-64 items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
        >
          {expanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
          )}
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-muted text-xs font-semibold tabular-nums">
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
          <Button variant="danger" className="px-2" aria-label={`Delete question ${number}`} onClick={onRemove}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      {expanded && (
        <div id={bodyId} className="space-y-5 px-4 pt-2 pb-5 sm:px-5">
          <QuestionFields question={q} number={number} onChange={onChange} poolLocked={poolLocked} />
        </div>
      )}
    </div>
  );
}
