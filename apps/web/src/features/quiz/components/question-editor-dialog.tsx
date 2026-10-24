"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/dialog";
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

  return (
    <Dialog
      open={question !== null}
      onClose={onClose}
      title="Question Editor"
      description={location}
      size="xl"
      fill
      fullscreenOnMobile
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
        // Phone: one column that scrolls as a whole. lg+: the question and the properties scroll on their own.
        <div className="h-full overflow-y-auto lg:overflow-hidden">
          <QuestionFields question={draft} number={number} poolLocked={poolLocked} onChange={setDraft} panes />
        </div>
      )}
    </Dialog>
  );
}
