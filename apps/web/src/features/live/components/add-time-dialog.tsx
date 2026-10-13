"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Clock, X } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";

export type Outcome = { error: string } | object;

// "Add time" for everyone: asks for the minutes in a small dialog, then calls `onAdd` with seconds.
export function AddTimeDialog({
  title,
  description,
  onAdd,
}: {
  title: string;
  description: string;
  onAdd: (seconds: number) => Promise<Outcome>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [minutes, setMinutes] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const value = Number(minutes);
  const valid = Number.isInteger(value) && value >= 1 && value <= 600;

  function submit() {
    if (!valid) return;
    start(async () => {
      const result = await onAdd(value * 60);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError(null);
      dialog.current?.close();
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
        }}
      >
        <Clock className="size-4" aria-hidden /> Add time
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
        className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4 p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="font-semibold">
                {title}
              </h2>
              <p className="mt-0.5 text-sm text-muted">{description}</p>
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
          <Field label="Minutes to add">
            <input
              type="number"
              min={1}
              max={600}
              step={1}
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className={inputClass}
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !valid}>
              Add {valid ? `${value} min` : "time"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
