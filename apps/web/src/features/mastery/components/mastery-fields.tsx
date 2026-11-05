"use client";

import { masteryMaxRetries } from "@examinus/domain/quiz";
import { Field, Switch, inputClass } from "@/components/ui";
import type { MasteryDraft } from "../mastery-draft";

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
      <Switch
        checked={value.showCorrectAnswer}
        onChange={(v) => onChange({ ...value, showCorrectAnswer: v })}
        label="Show the correct answer after the last wrong try"
        description="The question's explanation is shown with it."
      />
    </fieldset>
  );
}
