"use client";

import { useState } from "react";
import clsx from "clsx";
import { TriangleAlert } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { questionLabel } from "@examinus/copy/question-types";
import { QuestionTypeIcon, questionStyle } from "@/components/question-kinds/question-style";
import { validateQuestion } from "@/features/quiz/question-defaults";
import type { Question } from "@examinus/domain/question";
import { QuestionFields } from "./question-fields";

// One question in a window of its own, laid out like the student's view of it and edited in place, with its
// properties (type, points, topic, scoring, explanation) in a panel beside it. The window edits a copy; "Save
// question" hands it back, Cancel (or Esc) throws it away.
export function QuestionEditorDialog({
  question,
  number,
  location,
  poolLocked,
  onSave,
  onClose,
}: {
  // The question being edited, or null while the window is closed.
  question: Question | null;
  number: number;
  // Where the question sits, e.g. "Part I · Q4".
  location: string;
  // The question is in a pool part: its points are set by the part and can't be edited here.
  poolLocked: boolean;
  onSave: (question: Question) => void;
  onClose: () => void;
}) {
  // The copy starts over from the question each time the window opens on one.
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Question | null>(null);
  const id = question?.id ?? null;
  if (id !== openId) {
    setOpenId(id);
    setDraft(question);
  }
  // A question that was just opened (a blank new one, say) isn't flagged until the teacher has changed something.
  const problem = draft && draft !== question ? validateQuestion(draft) : null;

  return (
    <Dialog
      open={question !== null}
      onClose={onClose}
      title={`Edit question ${number}`}
      description={location}
      size="xl"
      fill
      fullscreenOnMobile
      footer={
        <>
          <Button variant="secondary" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button className="min-h-11" onClick={() => draft && onSave(draft)}>
            Save question
          </Button>
        </>
      }
    >
      {draft && (
        <div className="flex h-full flex-col">
          <div className="shrink-0 space-y-2 border-b border-border bg-surface-muted/40 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <span aria-hidden className={clsx("grid size-10 shrink-0 place-items-center rounded-xl shadow-depth", questionStyle[draft.type].soft)}>
                <QuestionTypeIcon type={draft.type} className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base leading-tight font-bold">{questionLabel(draft)}</p>
                <p className="text-xs text-muted">Write it as students will see it; set points and scoring in the properties.</p>
              </div>
              <Badge tone="primary">
                {draft.points} {draft.points === 1 ? "pt" : "pts"}
              </Badge>
            </div>
            {problem && (
              <p className="flex items-start gap-1.5 rounded-lg bg-warning-soft px-3 py-2 text-sm font-semibold text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                Question {number} {problem}
              </p>
            )}
          </div>
          {/* Phone: one column that scrolls as a whole. lg+: the question and the properties scroll on their own. */}
          <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
            <QuestionFields question={draft} number={number} poolLocked={poolLocked} onChange={setDraft} panes />
          </div>
        </div>
      )}
    </Dialog>
  );
}
