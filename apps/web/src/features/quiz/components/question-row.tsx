"use client";

import type { ReactNode } from "react";
import { Check, Copy, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { questionLabel } from "@/lib/format";
import { QuestionTypeBadge } from "@/components/question-kinds/question-style";
import { previewText } from "@/lib/preview-text";
import { answerSummary } from "@/features/quiz/quiz-editor";
import type { Question } from "@examinus/domain/question";

// One question as a row: number, type, points, the start of its text and its answer. A click opens the question
// editor; the buttons on the right copy or delete it.
export function QuestionRow({
  question: q,
  number,
  problem,
  onEdit,
  onDuplicate,
  onRemove,
  leading,
  trailing,
}: {
  question: Question;
  number: number;
  // What is wrong with the question (from the quiz's checks), if anything.
  problem?: string;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  // Before the row's text, e.g. the drag handle.
  leading?: ReactNode;
  // Before the row's buttons, e.g. the part picker.
  trailing?: ReactNode;
}) {
  const preview = previewText(q.prompt);
  const answer = answerSummary(q);
  return (
    <div className="flex items-start gap-1 rounded-xl border border-border bg-surface px-2 py-2 hover:border-primary/40 sm:px-3">
      {leading}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Question ${number}: edit`}
        className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg px-1 py-0.5 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">Q{number}</span>
          <QuestionTypeBadge type={q.type} label={questionLabel(q)} />
          <Badge>
            {q.points} {q.points === 1 ? "pt" : "pts"}
          </Badge>
          {problem && (
            <span title={`Question ${number} ${problem}`} className="text-warning">
              <TriangleAlert className="size-4" aria-hidden />
              <span className="sr-only">Needs attention: question {number} {problem}</span>
            </span>
          )}
        </span>
        <span className={preview ? "line-clamp-2 text-sm" : "text-sm italic text-muted"}>
          {preview || "No question text yet"}
        </span>
        {answer && (
          <span title={answer} className="flex min-w-0 items-center gap-1.5 text-xs text-success">
            <Check className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{answer}</span>
          </span>
        )}
      </button>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {trailing}
        <Button variant="ghost" className="px-2" aria-label={`Edit question ${number}`} title="Edit" onClick={onEdit}>
          <Pencil className="size-4" aria-hidden />
        </Button>
        <Button variant="ghost" className="px-2" aria-label={`Duplicate question ${number}`} title="Duplicate" onClick={onDuplicate}>
          <Copy className="size-4" aria-hidden />
        </Button>
        <Button variant="danger" className="px-2" aria-label={`Delete question ${number}`} title="Delete" onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
