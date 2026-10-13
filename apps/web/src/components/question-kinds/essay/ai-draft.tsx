"use client";

import { useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { ProviderSelect, StyleToggle, type AiControls } from "@/features/ai/components/ai-grading-controls";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui";
import type { AiGradeSuggestion } from "@examinus/contract/ai";
import { aiProviderLabels } from "@examinus/domain/ai";
import type { EssayQuestion } from "@examinus/domain/kinds/essay";

// The "Suggest with AI" button of an essay answer and the draft it brings. Applying fills the card's score and
// feedback; nothing is saved until the teacher saves.
export function AiDraft({
  question: q,
  hasAnswer,
  ai,
  onApply,
}: {
  question: EssayQuestion;
  hasAnswer: boolean;
  ai: AiControls;
  onApply: (s: AiGradeSuggestion) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestion = ai.suggestionFor(q.id);
  const rubric = q.rubric;

  async function ask() {
    setError(null);
    setBusy(true);
    const failure = await ai.suggest(q.id);
    setBusy(false);
    if (failure) setError(failure);
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-primary/50 bg-primary-soft/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {ai.options.length > 1 && ai.provider && (
          <div className="w-40">
            <ProviderSelect options={ai.options} value={ai.provider} onChange={ai.onProvider} />
          </div>
        )}
        <div className="w-40">
          <StyleToggle value={ai.style} onChange={ai.onStyle} />
        </div>
        <Button variant="secondary" onClick={ask} disabled={busy || !hasAnswer || !ai.provider}>
          <Sparkles className="size-4" aria-hidden /> {busy ? "Asking AI…" : suggestion ? "Suggest again" : "Suggest with AI"}
        </Button>
        {!hasAnswer && <span className="text-xs text-muted">No answer to grade.</span>}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft p-2 text-danger">
          {error}
        </p>
      )}
      {suggestion && (
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">
            AI draft · {aiProviderLabels[suggestion.provider]} · {suggestion.model} · not graded
          </p>
          <p>
            <span className="font-medium">Suggested score:</span> {suggestion.score} / {q.points} pts
          </p>
          {suggestion.feedback && <p className="whitespace-pre-wrap">{suggestion.feedback}</p>}
          {rubric.length > 0 && (
            <ul className="text-xs text-muted">
              {rubric.map((r) => (
                <li key={r.id} className="flex gap-1.5">
                  {suggestion.rubricRowIds.includes(r.id) ? (
                    <Check className="size-3.5 shrink-0 text-success" aria-label="Met" />
                  ) : (
                    <X className="size-3.5 shrink-0" aria-label="Not met" />
                  )}
                  <Markdown inline>{r.criterion}</Markdown> · {r.points} pts
                </li>
              ))}
            </ul>
          )}
          <Button onClick={() => onApply(suggestion)}>Apply to score and feedback</Button>
        </div>
      )}
    </div>
  );
}
