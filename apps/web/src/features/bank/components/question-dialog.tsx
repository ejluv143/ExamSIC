"use client";

import { useState } from "react";
import type { BankQuestion } from "@examinus/contract/bank";
import type { Question } from "@examinus/domain/question";
import type { SubjectArea } from "@examinus/domain/roles";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { Button, Field } from "@/components/ui";
import { EditorAssetUrls } from "@/components/question-kinds/shared/editor-image-field";
import { questionTypeLabel } from "@examinus/copy/question-types";
import { subjectAreaLabel } from "@/lib/subjects";
import { addToBankAction, updateBankQuestionAction } from "@/features/bank/actions";
import { EditorTopics, QuestionFields } from "@/features/quiz/components/question-fields";
import { validateQuestion } from "@/features/quiz/question-defaults";
import { TagField } from "./tag-combobox";

// A question being written: a new one (`item` null, `question` the empty one of the chosen type) or a bank
// question of the teacher's own.
export type QuestionDraft = { question: Question; item: BankQuestion | null };

const none = "none";

// Edit a question of the bank, or write a new one: the same fields as the quiz editor, plus the subject.
export function QuestionDialog({
  draft,
  subjects,
  topics,
  assetUrls,
  onClose,
  onDone,
}: {
  draft: QuestionDraft | null;
  subjects: readonly string[];
  topics: readonly string[];
  assetUrls: Record<string, string>;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog
      open={draft !== null}
      onClose={onClose}
      title={draft?.item ? "Edit question" : "New question"}
      description={draft ? questionTypeLabel[draft.question.type] : undefined}
      size="xl"
    >
      {draft && (
        <EditorAssetUrls value={assetUrls}>
          <EditorTopics value={topics}>
            <QuestionForm draft={draft} subjects={subjects} onClose={onClose} onDone={onDone} />
          </EditorTopics>
        </EditorAssetUrls>
      )}
    </Dialog>
  );
}

function QuestionForm({
  draft,
  subjects,
  onClose,
  onDone,
}: {
  draft: QuestionDraft;
  subjects: readonly string[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [question, setQuestion] = useState(draft.question);
  const [subject, setSubject] = useState(draft.item?.subject ?? "");
  const [area, setArea] = useState<string>(draft.item?.subjectArea ?? none);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    const problem = validateQuestion(question);
    if (problem) return setError(`The question ${problem}`);
    setBusy(true);
    setError(null);
    const tags = { subject: subject.trim() || null, subjectArea: area === none ? null : (area as SubjectArea) };
    const result = draft.item
      ? await updateBankQuestionAction({ question, ...tags })
      : await addToBankAction({ questions: [question], ...tags });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onDone(draft.item ? "Question saved." : "Question added to your bank.");
    onClose();
  }

  return (
    // Not a <form>: Enter in one of the answer fields must not save the question.
    <div className="space-y-6" aria-busy={busy}>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TagField label="Subject (optional)" value={subject} options={subjects} onChange={setSubject} placeholder="e.g. Database Systems" />
        <Field label="Subject type (optional)">
          <Select
            value={area}
            onChange={setArea}
            className="w-full"
            aria-label="Subject type"
            options={[
              { value: none, label: "None" },
              ...(Object.keys(subjectAreaLabel) as SubjectArea[]).map((k) => ({ value: k, label: subjectAreaLabel[k] })),
            ]}
          />
        </Field>
      </div>
      <QuestionFields question={question} number={1} onChange={setQuestion} />
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy}>
          {draft.item ? "Save question" : "Add to bank"}
        </Button>
      </div>
    </div>
  );
}
