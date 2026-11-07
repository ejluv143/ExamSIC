"use client";

import { X } from "lucide-react";
import { formatTimeSeconds } from "@examinus/copy/time";
import type { Toast } from "@examinus/client/teacher-view";
import { AlertChip } from "@/features/session/components/integrity-chip";
import { integrityEventLabel } from "@examinus/copy/integrity";

// Alerts of a monitored session, opened as they arrive. Each stays until dismissed; selecting one opens the student.
export function ExamToasts({
  toasts,
  nameOf,
  onOpen,
  onDismiss,
}: {
  toasts: readonly Toast[];
  nameOf: (attemptId: string) => string;
  onOpen: (attemptId: string) => void;
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <ul aria-label="New alerts" className="fixed bottom-4 left-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <li
          key={t.id}
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-danger/40 bg-surface p-3 shadow-xl"
        >
          <button type="button" onClick={() => onOpen(t.attemptId)} className="min-w-0 flex-1 space-y-1 text-left">
            <span className="flex items-center gap-2">
              <AlertChip type={t.type} />
              <time dateTime={t.at} className="text-xs tabular-nums text-muted">
                {formatTimeSeconds(t.at)}
              </time>
            </span>
            <span className="block truncate text-sm font-medium">{nameOf(t.attemptId)}</span>
            <span className="block text-xs text-muted">{integrityEventLabel[t.type]}</span>
          </button>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss"
            className="rounded-md p-1 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
