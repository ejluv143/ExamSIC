"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { questionLabel } from "@/lib/format";
import { QuestionTypeBadge } from "@/components/question-kinds/question-style";
import { PointsInput } from "@/components/question-kinds/shared/editor-fields";
import type { Question } from "@examinus/domain/question";
import { QuestionFields } from "./question-fields";

// One question in a window of its own: the type and points on one line, then the text and answer (scoring,
// explanation and topic fold away). The window edits a copy; "Save question" hands it back, Cancel (or Esc)
// throws it away.
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

  return (
    <Dialog
      open={question !== null}
      onClose={onClose}
      title="Question Editor"
      description={location}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => draft && onSave(draft)}>Save question</Button>
        </>
      }
    >
      {draft && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <QuestionTypeBadge type={draft.type} label={questionLabel(draft)} className="py-1" />
            <span className="ml-auto flex items-center gap-2">
              <PointsInput
                value={draft.points}
                readOnly={poolLocked}
                onChange={(points) => setDraft({ ...draft, points })}
                label={`Points for question ${number}`}
              />
              <span className="text-muted">{poolLocked ? "pts (set by the part's pool)" : "pts"}</span>
            </span>
          </div>
          <QuestionFields question={draft} number={number} poolLocked={poolLocked} onChange={setDraft} />
        </div>
      )}
    </Dialog>
  );
}
