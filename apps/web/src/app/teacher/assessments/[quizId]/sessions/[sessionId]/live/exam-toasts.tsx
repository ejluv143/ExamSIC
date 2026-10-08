"use client";

import { X } from "lucide-react";
import type { IntegrityEventType } from "@examora/contract";
import { AlertChip } from "@/components/integrity-chip";
import { integrityEventLabel } from "@/lib/integrity";
import { formatClock } from "./live-shared";

// The alerts of an exam that interrupt the teacher the moment they arrive. Blocked copy and paste, the mouse
// leaving the page and window resizes are only logged.
export const examToastTypes: Partial<Record<IntegrityEventType, true>> = {
  exit_fullscreen: true,
  left_page: true,
  switched_app: true,
  alt_tab: true,
  second_screen: true,
  device_changed: true,
  auto_submitted: true,
  devtools_open: true,
  split_screen: true,
  print: true,
  screenshot: true,
};

export type ExamToast = { id: string; attemptId: string; type: IntegrityEventType; at: string };

// Alerts of an exam session, opened as they arrive. Each stays until dismissed; selecting one opens the student.
export function ExamToasts({
  toasts,
  nameOf,
  onOpen,
  onDismiss,
}: {
  toasts: readonly ExamToast[];
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
                {formatClock(t.at)}
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
