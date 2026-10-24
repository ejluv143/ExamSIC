"use client";

import { Copy, ListPlus, Share2, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui";

// Sticks to the bottom of the page while questions are selected. Retag, Share and Delete need all of them to be
// the teacher's own; the others may be copied.
export function SelectionBar({
  count,
  allMine,
  canShare,
  onClear,
  onRetag,
  onShare,
  onAddToQuiz,
  onCopy,
  onDelete,
}: {
  count: number;
  allMine: boolean;
  canShare: boolean;
  onClear: () => void;
  onRetag: () => void;
  onShare: () => void;
  onAddToQuiz: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  if (count === 0) return null;
  const mineOnly = allMine ? undefined : "Only your own questions can be changed. Deselect the others.";
  return (
    <div
      role="region"
      aria-label="Selected questions"
      className="sticky bottom-4 z-10 mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 shadow-lg"
    >
      <p role="status" className="mr-auto text-sm font-medium tabular-nums">
        {count} selected
      </p>
      <Button variant="secondary" onClick={onRetag} disabled={!allMine} title={mineOnly}>
        <Tag className="size-4" aria-hidden /> Retag
      </Button>
      {canShare && (
        <Button variant="secondary" onClick={onShare} disabled={!allMine} title={mineOnly}>
          <Share2 className="size-4" aria-hidden /> Share
        </Button>
      )}
      <Button variant="secondary" onClick={onAddToQuiz}>
        <ListPlus className="size-4" aria-hidden /> Add to quiz
      </Button>
      {!allMine && (
        <Button variant="secondary" onClick={onCopy}>
          <Copy className="size-4" aria-hidden /> Copy to my bank
        </Button>
      )}
      <Button variant="danger" onClick={onDelete} disabled={!allMine} title={mineOnly}>
        <Trash2 className="size-4" aria-hidden /> Delete
      </Button>
      <Button variant="ghost" onClick={onClear} aria-label="Clear selection">
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
