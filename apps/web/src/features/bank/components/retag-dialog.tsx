"use client";

import { useState, type FormEvent } from "react";
import type { BankQuestion } from "@examinus/contract/bank";
import type { SubjectArea } from "@examinus/domain/roles";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { Button, Field } from "@/components/ui";
import { subjectAreaLabel } from "@/lib/subjects";
import { retagBankQuestionsAction } from "@/features/bank/actions";
import { TagField } from "./tag-combobox";

type Edit<T> = { touched: boolean; value: T };

// The value all the questions share, or undefined when they differ.
function common<T>(values: readonly T[]): T | undefined {
  return values.every((v) => v === values[0]) ? values[0] : undefined;
}

const keep = "keep";
const none = "none";

// Subject, subject type and topic of one or many questions. A field left alone stays as it is; emptying a field
// removes the tag.
export function RetagDialog({
  items,
  subjects,
  topics,
  onClose,
  onDone,
}: {
  items: readonly BankQuestion[] | null;
  subjects: readonly string[];
  topics: readonly string[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog
      open={items !== null}
      onClose={onClose}
      title={items && items.length > 1 ? `Retag ${items.length} questions` : "Retag question"}
      description="Set the subject and topic. Leave a field as it is to keep what each question has; empty it to remove the tag."
    >
      {items && <RetagForm items={items} subjects={subjects} topics={topics} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function RetagForm({
  items,
  subjects,
  topics,
  onClose,
  onDone,
}: {
  items: readonly BankQuestion[];
  subjects: readonly string[];
  topics: readonly string[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const sharedSubject = common(items.map((b) => b.subject));
  const sharedTopic = common(items.map((b) => b.topic));
  const sharedArea = common(items.map((b) => b.subjectArea));
  const [subject, setSubject] = useState<Edit<string>>({ touched: false, value: sharedSubject ?? "" });
  const [topic, setTopic] = useState<Edit<string>>({ touched: false, value: sharedTopic ?? "" });
  const [area, setArea] = useState<string>(sharedArea === undefined ? keep : (sharedArea ?? none));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const areaChanged = area !== (sharedArea === undefined ? keep : (sharedArea ?? none));
    const input = {
      questionIds: items.map((b) => b.question.id),
      ...(subject.touched ? { subject: subject.value.trim() || null } : {}),
      ...(topic.touched ? { topic: topic.value.trim() || null } : {}),
      ...(areaChanged && area !== keep ? { subjectArea: area === none ? null : (area as SubjectArea) } : {}),
    };
    if (Object.keys(input).length === 1) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    const result = await retagBankQuestionsAction(input);
    setBusy(false);
    if ("error" in result) setError(result.error);
    else {
      onDone(`Retagged ${result.ok.count} ${result.ok.count === 1 ? "question" : "questions"}.`);
      onClose();
    }
  }

  const mixed = (shared: unknown) => (shared === undefined ? "Mixed: keep what each has" : undefined);
  return (
    <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <TagField
        label="Subject"
        autoFocus
        value={subject.value}
        options={subjects}
        placeholder={mixed(sharedSubject) ?? "e.g. Database Systems"}
        onChange={(value) => setSubject({ touched: true, value })}
      />
      <Field label="Subject type" hint="Groups the subject with the kind of quizzes it suits.">
        <Select
          value={area}
          onChange={setArea}
          className="w-full"
          aria-label="Subject type"
          options={[
            ...(sharedArea === undefined ? [{ value: keep, label: "Mixed: keep what each has" }] : []),
            { value: none, label: "None" },
            ...(Object.keys(subjectAreaLabel) as SubjectArea[]).map((k) => ({ value: k, label: subjectAreaLabel[k] })),
          ]}
        />
      </Field>
      <TagField
        label="Topic"
        value={topic.value}
        options={topics}
        placeholder={mixed(sharedTopic) ?? "e.g. Normalization"}
        onChange={(value) => setTopic({ touched: true, value })}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Save tags
        </Button>
      </div>
    </form>
  );
}
