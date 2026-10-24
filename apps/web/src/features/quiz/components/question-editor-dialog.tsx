"use client";

import { useContext, useState } from "react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { questionLabel } from "@/lib/format";
import { QuestionTypeBadge } from "@/components/question-kinds/question-style";
import { PointsInput } from "@/components/question-kinds/shared/editor-fields";
import { TagField } from "@/features/bank/components/tag-combobox";
import type { Question } from "@examinus/domain/question";
import { EditorTopics, QuestionFields } from "./question-fields";

// One question in a window of its own: points, type and topic on top, then the text, answer, scoring and
// explanation. The window edits a copy; "Save question" hands it back, Cancel (or Esc) throws it away.
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
  const topics = useContext(EditorTopics);
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
        <div className="space-y-6">
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4 border-b border-border pb-5">
            <div className="text-sm">
              <span className="mb-1.5 block font-medium">Points</span>
              <PointsInput
                value={draft.points}
                readOnly={poolLocked}
                onChange={(points) => setDraft({ ...draft, points })}
                label={`Points for question ${number}`}
              />
              {poolLocked && <span className="mt-1 block text-xs text-muted">Set by the part&apos;s pool.</span>}
            </div>
            <div className="text-sm">
              <span className="mb-1.5 block font-medium">Type</span>
              <QuestionTypeBadge type={draft.type} label={questionLabel(draft)} className="py-1" />
            </div>
            <div className="min-w-48 flex-1 text-sm">
              <TagField
                label="Topic (optional)"
                value={draft.topic ?? ""}
                options={topics}
                placeholder="e.g. Normalization"
                hint="Groups the question in the question bank and reports."
                onChange={(topic) => {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { topic: _previous, ...without } = draft;
                  setDraft((topic === "" ? without : { ...without, topic }) as Question);
                }}
              />
            </div>
          </div>
          <QuestionFields question={draft} number={number} poolLocked={poolLocked} onChange={setDraft} />
        </div>
      )}
    </Dialog>
  );
}
