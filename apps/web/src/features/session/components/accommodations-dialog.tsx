"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Accessibility, X } from "lucide-react";
import {
  accommodationLimits,
  noAccommodations,
  timeMultipliers,
  type Accommodations,
  type AccommodationExemption,
} from "@examinus/domain/accommodations";
import { Badge, Button, Field, inputClass } from "@/components/ui";
import { setAccommodationsAction } from "@/features/session/actions";
import { accommodationParts } from "@/features/session/accommodations";

const exemptions: { value: AccommodationExemption; label: string; hint: string }[] = [
  { value: "computers_only", label: "Allow a phone or tablet", hint: "Skips the computers-only rule." },
  { value: "fullscreen", label: "Don't require full screen", hint: "The student may leave full screen." },
  { value: "one_screen", label: "Allow a second screen", hint: "Skips the one-screen rule." },
];

// What the teacher gave a student, as one compact chip. Nothing set: a dash.
export function AccommodationsChip({ accommodations }: { accommodations: Accommodations | null }) {
  const parts = accommodationParts(accommodations);
  if (parts.length === 0) return <span className="text-muted">—</span>;
  return (
    <span title={accommodations?.note || undefined}>
      <Badge tone="info">{parts.join(" · ")}</Badge>
    </span>
  );
}

// Edits one student's accommodations on a session: more time, more attempts, exemptions from exam rules.
export function AccommodationsDialog({
  sessionId,
  studentId,
  name,
  accommodations,
  exam,
  disabled = false,
}: {
  sessionId: string;
  // The roster id.
  studentId: string;
  name: string;
  accommodations: Accommodations | null;
  // The exemptions are rules of exam sessions.
  exam: boolean;
  disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [draft, setDraft] = useState<Accommodations>(accommodations ?? noAccommodations);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const validMinutes =
    Number.isInteger(draft.extraMinutes) &&
    draft.extraMinutes >= accommodationLimits.extraMinutes.minimum &&
    draft.extraMinutes <= accommodationLimits.extraMinutes.maximum;
  const validAttempts =
    Number.isInteger(draft.extraAttempts) &&
    draft.extraAttempts >= accommodationLimits.extraAttempts.minimum &&
    draft.extraAttempts <= accommodationLimits.extraAttempts.maximum;
  const valid = validMinutes && validAttempts;

  function save(next: Accommodations | null) {
    start(async () => {
      const result = await setAccommodationsAction(sessionId, studentId, next);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError(null);
      dialog.current?.close();
    });
  }

  const toggle = (value: AccommodationExemption, on: boolean) =>
    setDraft((d) => ({ ...d, exempt: on ? [...d.exempt.filter((e) => e !== value), value] : d.exempt.filter((e) => e !== value) }));

  return (
    <>
      <Button
        variant="ghost"
        disabled={disabled}
        aria-label={`Accommodations for ${name}`}
        className="gap-1.5 px-2 py-1"
        onClick={() => {
          setDraft(accommodations ?? noAccommodations);
          setError(null);
          dialog.current?.showModal();
        }}
      >
        <Accessibility className="size-4" aria-hidden /> Edit
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save(draft);
          }}
          className="space-y-4 p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="font-semibold">
                Accommodations for {name}
              </h2>
              <p className="mt-0.5 text-sm text-muted">Only this student gets them, in this session.</p>
            </div>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close"
              className="rounded-md p-1 text-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <Field label="Time limit multiplier" hint="Scales the time limit. The close time stays.">
            <select
              value={draft.timeMultiplier}
              onChange={(e) => setDraft((d) => ({ ...d, timeMultiplier: Number(e.target.value) }))}
              className={inputClass}
            >
              {timeMultipliers.map((m) => (
                <option key={m} value={m}>
                  {m === 1 ? "1× (no change)" : `${m}×`}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Extra minutes" hint="Added after the limit, even past the close time.">
              <input
                type="number"
                min={accommodationLimits.extraMinutes.minimum}
                max={accommodationLimits.extraMinutes.maximum}
                step={1}
                inputMode="numeric"
                value={draft.extraMinutes}
                onChange={(e) => setDraft((d) => ({ ...d, extraMinutes: Number(e.target.value) }))}
                className={inputClass}
              />
            </Field>
            <Field label="Extra attempts" hint="On top of the attempts allowed.">
              <input
                type="number"
                min={accommodationLimits.extraAttempts.minimum}
                max={accommodationLimits.extraAttempts.maximum}
                step={1}
                inputMode="numeric"
                value={draft.extraAttempts}
                onChange={(e) => setDraft((d) => ({ ...d, extraAttempts: Number(e.target.value) }))}
                className={inputClass}
              />
            </Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Exempt from exam rules</legend>
            {!exam && <p className="text-xs text-muted">Exemptions apply to exam sessions only.</p>}
            {exemptions.map((x) => (
              <label key={x.value} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!exam}
                  checked={draft.exempt.includes(x.value)}
                  onChange={(e) => toggle(x.value, e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  {x.label} <span className="text-xs text-muted">{x.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <Field label="Note (only you see it)">
            <textarea
              rows={2}
              maxLength={accommodationLimits.noteLength}
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              className={inputClass}
            />
          </Field>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-between gap-2">
            <Button type="button" variant="secondary" disabled={pending || accommodations === null} onClick={() => save(null)}>
              Clear
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !valid}>
                Save
              </Button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
