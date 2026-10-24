"use client";

import { Plus } from "lucide-react";
import { questionTypeLabel } from "@/lib/format";
import { newQuestion } from "@/features/quiz/question-defaults";
import type { Question, QuestionType } from "@examinus/domain/question";

// The types most quizzes use; the "Add question" menu next to the chips has the rest.
const common: readonly QuestionType[] = ["multiple_choice", "true_false", "blank", "matching", "essay", "code"];

// "Add to Part I:" and a chip per common question type: one click adds the question and opens it for editing.
export function QuickAdd({
  partLabel,
  allowed,
  onAdd,
}: {
  partLabel: string;
  // The question types the quiz's subject offers.
  allowed: readonly QuestionType[];
  onAdd: (question: Question) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-sm font-medium text-muted">Add to {partLabel}:</span>
      {common
        .filter((t) => allowed.includes(t))
        .map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onAdd(newQuestion(type))}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Plus className="size-3.5 text-muted" aria-hidden />
            {questionTypeLabel[type]}
          </button>
        ))}
    </div>
  );
}
