"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Copy, CornerDownRight, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { Menu, type MenuItem } from "@/components/menu";
import { questionLabel } from "@examinus/copy/question-types";
import { QuestionTypeBadge } from "@/components/question-kinds/question-style";
import { previewText } from "@examinus/question-kinds-core/preview-text";
import { answerSummary } from "@/features/quiz/quiz-editor";
import type { Question } from "@examinus/domain/question";

// One question as a card in its part's list: drag handle, number, type, the start of its text (two lines), the
// answer, points, and its actions in plain sight. A click anywhere on the card opens the question editor; a problem
// shows as a warning edge with the reason written out.
export function QuestionRow({
  question: q,
  number,
  problem,
  moveTargets,
  canMove,
  onMove,
  onEdit,
  onDuplicate,
  onRemove,
  leading,
}: {
  question: Question;
  number: number;
  // What is wrong with the question (from the quiz's checks), if anything.
  problem?: string;
  // The other parts the question can move to.
  moveTargets: { label: string; onSelect: () => void }[];
  // Whether the question has a neighbour to swap with: moving by menu is the alternative to dragging.
  canMove: { up: boolean; down: boolean };
  onMove: (delta: -1 | 1) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  // Before the row's text, e.g. the drag handle.
  leading?: ReactNode;
}) {
  const preview = previewText(q.prompt);
  const answer = answerSummary(q);
  const items: MenuItem[] = [
    { label: "Edit", icon: Pencil, onSelect: onEdit },
    { label: "Duplicate", icon: Copy, onSelect: onDuplicate },
    { label: "Move up", icon: ArrowUp, disabled: !canMove.up, onSelect: () => onMove(-1) },
    { label: "Move down", icon: ArrowDown, disabled: !canMove.down, onSelect: () => onMove(1) },
    ...moveTargets.map((t) => ({ label: `Move to ${t.label}`, icon: CornerDownRight, onSelect: t.onSelect })),
    { label: "Delete", icon: Trash2, danger: true, onSelect: onRemove },
  ];
  return (
    <div
      onClick={onEdit}
      className={clsx(
        "flex cursor-pointer flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border bg-surface px-3 py-3 shadow-sm transition-shadow hover:shadow-md sm:px-4",
        problem ? "border-warning" : "border-border",
      )}
    >
      {leading}
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-base font-bold text-primary tabular-nums shadow-depth"
      >
        {number}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        aria-label={`Question ${number}: edit${problem ? ` (needs attention: ${problem})` : ""}`}
        className="min-w-0 flex-1 basis-52 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="flex flex-wrap items-center gap-2">
          <QuestionTypeBadge type={q.type} label={questionLabel(q)} />
          <Badge tone="primary">
            {q.points} {q.points === 1 ? "pt" : "pts"}
          </Badge>
        </span>
        <span className={clsx("mt-1.5 line-clamp-2 block text-sm font-medium break-words", !preview && "text-muted italic")}>
          {preview || "No question text yet"}
        </span>
        {answer && (
          <span title={answer} className="mt-1 flex items-baseline gap-1.5 text-xs text-muted">
            <span className="shrink-0 font-semibold">Answer</span>
            <span className="min-w-0 truncate">{answer}</span>
          </span>
        )}
        {problem && (
          <span className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-warning">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            Question {number} {problem}
          </span>
        )}
      </button>
      <div onClick={(e) => e.stopPropagation()} className="ml-auto flex shrink-0 items-center gap-1">
        <Button variant="secondary" className="min-h-11 px-3" onClick={onEdit} aria-label={`Edit question ${number}`}>
          <Pencil className="size-4" aria-hidden /> Edit
        </Button>
        <Button
          variant="ghost"
          className="size-11 px-0"
          onClick={onDuplicate}
          aria-label={`Duplicate question ${number}`}
          title="Duplicate"
        >
          <Copy className="size-4" aria-hidden />
        </Button>
        <Menu label={`Question ${number} actions`} items={items} />
      </div>
    </div>
  );
}
