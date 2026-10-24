"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { Copy, CornerDownRight, Pencil, Trash2 } from "lucide-react";
import { Menu, type MenuItem } from "@/components/menu";
import { questionLabel } from "@/lib/format";
import { QuestionTypeBadge } from "@/components/question-kinds/question-style";
import { previewText } from "@/lib/preview-text";
import { answerSummary } from "@/features/quiz/quiz-editor";
import type { Question } from "@examinus/domain/question";

// One question as a line of its part's list: number, type, the start of its text, points and a menu. A click
// anywhere on the row opens the question editor; a problem shows as a warning edge with a tooltip.
export function QuestionRow({
  question: q,
  number,
  problem,
  moveTargets,
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
    ...moveTargets.map((t) => ({ label: `Move to ${t.label}`, icon: CornerDownRight, onSelect: t.onSelect })),
    { label: "Delete", icon: Trash2, danger: true, onSelect: onRemove },
  ];
  return (
    <div
      onClick={onEdit}
      title={problem ? `Question ${number} ${problem}` : undefined}
      className={clsx(
        "flex cursor-pointer items-start gap-2 px-4 py-2.5 hover:bg-surface-muted/50 sm:px-5",
        problem && "border-l-2 border-warning",
      )}
    >
      {leading}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        aria-label={`Question ${number}: edit${problem ? ` (needs attention: ${problem})` : ""}`}
        className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">Q{number}</span>
          <QuestionTypeBadge type={q.type} label={questionLabel(q)} />
          <span className={clsx("min-w-0 flex-1 truncate text-sm", !preview && "italic text-muted")}>
            {preview || "No question text yet"}
          </span>
        </span>
        {answer && (
          <span title={answer} className="mt-0.5 block truncate text-xs text-muted">
            {answer}
          </span>
        )}
      </button>
      <span className="shrink-0 pt-0.5 text-sm text-muted tabular-nums">
        {q.points} {q.points === 1 ? "pt" : "pts"}
      </span>
      <div onClick={(e) => e.stopPropagation()} className="-my-1 shrink-0">
        <Menu label={`Question ${number} actions`} items={items} />
      </div>
    </div>
  );
}
