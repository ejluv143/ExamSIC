"use client";

import { defaultMastery, masteryMaxRetries, type MasterySettings } from "@examora/contract";
import { Field, inputClass } from "@/components/ui";

// The mastery settings as the form holds them while the teacher types.
export type MasteryDraft = { retryLimit: string; targetPercent: string; showCorrectAnswer: boolean };

export const masteryDraft = (saved: MasterySettings | null | undefined): MasteryDraft => {
  const s = saved ?? defaultMastery;
  return {
    retryLimit: String(s.retryLimit),
    targetPercent: s.targetPercent === null ? "" : String(s.targetPercent),
    showCorrectAnswer: s.showCorrectAnswer,
  };
};

// The settings to save, or the problems to show the teacher.
export function masteryFromDraft(d: MasteryDraft): { settings: MasterySettings } | { problems: string[] } {
  const retryLimit = Number(d.retryLimit);
  const target = d.targetPercent.trim() === "" ? null : Number(d.targetPercent);
  const problems: string[] = [];
  if (!Number.isInteger(retryLimit) || retryLimit < 1 || retryLimit > masteryMaxRetries)
    problems.push(`Tries per question must be a whole number from 1 to ${masteryMaxRetries}.`);
  if (target !== null && (!Number.isInteger(target) || target < 1 || target > 100))
    problems.push("The target score must be a whole percent from 1 to 100.");
  return problems.length
    ? { problems }
    : { settings: { retryLimit, targetPercent: target, showCorrectAnswer: d.showCorrectAnswer } };
}

export function MasteryFields({ value, onChange }: { value: MasteryDraft; onChange: (next: MasteryDraft) => void }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium">Mastery rules</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tries per question" hint="A wrong answer comes back later until it is right or the tries run out.">
          <input
            type="number"
            min={1}
            max={masteryMaxRetries}
            value={value.retryLimit}
            onChange={(e) => onChange({ ...value, retryLimit: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Target score (%)" hint="Optional. Students and you see whether it was reached.">
          <input
            type="number"
            min={1}
            max={100}
            placeholder="No target"
            value={value.targetPercent}
            onChange={(e) => onChange({ ...value, targetPercent: e.target.value })}
            className={inputClass}
          />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.showCorrectAnswer}
          onChange={(e) => onChange({ ...value, showCorrectAnswer: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          Show the correct answer after the last wrong try
          <span className="block text-xs text-muted">The question&apos;s explanation is shown with it.</span>
        </span>
      </label>
    </fieldset>
  );
}
