"use client";

import type { Active, Over, UniqueIdentifier } from "@dnd-kit/core";
import { X } from "lucide-react";
import { AssetImage } from "@/components/asset-image";
import { CardFace, DndArea, DragCard, DropArea, overlayCardClass } from "@/components/dnd";
import { Markdown } from "@/components/markdown";
import { plainText } from "../shared/plain-text";
import type { InputProps } from "../views/input";

// Drag the choices onto the items. The choices stay in the pool whatever is placed (the same choice may go
// with several items, as the old drop-down allowed and as the contract says), so a card dragged out of the
// pool is a copy. Dragging a placed card onto another item swaps the two; dragging it to the pool, or the
// × button, empties its item. Cards are `pool:<rightId>` and `slot:<index>`, drop areas `to:<index>` and `to:pool`.
export function Input({ q, value: answer, onChange, assetUrls }: InputProps<"matching">) {
  const value = Array.isArray(answer) ? answer : undefined;
  const given = q.left.map((_, i) => (Array.isArray(value) ? (value[i] ?? "") : ""));
  const right = (id: string) => q.right.find((r) => r.id === id);
  const rightLabel = (id: string) => {
    const r = right(id);
    return r ? plainText(r.text) || r.alt || "Picture" : "nothing";
  };
  const leftLabel = (i: number) => `item ${i + 1}, ${plainText(q.left[i]?.text ?? "") || q.left[i]?.alt || "Picture"}`;
  const cardOf = (id: UniqueIdentifier) => {
    const [kind, key = ""] = String(id).split(":");
    return kind === "slot" ? (right(given[Number(key)] ?? "") ?? null) : (right(key) ?? null);
  };
  const set = (i: number, id: string) => onChange(given.map((x, j) => (j === i ? id : x)));

  function drop(active: Active, over: Over | null) {
    if (!over) return;
    const [from, fromKey = ""] = String(active.id).split(":");
    const [, to = ""] = String(over.id).split(":");
    if (from === "pool") {
      if (to !== "pool") set(Number(to), fromKey);
      return;
    }
    const j = Number(fromKey);
    if (to === "pool") set(j, "");
    else if (Number(to) !== j) onChange(given.map((x, k) => (k === Number(to) ? (given[j] ?? "") : k === j ? (given[Number(to)] ?? "") : x)));
  }

  return (
    <DndArea
      className="space-y-4"
      names={{
        item: (id) => rightLabel(cardOf(id)?.id ?? ""),
        place: (id) => {
          const [, key = ""] = String(id).split(":");
          return key === "pool" ? "the choices" : leftLabel(Number(key));
        },
      }}
      onDrop={drop}
      overlay={(id) => {
        const r = cardOf(id);
        return r && (
          <div className={overlayCardClass}>
            <CardFace text={r.text} imageId={r.imageId} alt={r.alt} assetUrls={assetUrls} />
          </div>
        );
      }}
    >
      <ul className="space-y-3">
        {q.left.map((item, i) => {
          const placed = right(given[i] ?? "");
          return (
            <li key={item.id} className="flex flex-col gap-1.5 @lg:flex-row @lg:items-center @lg:gap-3">
              <div className="flex min-w-0 flex-1 gap-2 text-sm">
                <span className="text-muted">{i + 1}.</span>
                <div className="min-w-0 space-y-1">
                  <Markdown inline assetUrls={assetUrls}>
                    {item.text}
                  </Markdown>
                  {item.imageId && <AssetImage id={item.imageId} alt={item.alt ?? ""} assetUrls={assetUrls} className="max-h-32" />}
                </div>
              </div>
              <DropArea
                id={`to:${i}`}
                label={`Match for ${leftLabel(i)}${placed ? `: ${rightLabel(placed.id)}` : ", empty"}`}
                className="flex min-h-14 items-center gap-2 rounded-lg border border-dashed border-border bg-surface-muted/50 p-1.5 @lg:w-72 @lg:shrink-0"
              >
                {placed ? (
                  <>
                    <DragCard id={`slot:${i}`} label={rightLabel(placed.id)} className="min-w-0 flex-1">
                      <CardFace text={placed.text} imageId={placed.imageId} alt={placed.alt} assetUrls={assetUrls} />
                    </DragCard>
                    <button
                      type="button"
                      onClick={() => set(i, "")}
                      aria-label={`Clear the match for item ${i + 1}`}
                      className="rounded-md p-1 text-muted hover:bg-surface-muted hover:text-foreground"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </>
                ) : (
                  <span className="px-2 text-xs text-muted">Drop a choice here</span>
                )}
              </DropArea>
            </li>
          );
        })}
      </ul>
      <DropArea
        id="to:pool"
        label="Choices"
        className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface-muted p-3"
        overClassName="border-primary bg-primary-soft"
      >
        {q.right.map((r) => (
          <DragCard key={r.id} id={`pool:${r.id}`} label={plainText(r.text) || r.alt || "Picture"}>
            <CardFace text={r.text} imageId={r.imageId} alt={r.alt} assetUrls={assetUrls} />
          </DragCard>
        ))}
      </DropArea>
    </DndArea>
  );
}
