"use client";

import clsx from "clsx";
import { Check, EyeOff, Sparkles } from "lucide-react";
import { ProviderSelect, StyleToggle } from "@/components/ai-grading-controls";
import { Button, Card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { AttemptDetail } from "@examinus/contract/session";
import { paperVersion } from "@examinus/domain/exam";
import type { AiDrafts } from "./use-ai-drafts";

// The students of the session, waiting ones first with a dot; names can be hidden for blind grading. Under the
// list, the AI batch when there are essays to draft.
export function AttemptList({
  attempts,
  selectedId,
  onSelect,
  blind,
  onBlind,
  label,
  attemptsOf,
  examMode,
  waiting,
  ai,
  hasEssays,
}: {
  attempts: readonly AttemptDetail[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  blind: boolean;
  onBlind: () => void;
  label: (d: AttemptDetail, i: number) => string;
  attemptsOf: (d: AttemptDetail) => number;
  examMode: boolean;
  waiting: number;
  ai: AiDrafts;
  hasEssays: boolean;
}) {
  const { batch } = ai;
  return (
    <Card className="self-start lg:sticky lg:top-6">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium">{waiting === 0 ? "All graded" : `${waiting} waiting`}</span>
        <Button
          variant="ghost"
          className="px-2 py-1 text-xs"
          aria-pressed={blind}
          onClick={onBlind}
          title="Hide student names while grading"
        >
          <EyeOff className="size-3.5" aria-hidden /> {blind ? "Show names" : "Hide names"}
        </Button>
      </div>
      <ul className="max-h-[60vh] overflow-y-auto p-2">
        {attempts.map((d, i) => (
          <li key={d.attempt.id}>
            <button
              type="button"
              onClick={() => onSelect(d.attempt.id)}
              aria-current={d.attempt.id === selectedId}
              className={clsx(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                d.attempt.id === selectedId ? "bg-primary-soft text-primary" : "hover:bg-surface-muted",
              )}
            >
              <span className="flex-1 truncate">
                {label(d, i)}
                {!blind && attemptsOf(d) > 1 && (
                  <span className="ml-1.5 text-xs text-muted">{formatDateTime(d.attempt.submittedAt)}</span>
                )}
                {examMode && <span className="ml-1.5 font-mono text-xs text-muted">{paperVersion(d.attempt.seed)}</span>}
              </span>
              {d.attempt.status === "graded" ? (
                <Check className="size-4 text-success" aria-label="Graded" />
              ) : (
                <span className="size-2 rounded-full bg-warning" aria-label="Needs grading" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {ai.options.length > 0 && hasEssays && (
        <div className="space-y-2 border-t border-border p-3 text-sm">
          <p className="font-medium">AI drafts</p>
          {ai.options.length > 1 && ai.provider && (
            <ProviderSelect options={ai.options} value={ai.provider} onChange={ai.chooseProvider} />
          )}
          <StyleToggle value={ai.style} onChange={ai.chooseStyle} />
          {batch?.running ? (
            <Button variant="secondary" className="w-full" onClick={ai.stop}>
              Stop ({batch.done} of {batch.total} done)
            </Button>
          ) : (
            <Button variant="secondary" className="w-full" onClick={ai.suggestAll} disabled={!ai.provider}>
              <Sparkles className="size-4" aria-hidden /> Suggest for all ungraded essays
            </Button>
          )}
          {batch && !batch.running && !batch.error && (
            <p role="status" className="text-xs text-muted">
              {batch.total === 0 ? "No ungraded essays without a suggestion." : `Suggested ${batch.done} of ${batch.total}.`}
            </p>
          )}
          {batch?.error && (
            <p role="alert" className="rounded-lg bg-danger-soft p-2 text-xs text-danger">
              Stopped after {batch.done} of {batch.total}: {batch.error}
            </p>
          )}
          <p className="text-xs text-muted">Suggestions are drafts. Nothing is graded until you save.</p>
        </div>
      )}
    </Card>
  );
}
