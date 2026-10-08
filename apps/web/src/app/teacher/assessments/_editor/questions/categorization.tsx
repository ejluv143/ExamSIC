"use client";

import { useContext } from "react";
import { Plus, X } from "lucide-react";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Badge, Button, inputClass } from "@/components/ui";
import type { CategorizationQuestion, Question } from "@examora/contract";
import { EditorAssetUrls, ImageField, withImage } from "../image-field";
import { newId, weightsAdd, weightsRemove, InlineField } from "./shared";

const maxCategories = 6;

export function CategorizationEditor({ q, onChange }: { q: CategorizationQuestion; onChange: (q: Question) => void }) {
  const assetUrls = useContext(EditorAssetUrls);
  const setCategory = (id: string, patch: Partial<CategorizationQuestion["categories"][number]>) =>
    onChange({ ...q, categories: q.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const setItem = (id: string, next: (item: CategorizationQuestion["items"][number]) => CategorizationQuestion["items"][number]) =>
    onChange({ ...q, items: q.items.map((x) => (x.id === id ? next(x) : x)) });
  const categoryName = (i: number) => q.categories[i]!.name.trim() || `Category ${i + 1}`;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Students drag each item into the category it belongs to. An item with no category is a distractor: it is
        right when the student leaves it unsorted.
      </p>
      <div className="space-y-2">
        <p className="text-sm font-medium">Categories</p>
        {q.categories.map((c, i) => (
          <div key={c.id} className="flex items-start gap-2 rounded-lg bg-surface-muted/60 p-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <InlineField
                value={c.name}
                onChange={(name) => setCategory(c.id, { name })}
                placeholder={`Category ${i + 1}`}
                label={`Category ${i + 1} name`}
              />
              <MarkdownEditor
                value={c.description ?? ""}
                onChange={(description) => setCategory(c.id, { description })}
                label={`Category ${i + 1} description (optional)`}
                placeholder="Description (optional)"
                rows={2}
                assetUrls={assetUrls}
              />
            </div>
            <Button
              variant="ghost"
              className="px-2"
              aria-label={`Remove category ${i + 1}`}
              disabled={q.categories.length <= 2}
              onClick={() =>
                onChange({
                  ...q,
                  categories: q.categories.filter((x) => x.id !== c.id),
                  items: q.items.map((x) => (x.categoryId === c.id ? { ...x, categoryId: null } : x)),
                })
              }
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          className="text-primary"
          disabled={q.categories.length >= maxCategories}
          onClick={() => onChange({ ...q, categories: [...q.categories, { id: newId(), name: "" }] })}
        >
          <Plus className="size-4" /> Add category
        </Button>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Items</p>
        {q.items.map((x, i) => (
          <div key={x.id} className="space-y-2 rounded-lg bg-surface-muted/60 p-2 sm:flex sm:items-start sm:gap-2 sm:space-y-0">
            <div className="min-w-0 flex-1 space-y-1.5">
              <InlineField
                value={x.text}
                onChange={(text) => setItem(x.id, (item) => ({ ...item, text }))}
                placeholder={`Item ${i + 1}`}
                label={`Item ${i + 1}`}
              />
              <ImageField
                imageId={x.imageId}
                alt={x.alt}
                label={`item ${i + 1}`}
                onChange={(picked) => setItem(x.id, (item) => withImage(item, picked))}
              />
            </div>
            <div className="flex items-center gap-2 sm:w-64 sm:shrink-0">
              <select
                value={x.categoryId ?? ""}
                aria-label={`Category of item ${i + 1}`}
                onChange={(e) => setItem(x.id, (item) => ({ ...item, categoryId: e.target.value || null }))}
                className={inputClass}
              >
                <option value="">No category (distractor)</option>
                {q.categories.map((c, j) => (
                  <option key={c.id} value={c.id}>
                    {categoryName(j)}
                  </option>
                ))}
              </select>
              {x.categoryId === null && <Badge tone="warning">distractor</Badge>}
              <Button
                variant="ghost"
                className="px-2"
                aria-label={`Remove item ${i + 1}`}
                disabled={q.items.length <= 2}
                onClick={() => onChange({ ...q, items: q.items.filter((y) => y.id !== x.id), ...weightsRemove(q, i) })}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        ))}
        <Button
          variant="ghost"
          className="text-primary"
          onClick={() =>
            onChange({
              ...q,
              items: [...q.items, { id: newId(), text: "", categoryId: q.categories[0]?.id ?? null }],
              ...weightsAdd(q),
            })
          }
        >
          <Plus className="size-4" /> Add item
        </Button>
      </div>
    </div>
  );
}
