"use client";

import { useState } from "react";
import clsx from "clsx";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { questionLabel } from "@examinus/copy/question-types";
import { QuestionTypeIcon, questionStyle } from "@/components/question-kinds/question-style";
import { validateQuestion } from "@/features/quiz/question-defaults";
import type { Question } from "@examinus/domain/question";
import { QuestionFields, QuestionToolbar } from "./question-fields";
import type { QuestionEditorProps } from "./question-editor-dialog";

// One question in a window of its own, laid out like the student's view of it and edited in place. Its type heads
// the window, with the Properties popover (points, topic, scoring, explanation) and "Preview as student" beside it.
// The window edits a copy; "Save question" hands it back, Cancel (or Esc) throws it away. Loaded on demand through
// question-editor-dialog.tsx.
export function QuestionEditor({ question, number, location, poolLocked, onSave, onClose }: QuestionEditorProps) {
  // The copy starts over from the question each time the window opens on one.
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Question | null>(null);
  const [preview, setPreview] = useState(false);
  const id = question?.id ?? null;
  if (id !== openId) {
    setOpenId(id);
    setDraft(question);
    setPreview(false);
  }
  // A question that was just opened (a blank new one, say) isn't flagged until the teacher has changed something.
  const problem = draft && draft !== question ? validateQuestion(draft) : null;

  return (
    <Dialog
      open={question !== null}
      onClose={onClose}
      title={`Edit question ${number}`}
      description={location}
      size="full"
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
                <p className="text-xs text-muted">Write it as students will see it; set points and scoring in Properties.</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <QuestionToolbar
                  question={draft}
                  number={number}
                  onChange={setDraft}
                  poolLocked={poolLocked}
                  preview={preview}
                  onPreview={setPreview}
                />
              </div>
            </div>
            {problem && (
              <p className="flex items-start gap-1.5 rounded-lg bg-warning-soft px-3 py-2 text-sm font-semibold text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                Question {number} {problem}
              </p>
            )}
          </div>
          {/* The question scrolls on its own under the header. */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <QuestionFields question={draft} number={number} poolLocked={poolLocked} onChange={setDraft} preview={preview} panes />
          </div>
        </div>
      )}
    </Dialog>
  );
}
