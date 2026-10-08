"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { OrderingQuestion, Question } from "@examora/contract";
import { ImageField, withImage } from "../image-field";
import { newId, InlineField } from "./shared";

const minItems = 3;
const maxItems = 10;

export function OrderingEditor({ q, onChange }: { q: OrderingQuestion; onChange: (q: Question) => void }) {
  const move = (from: number, to: number) => {
    const items = [...q.items];
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item!);
    onChange({ ...q, items });
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        List the items in the correct order, first to last. Students see them shuffled and drag them into order.
      </p>
      <ol className="space-y-2">
        {q.items.map((x, i) => (
          <li key={x.id} className="flex items-start gap-2 rounded-lg bg-surface-muted/60 p-2">
            <span aria-hidden className="mt-2 w-6 shrink-0 text-center text-sm font-semibold text-muted">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <InlineField
                value={x.text}
                onChange={(text) => onChange({ ...q, items: q.items.map((y) => (y.id === x.id ? { ...y, text } : y)) })}
                placeholder={`Item ${i + 1}`}
                label={`Item ${i + 1}`}
              />
              <ImageField
                imageId={x.imageId}
                alt={x.alt}
                label={`item ${i + 1}`}
                onChange={(picked) => onChange({ ...q, items: q.items.map((y) => (y.id === x.id ? withImage(y, picked) : y)) })}
              />
            </div>
            <div className="flex shrink-0 items-center">
              <Button variant="ghost" className="px-2" aria-label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ArrowUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                className="px-2"
                aria-label={`Move item ${i + 1} down`}
                disabled={i === q.items.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button
                variant="ghost"
                className="px-2"
                aria-label={`Remove item ${i + 1}`}
                disabled={q.items.length <= minItems}
                onClick={() => onChange({ ...q, items: q.items.filter((y) => y.id !== x.id) })}
              >
                <X className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <Button
        variant="ghost"
        className="text-primary"
        disabled={q.items.length >= maxItems}
        onClick={() => onChange({ ...q, items: [...q.items, { id: newId(), text: "" }] })}
      >
        <Plus className="size-4" /> Add item
      </Button>
    </div>
  );
}
