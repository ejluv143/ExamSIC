"use client";

import { Plus, X } from "lucide-react";
import { Button, inputClass } from "@/components/ui";
import type { EnumerationQuestion, Question } from "@examora/contract";
import { weightsAdd, weightsRemove, Check2, CaseToggle } from "./shared";

export function EnumerationEditor({ q, onChange }: { q: EnumerationQuestion; onChange: (q: Question) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Students give {q.items.length} {q.items.length === 1 ? "answer" : "answers"}. Separate other accepted wordings
        with <code>|</code>, e.g. <code>1NF|First Normal Form</code>.
      </p>
      {q.items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-right text-sm text-muted tabular-nums">{i + 1}.</span>
          <input
            value={item}
            onChange={(e) => onChange({ ...q, items: q.items.map((x, j) => (j === i ? e.target.value : x)) })}
            placeholder="Expected item"
            aria-label={`Expected item ${i + 1}`}
            className={inputClass}
          />
          <Button
            variant="ghost"
            className="px-2"
            aria-label={`Remove item ${i + 1}`}
            disabled={q.items.length <= 1}
            onClick={() => onChange({ ...q, items: q.items.filter((_, j) => j !== i), ...weightsRemove(q, i) })}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Button
          variant="ghost"
          className="text-primary"
          onClick={() => onChange({ ...q, items: [...q.items, ""], ...weightsAdd(q) })}
        >
          <Plus className="size-4" /> Add item
        </Button>
        <Check2 checked={q.orderMatters} onChange={(orderMatters) => onChange({ ...q, orderMatters })}>
          Order matters
        </Check2>
        <CaseToggle checked={q.caseSensitive} onChange={(caseSensitive) => onChange({ ...q, caseSensitive })} />
      </div>
    </div>
  );
}
