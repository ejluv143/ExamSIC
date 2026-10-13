"use client";

import { useState, type RefObject } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import type { Change } from "./draft";

// After the results of an exam are released, a changed score needs a reason that is kept in the exam record. The
// grader opens the dialog with `showModal()` and gives it the changes waiting for the reason.
export function ReasonDialog({
  dialogRef,
  pending,
  saving,
  commit,
  onClose,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  pending: readonly Change[] | null;
  saving: boolean;
  // Saves the changes with the reason; returns the API's message when it refuses.
  commit: (changes: readonly Change[], reason: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="reason-title"
      onClose={() => {
        setReason("");
        setReasonError(null);
        onClose();
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!pending || !reason.trim() || saving) return;
          const failure = await commit(pending, reason.trim());
          if (failure) setReasonError(failure);
          else dialogRef.current?.close();
        }}
        className="space-y-4 p-5"
      >
        <div>
          <h2 id="reason-title" className="font-semibold">
            Why does the score change?
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            The results of this exam are already released. The reason is kept with the old and new score in the exam record.
          </p>
        </div>
        <Field label="Reason">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            required
            className={inputClass}
          />
        </Field>
        {reasonError && (
          <p role="alert" className="text-sm text-danger">
            {reasonError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !reason.trim()}>
            Save score change
          </Button>
        </div>
      </form>
    </dialog>
  );
}
