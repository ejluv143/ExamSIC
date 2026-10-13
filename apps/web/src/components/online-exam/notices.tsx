import { AlertTriangle, X } from "lucide-react";
import type { IntegrityNotice } from "../exam-integrity";

// An integrity notice (the student left, or something was blocked), with how many chances are left.
export function GuardNotice({
  notice,
  kind,
  autoSubmitAfter,
  timesAway,
  chancesText,
  onDismiss,
}: {
  notice: NonNullable<IntegrityNotice>;
  kind: string;
  autoSubmitAfter: number | null;
  timesAway: number;
  chancesText: string;
  onDismiss: () => void;
}) {
  return (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="flex-1">
        {notice.message} This was recorded and your teacher will see it.
        {notice.kind === "away" && (
          <>
            {" "}
            {autoSubmitAfter !== null && timesAway > autoSubmitAfter
              ? `No chances left: your ${kind} is being submitted.`
              : `Warning ${timesAway}${autoSubmitAfter !== null ? ` of ${autoSubmitAfter}` : ""}.${chancesText}`}
          </>
        )}
      </span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="hover:opacity-70">
        <X className="size-4" />
      </button>
    </div>
  );
}

// Why the last move or mark didn't work.
export function NavNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="hover:opacity-70">
        <X className="size-4" />
      </button>
    </div>
  );
}
