"use client";

import { useActionState } from "react";
import { subjectAreaNames } from "@examora/contract";
import { Button, ButtonLink, Field, inputClass } from "@/components/ui";
import { subjectAreaLabel } from "@/lib/subjects";
import type { Class } from "@/lib/types";
import type { ClassFormState } from "./actions";

export function ClassForm({
  action,
  initial,
  cancelHref,
  submitLabel,
}: {
  action: (prev: ClassFormState, formData: FormData) => Promise<ClassFormState>;
  initial?: Class;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <Field label="Course code">
          <input name="courseCode" defaultValue={initial?.courseCode} required placeholder="e.g. IT302" className={inputClass} />
        </Field>
        <Field label="Title">
          <input name="title" defaultValue={initial?.title} required placeholder="e.g. Database Management Systems" className={inputClass} />
        </Field>
      </div>
      <Field label="Subject type" hint="Decides which question types its quizzes and exams offer.">
        <select name="subjectArea" defaultValue={initial?.subjectArea ?? ""} className={inputClass}>
          <option value="">Guess from the course code and title</option>
          {subjectAreaNames.map((s) => (
            <option key={s} value={s}>
              {subjectAreaLabel[s]}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Section">
          <input name="section" defaultValue={initial?.section} placeholder="e.g. BSIT 3-A" className={inputClass} />
        </Field>
        <Field label="Term">
          <input name="term" defaultValue={initial?.term} placeholder="e.g. 1st Sem 2026–2027" className={inputClass} />
        </Field>
        <Field label="Schedule">
          <input name="schedule" defaultValue={initial?.schedule} placeholder="e.g. MWF 9:00–10:30 AM" className={inputClass} />
        </Field>
        <Field label="Room">
          <input name="room" defaultValue={initial?.room} placeholder="e.g. Lab 204" className={inputClass} />
        </Field>
        <Field label="Units">
          <input name="units" type="number" min={0} max={12} defaultValue={initial?.units ?? 3} className={inputClass} />
        </Field>
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
