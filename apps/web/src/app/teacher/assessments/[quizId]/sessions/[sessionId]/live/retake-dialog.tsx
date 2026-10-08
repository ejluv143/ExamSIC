"use client";

import { useId, useRef, useState, useTransition } from "react";
import { RotateCcw, X } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";
import { grantRetakeAction } from "@/lib/live/actions";

const maxReason = 500;

// Exam sessions: lets one named student take the exam once more. The reason is kept in the record.
export function RetakeDialog({ attemptId, name }: { attemptId: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const valid = reason.trim().length > 0;

  function submit() {
    if (!valid) return;
    start(async () => {
      const result = await grantRetakeAction(attemptId, reason.trim());
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError(null);
      setDone(true);
      setReason("");
      dialog.current?.close();
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setError(null);
          setDone(false);
          dialog.current?.showModal();
        }}
      >
        <RotateCcw className="size-4" aria-hidden /> Grant retake
      </Button>
      {done && (
        <p role="status" className="basis-full text-sm text-success">
          {name} can start the exam once more.
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
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
                Grant a retake to {name}
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                Only {name} gets one more attempt. The reason is kept in the exam record.
              </p>
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
          <Field label="Reason">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={maxReason}
              rows={3}
              required
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
              Grant retake
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
