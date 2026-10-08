"use client";

import type { Active, Over, UniqueIdentifier } from "@dnd-kit/core";
import {
  encodeCategorizationAnswer,
  parseCategorizationAnswer,
  type StudentCategorizationQuestion,
} from "@examora/contract";
import { CardFace, DndArea, DragCard, DropArea, overlayCardClass } from "./dnd";
import { Markdown } from "./markdown";
import { plainText } from "./answer-inputs";

// Drag each item into the bucket of its category, between buckets, or back to the pool. Items left in the pool
// are unsorted (which is the right place for a distractor). Cards are `item:<id>`, drop areas `bucket:<id>`
// and `bucket:pool`. The answer holds only the sorted items, and is null while nothing is sorted.
export function CategorizationAnswer({
  q,
  value,
  onChange,
  assetUrls,
}: {
  q: StudentCategorizationQuestion;
  value: string | undefined;
  onChange: (v: string | null) => void;
  assetUrls: Record<string, string>;
}) {
  const known = parseCategorizationAnswer(value);
  const sorted: Record<string, string> = {};
  for (const item of q.items) {
    const categoryId = known[item.id];
    if (categoryId && q.categories.some((c) => c.id === categoryId)) sorted[item.id] = categoryId;
  }
  const itemLabel = (id: UniqueIdentifier) => {
    const item = q.items.find((i) => i.id === String(id).slice("item:".length));
    return item ? plainText(item.text) || item.alt || "Picture" : "item";
  };
  const placeLabel = (id: UniqueIdentifier) => {
    const key = String(id).slice("bucket:".length);
    return key === "pool" ? "the unsorted items" : `category ${plainText(q.categories.find((c) => c.id === key)?.name ?? "")}`;
  };

  function drop(active: Active, over: Over | null) {
    if (!over) return;
    const itemId = String(active.id).slice("item:".length);
    const to = String(over.id).slice("bucket:".length);
    const next = { ...sorted };
    if (to === "pool") delete next[itemId];
    else next[itemId] = to;
    onChange(Object.keys(next).length === 0 ? null : encodeCategorizationAnswer(next));
  }

  const itemsIn = (categoryId: string | null) => q.items.filter((i) => (sorted[i.id] ?? null) === categoryId);
  const card = (item: StudentCategorizationQuestion["items"][number]) => (
    <DragCard key={item.id} id={`item:${item.id}`} label={itemLabel(`item:${item.id}`)}>
      <CardFace text={item.text} imageId={item.imageId} alt={item.alt} assetUrls={assetUrls} />
    </DragCard>
  );

  return (
    <DndArea
      className="space-y-4"
      names={{ item: itemLabel, place: placeLabel }}
      onDrop={drop}
      overlay={(id) => {
        const item = q.items.find((i) => i.id === String(id).slice("item:".length));
        return (
          item && (
            <div className={overlayCardClass}>
              <CardFace text={item.text} imageId={item.imageId} alt={item.alt} assetUrls={assetUrls} />
            </div>
          )
        );
      }}
    >
      <DropArea
        id="bucket:pool"
        label="Unsorted items"
        className="flex min-h-16 flex-wrap items-start gap-2 rounded-lg border border-border bg-surface-muted p-3"
      >
        {itemsIn(null).map(card)}
        {itemsIn(null).length === 0 && <span className="text-xs text-muted">Every item is in a category.</span>}
      </DropArea>
      <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
        {q.categories.map((c) => (
          <DropArea
            key={c.id}
            id={`bucket:${c.id}`}
            label={`Category ${plainText(c.name)}`}
            className="flex min-h-32 flex-col gap-2 rounded-lg border border-dashed border-border bg-surface p-3"
          >
            <div>
              <p className="text-sm font-semibold">{c.name}</p>
              {c.description && (
                <Markdown className="text-xs text-muted" assetUrls={assetUrls}>
                  {c.description}
                </Markdown>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {itemsIn(c.id).map(card)}
              {itemsIn(c.id).length === 0 && <span className="m-auto text-xs text-muted">Drop items here</span>}
            </div>
          </DropArea>
        ))}
      </div>
    </DndArea>
  );
}
