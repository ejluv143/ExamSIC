"use client";

import clsx from "clsx";
import { Select } from "@/components/select";
import { aiFeedbackStyles, aiProviderLabels, type AiFeedbackStyle, type AiProvider } from "@examinus/domain/ai";
import type { AiGradeSuggestion, AiOption } from "@examinus/contract/ai";

// The AI draft controls of the grader: the providers the teacher can use, the feedback style, and the drafts so far.
export type AiControls = {
  options: readonly AiOption[];
  provider: AiProvider | undefined;
  onProvider: (p: AiProvider) => void;
  style: AiFeedbackStyle;
  onStyle: (s: AiFeedbackStyle) => void;
  suggestionFor: (questionId: string) => AiGradeSuggestion | undefined;
  // The API's message when it refuses, else null.
  suggest: (questionId: string) => Promise<string | null>;
};

export function ProviderSelect({
  options,
  value,
  onChange,
}: {
  options: readonly AiOption[];
  value: AiProvider;
  onChange: (p: AiProvider) => void;
}) {
  return (
    <Select<AiProvider>
      aria-label="AI provider"
      value={value}
      onChange={onChange}
      size="sm"
      className="w-full"
      options={options.map((o) => ({ value: o.provider, label: aiProviderLabels[o.provider] }))}
    />
  );
}

const styleLabel: Record<AiFeedbackStyle, string> = { standard: "Standard", caveman: "Caveman" };

// How the suggested feedback reads: normal sentences, or very short blunt fragments.
export function StyleToggle({ value, onChange }: { value: AiFeedbackStyle; onChange: (s: AiFeedbackStyle) => void }) {
  return (
    <div role="group" aria-label="Feedback style" className="flex gap-1 rounded-lg bg-surface-muted p-0.5">
      {aiFeedbackStyles.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={value === s}
          onClick={() => onChange(s)}
          className={clsx(
            "flex-1 rounded-md px-2 py-1 text-xs font-medium",
            value === s ? "bg-surface shadow-sm" : "text-muted hover:text-foreground",
          )}
        >
          {styleLabel[s]}
        </button>
      ))}
    </div>
  );
}
