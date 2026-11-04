"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, ListPlus, Play } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { Select } from "@/components/select";
import { TextEditor } from "@/components/text-editor";
import { Button, Field, inputClass } from "@/components/ui";
import { guessSubjectArea, questionTypesFor, subjectAreaLabel } from "@/lib/subjects";
import { questionTypeLabel } from "@examinus/copy/question-types";
import type { SubjectArea } from "@examinus/domain/roles";
import type { Class } from "@/features/classes/types";

export type QuizDetails = {
  title: string;
  description: string;
  subject?: string;
  subjectArea: SubjectArea;
};

type Subject = { courseCode: string; title: string; area: SubjectArea };

// The teacher's subjects: one per course code, each with its subject type.
export function subjectsOf(classes: readonly Class[]): Subject[] {
  const byCode: Record<string, Subject> = {};
  for (const c of classes)
    byCode[c.courseCode] ??= {
      courseCode: c.courseCode,
      title: c.title,
      area: c.subjectArea ?? guessSubjectArea(c.courseCode, c.title),
    };
  return Object.values(byCode);
}

// The class or subject type the quiz is for; the subject type decides which question types the editor offers.
function SubjectSelect({
  classes,
  value,
  onChange,
}: {
  classes: readonly Class[];
  value: Pick<QuizDetails, "subject" | "subjectArea">;
  onChange: (value: Pick<QuizDetails, "subject" | "subjectArea">) => void;
}) {
  const subjects = useMemo(() => subjectsOf(classes), [classes]);
  const area = value.subjectArea;
  return (
    <div className="space-y-2">
      <Field label="Subject" hint="It decides which question types you can add.">
        <Select
          value={value.subject ? `course:${value.subject}` : `area:${area}`}
          onChange={(picked) => {
            const at = picked.indexOf(":");
            const kind = picked.slice(0, at);
            const v = picked.slice(at + 1);
            if (kind === "course") {
              const course = subjects.find((s) => s.courseCode === v)!;
              onChange({ subject: course.courseCode, subjectArea: course.area });
            } else onChange({ subjectArea: v as SubjectArea });
          }}
          className="w-full"
          options={[
            ...subjects.map((s) => ({
              value: `course:${s.courseCode}`,
              label: `${s.courseCode} · ${s.title} (${subjectAreaLabel[s.area]})`,
              group: "Your subjects",
            })),
            ...(Object.keys(subjectAreaLabel) as SubjectArea[]).map((k) => ({
              value: `area:${k}`,
              label: subjectAreaLabel[k],
              group: "Subject types",
            })),
          ]}
        />
      </Field>
      <div className="rounded-lg bg-surface-muted/60 px-3 py-2">
        <p className="text-xs font-semibold text-muted">Question types for {subjectAreaLabel[area]}</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={`Question types for ${subjectAreaLabel[area]}`}>
          {questionTypesFor[area].map((t) => (
            <li key={t} className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold shadow-sm">
              {questionTypeLabel[t]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// The quiz's title, subject and description. Opens before a new quiz exists (`isNew`: it then says what comes next
// and leaves for the editor on success), and again from the editor's "Quiz details" card. `onSubmit` returns an
// error message, or nothing when it worked.
export function QuizDetailsDialog({
  open,
  onClose,
  classes,
  initial,
  isNew,
  submitLabel,
  title,
  assetUrls,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  classes: readonly Class[];
  initial: QuizDetails;
  isNew?: boolean;
  submitLabel: string;
  title: string;
  assetUrls?: Record<string, string>;
  onSubmit: (details: QuizDetails) => Promise<string | void> | string | void;
}) {
  const formId = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={isNew ? "Name it and pick its subject. Everything here can change later." : undefined}
      size="lg"
      footer={
        <>
          <Button variant="secondary" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} className="min-h-11">
            {submitLabel}
            {isNew && <ArrowRight className="size-4" aria-hidden />}
          </Button>
        </>
      }
    >
      <DetailsForm formId={formId} classes={classes} initial={initial} isNew={isNew} assetUrls={assetUrls} onSubmit={onSubmit} onDone={onClose} />
    </Dialog>
  );
}

function DetailsForm({
  formId,
  classes,
  initial,
  isNew,
  assetUrls,
  onSubmit,
  onDone,
}: {
  formId: string;
  classes: readonly Class[];
  initial: QuizDetails;
  isNew?: boolean;
  assetUrls?: Record<string, string>;
  onSubmit: (details: QuizDetails) => Promise<string | void> | string | void;
  onDone: () => void;
}) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!d.title.trim()) {
      setError("Give the quiz a title.");
      return;
    }
    setBusy(true);
    setError(null);
    const message = await onSubmit({ ...d, title: d.title.trim() });
    if (message) {
      setError(message);
      setBusy(false);
    } else if (!isNew) onDone();
  }

  return (
    <form id={formId} onSubmit={submit} className="space-y-5" aria-busy={busy}>
      <Field label="Title">
        <input
          autoFocus
          required
          value={d.title}
          onChange={(e) => setD({ ...d, title: e.target.value })}
          placeholder="e.g. SQL Joins Quick Check"
          aria-invalid={error !== null && !d.title.trim()}
          className={`${inputClass} min-h-12 w-full text-base font-semibold`}
        />
      </Field>
      {error && (
        <p role="alert" className="-mt-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <SubjectSelect classes={classes} value={d} onChange={(v) => setD({ ...d, ...v, subject: v.subject })} />
      <div className="space-y-1.5">
        <p className="text-sm font-medium">
          Description <span className="font-normal text-muted">(optional)</span>
        </p>
        <TextEditor
          value={d.description}
          onChange={(description) => setD({ ...d, description })}
          label="Quiz description"
          rows={3}
          assetUrls={assetUrls ?? {}}
          images={assetUrls !== undefined}
          placeholder="e.g. Answer all questions. No notes allowed."
        />
        <p className="text-xs text-muted">Shown to students before they start.</p>
      </div>
      {isNew && (
        <ol className="grid gap-2 rounded-xl bg-primary-soft/50 p-3 text-sm sm:grid-cols-2" aria-label="What comes next">
          <li className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-depth" aria-hidden>
              <ListPlus className="size-4" />
            </span>
            <span>
              <span className="block font-semibold">Add questions</span>
              <span className="text-xs text-muted">By hand, from your bank or from Excel. Group them into parts if you like.</span>
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-depth" aria-hidden>
              <Play className="size-4" />
            </span>
            <span>
              <span className="block font-semibold">Start a session</span>
              <span className="text-xs text-muted">Run it as a quiz, exam, mastery set or live game.</span>
            </span>
          </li>
        </ol>
      )}
    </form>
  );
}
