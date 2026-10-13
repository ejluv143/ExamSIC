"use client";

import { Plus, X } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { Select } from "@/components/select";
import { ImageField, withImage } from "../shared/editor-image-field";
import { newId, weightsAdd, weightsRemove } from "../shared/editor-model";
import { InlineField } from "../shared/editor-fields";
import type { EditorProps } from "../views/editor";

export function Editor({ q, onChange }: EditorProps<"matching">) {
  const used = new Set(q.left.map((l) => l.rightId));
  const rightLabel = (i: number) => q.right[i]!.text.trim() || (q.right[i]!.imageId ? `Item ${i + 1} (image)` : `Item ${i + 1}`);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Each item on the left goes with one item on the right. Right items that no left item uses are extra wrong
        options.
      </p>
      <div className="space-y-2">
        <p className="text-sm font-medium">Left items</p>
        {q.left.map((l, i) => (
          <div key={l.id} className="space-y-2 rounded-lg bg-surface-muted/60 p-2 sm:flex sm:items-start sm:gap-2 sm:space-y-0">
            <div className="min-w-0 flex-1 space-y-1.5">
              <InlineField
                value={l.text}
                onChange={(text) => onChange({ ...q, left: q.left.map((x) => (x.id === l.id ? { ...x, text } : x)) })}
                placeholder={`Left item ${i + 1}`}
                label={`Left item ${i + 1}`}
              />
              <ImageField
                imageId={l.imageId}
                alt={l.alt}
                label={`left item ${i + 1}`}
                onChange={(picked) => onChange({ ...q, left: q.left.map((x) => (x.id === l.id ? withImage(x, picked) : x)) })}
              />
            </div>
            <div className="flex items-center gap-2 sm:w-64 sm:shrink-0">
              <Select
                value={l.rightId}
                aria-label={`Match for left item ${i + 1}`}
                onChange={(rightId) =>
                  onChange({ ...q, left: q.left.map((x) => (x.id === l.id ? { ...x, rightId } : x)) })
                }
                placeholder="Choose the match…"
                options={q.right.map((r, j) => ({ value: r.id, label: rightLabel(j) }))}
                triggerClassName={!q.right.some((r) => r.id === l.rightId) ? "border-danger!" : undefined}
                className="w-full"
              />
              <Button
                variant="ghost"
                className="px-2"
                aria-label={`Remove left item ${i + 1}`}
                disabled={q.left.length <= 1}
                onClick={() => onChange({ ...q, left: q.left.filter((x) => x.id !== l.id), ...weightsRemove(q, i) })}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Right items</p>
        {q.right.map((r, i) => (
          <div key={r.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <InlineField
                value={r.text}
                onChange={(text) => onChange({ ...q, right: q.right.map((x) => (x.id === r.id ? { ...x, text } : x)) })}
                placeholder={`Right item ${i + 1}`}
                label={`Right item ${i + 1}`}
              />
              <ImageField
                imageId={r.imageId}
                alt={r.alt}
                label={`right item ${i + 1}`}
                onChange={(picked) => onChange({ ...q, right: q.right.map((x) => (x.id === r.id ? withImage(x, picked) : x)) })}
              />
            </div>
            {!used.has(r.id) && (
              <span className="mt-2">
                <Badge tone="warning">extra</Badge>
              </span>
            )}
            <Button
              variant="ghost"
              className="px-2"
              aria-label={`Remove right item ${i + 1}`}
              disabled={q.right.length <= 1}
              onClick={() =>
                onChange({
                  ...q,
                  right: q.right.filter((x) => x.id !== r.id),
                  left: q.left.map((l) => (l.rightId === r.id ? { ...l, rightId: "" } : l)),
                })
              }
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4">
        <Button
          variant="ghost"
          className="text-primary"
          onClick={() => {
            const rightId = newId();
            onChange({
              ...q,
              left: [...q.left, { id: newId(), text: "", rightId }],
              right: [...q.right, { id: rightId, text: "" }],
              ...weightsAdd(q),
            });
          }}
        >
          <Plus className="size-4" /> Add pair
        </Button>
        <Button
          variant="ghost"
          className="text-primary"
          onClick={() => onChange({ ...q, right: [...q.right, { id: newId(), text: "" }] })}
        >
          <Plus className="size-4" /> Add extra right item
        </Button>
      </div>
    </div>
  );
}
