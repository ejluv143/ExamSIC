"use client";

import { Select } from "@/components/select";
import { Switch } from "@/components/ui";
import { clozeInputLabel } from "@/lib/format";
import { clozeInputs, type BlankQuestion, type ClozeInput } from "@examinus/domain/kinds/blank";

// The Properties panel's "Type settings" for an identification: how students fill the blanks, and whether case counts.
export function BlankSettings({ q, onChange }: { q: BlankQuestion; onChange: (q: BlankQuestion) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">Input</span>
        <Select<ClozeInput>
          size="sm"
          className="w-36"
          aria-label="How students fill the blanks"
          value={q.clozeInput}
          options={clozeInputs.map((c) => ({ value: c, label: clozeInputLabel[c] }))}
          onChange={(clozeInput) => onChange({ ...q, clozeInput })}
        />
      </div>
      <Switch checked={q.caseSensitive} onChange={(caseSensitive) => onChange({ ...q, caseSensitive })} label="Case-sensitive" />
    </div>
  );
}
