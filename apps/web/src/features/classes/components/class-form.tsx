"use client";

import { useActionState } from "react";
import { subjectAreaNames } from "@examinus/domain/roles";
import { classColorNames, classColors } from "@examinus/domain/classes";
import { Button, ButtonLink, Field, inputClass } from "@/components/ui";
import { Select } from "@/components/select";
import { subjectAreaLabel } from "@/lib/subjects";
import type { Class } from "@/features/classes/types";
import type { ClassFormState } from "../actions";

export function ClassForm({
  action,
  initial,
  cancelHref,
  onCancel,
  submitLabel,
}: {
  action: (prev: ClassFormState, formData: FormData) => Promise<ClassFormState>;
  initial?: Class;
  // Cancel is a link, or (in a dialog) a button that closes it.
  cancelHref?: string;
  onCancel?: () => void;
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
        <Select
          name="subjectArea"
          defaultValue={initial?.subjectArea ?? ""}
          className="w-full"
          options={[
            { value: "", label: "Guess from the course code and title" },
            ...subjectAreaNames.map((s) => ({ value: s, label: subjectAreaLabel[s] })),
          ]}
        />
      </Field>
      <Field label="Colour" hint="Colours the class's banner and tile.">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Colour</legend>
          <label className="cursor-pointer">
            <input type="radio" name="color" value="" defaultChecked={!initial?.color} className="peer sr-only" />
            <span className="grid size-9 place-items-center rounded-full border border-border bg-surface-muted text-xs text-muted peer-checked:ring-2 peer-checked:ring-primary peer-checked:ring-offset-2 peer-checked:ring-offset-surface peer-focus-visible:outline-2 peer-focus-visible:outline-primary">
              Auto
            </span>
          </label>
          {classColorNames.map((name) => (
            <label key={name} className="cursor-pointer" title={classColors[name].label}>
              <input type="radio" name="color" value={name} defaultChecked={initial?.color === name} className="peer sr-only" />
              <span
                className="block size-9 rounded-full peer-checked:ring-2 peer-checked:ring-primary peer-checked:ring-offset-2 peer-checked:ring-offset-surface peer-focus-visible:outline-2 peer-focus-visible:outline-primary"
                style={{ backgroundImage: `linear-gradient(135deg, ${classColors[name].from}, ${classColors[name].to})` }}
              >
                <span className="sr-only">{classColors[name].label}</span>
              </span>
            </label>
          ))}
        </fieldset>
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
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <ButtonLink href={cancelHref ?? "/teacher/classes"} variant="ghost">
            Cancel
          </ButtonLink>
        )}
      </div>
    </form>
  );
}
