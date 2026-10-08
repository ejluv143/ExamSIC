"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button, Field, inputClass } from "@/components/ui";
import { roman } from "@/lib/quiz-editor";
import { guessSubjectArea, questionTypesFor, subjectAreaLabel } from "@/lib/subjects";
import { questionTypeLabel } from "@/lib/format";
import type { SubjectArea } from "@examora/contract";
import type { Class } from "@/lib/types";

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
    <Field
      label="Subject"
      hint={`Decides which question types you can add. ${subjectAreaLabel[area]}: ${questionTypesFor[area].map((t) => questionTypeLabel[t]).join(", ")}.`}
    >
      <select
        value={value.subject ? `course:${value.subject}` : `area:${area}`}
        onChange={(e) => {
          const at = e.target.value.indexOf(":");
          const kind = e.target.value.slice(0, at);
          const v = e.target.value.slice(at + 1);
          if (kind === "course") {
            const course = subjects.find((s) => s.courseCode === v)!;
            onChange({ subject: course.courseCode, subjectArea: course.area });
          } else onChange({ subjectArea: v as SubjectArea });
        }}
        className={inputClass}
      >
        {subjects.length > 0 && (
          <optgroup label="Your subjects">
            {subjects.map((s) => (
              <option key={s.courseCode} value={`course:${s.courseCode}`}>
                {s.courseCode} · {s.title} ({subjectAreaLabel[s.area]})
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Subject types">
          {(Object.keys(subjectAreaLabel) as SubjectArea[]).map((k) => (
            <option key={k} value={`area:${k}`}>
              {subjectAreaLabel[k]}
            </option>
          ))}
        </optgroup>
      </select>
    </Field>
  );
}

// The quiz's title, subject and instructions. Opens before a new quiz exists (and also asks for its parts), and
// again from the editor's "Quiz details" card. `onSubmit` returns an error message, or nothing when it worked.
export function QuizDetailsDialog({
  open,
  onClose,
  classes,
  initial,
  withParts,
  submitLabel,
  title,
  assetUrls,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  classes: readonly Class[];
  initial: QuizDetails;
  // New quizzes also name their parts here.
  withParts?: boolean;
  submitLabel: string;
  title: string;
  assetUrls?: Record<string, string>;
  onSubmit: (details: QuizDetails, parts: string[]) => Promise<string | void> | string | void;
}) {
  const formId = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={withParts ? "Fill in the basics. You add the questions next, and can change all of this later." : undefined}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <DetailsForm
        formId={formId}
        classes={classes}
        initial={initial}
        withParts={withParts}
        assetUrls={assetUrls}
        onSubmit={onSubmit}
        onDone={onClose}
      />
    </Dialog>
  );
}

function DetailsForm({
  formId,
  classes,
  initial,
  withParts,
  assetUrls,
  onSubmit,
  onDone,
}: {
  formId: string;
  classes: readonly Class[];
  initial: QuizDetails;
  withParts?: boolean;
  assetUrls?: Record<string, string>;
  onSubmit: (details: QuizDetails, parts: string[]) => Promise<string | void> | string | void;
  onDone: () => void;
}) {
  const [d, setD] = useState(initial);
  const [parts, setParts] = useState<string[]>([""]);
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
    const message = await onSubmit({ ...d, title: d.title.trim() }, parts);
    if (message) {
      setError(message);
      setBusy(false);
    } else if (!withParts) onDone();
  }

  return (
    <form id={formId} onSubmit={submit} className="space-y-4" aria-busy={busy}>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Field label="Title (required)">
        <input
          autoFocus
          required
          value={d.title}
          onChange={(e) => setD({ ...d, title: e.target.value })}
          placeholder="e.g. SQL Joins Quick Check"
          className={inputClass}
        />
      </Field>
      <SubjectSelect classes={classes} value={d} onChange={(v) => setD({ ...d, ...v, subject: v.subject })} />
      <div>
        <p className="mb-1.5 text-sm font-medium">Description (optional)</p>
        <MarkdownEditor
          value={d.description}
          onChange={(description) => setD({ ...d, description })}
          label="Quiz description"
          rows={3}
          assetUrls={assetUrls ?? {}}
          images={assetUrls !== undefined}
          placeholder="e.g. Answer all questions. No notes allowed."
        />
        <p className="mt-1 text-xs text-muted">Markdown. Shown to students before they start.</p>
      </div>
      {withParts && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Parts</legend>
          <p className="text-xs text-muted">
            A part groups questions under one set of instructions, like “Part I – Multiple choice”. Leave a name empty
            to fill it in later.
          </p>
          {parts.map((name, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-sm text-muted">Part {roman(i + 1)}</span>
              <input
                value={name}
                onChange={(e) => setParts(parts.map((p, j) => (j === i ? e.target.value : p)))}
                aria-label={`Name of part ${roman(i + 1)}`}
                placeholder="e.g. Multiple choice"
                className={inputClass}
              />
              <Button
                variant="ghost"
                className="px-2"
                disabled={parts.length === 1}
                aria-label={`Remove part ${roman(i + 1)}`}
                onClick={() => setParts(parts.filter((_, j) => j !== i))}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          <Button variant="ghost" className="text-primary" onClick={() => setParts([...parts, ""])}>
            <Plus className="size-4" aria-hidden /> Add another part
          </Button>
        </fieldset>
      )}
    </form>
  );
}
