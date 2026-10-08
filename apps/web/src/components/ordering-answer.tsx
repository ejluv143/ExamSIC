"use client";

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { StudentOrderingQuestion } from "@examora/contract";
import clsx from "clsx";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useMemo } from "react";
import { AssetImage } from "./asset-image";
import { Markdown } from "./markdown";

type Item = StudentOrderingQuestion["items"][number];

// A readable name for announcements: the item's text without markdown marks, else its picture's description.
function label(item: Item, position: number) {
  const text = item.text.replace(/[*_`#>~[\]()!]/g, "").replace(/\s+/g, " ").trim();
  return text || item.alt || `item ${position}`;
}

function SortableCard({
  item,
  index,
  count,
  assetUrls,
  onMove,
}: {
  item: Item;
  index: number;
  count: number;
  assetUrls: Record<string, string>;
  onMove: (from: number, to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const name = label(item, index + 1);
  const move = "rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx(
        "flex items-center gap-2 rounded-lg border border-border bg-surface p-2",
        isDragging && "relative z-10 border-primary shadow-lg",
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold tabular-nums">
        {index + 1}
      </span>
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${name}, position ${index + 1} of ${count}`}
        className="shrink-0 cursor-grab touch-none rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:cursor-grabbing"
      >
        <GripVertical className="size-5" aria-hidden />
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <Markdown inline assetUrls={assetUrls}>
          {item.text}
        </Markdown>
        {item.imageId && <AssetImage id={item.imageId} alt={item.alt ?? ""} assetUrls={assetUrls} className="max-h-32" />}
      </div>
      <div className="flex shrink-0 flex-col sm:flex-row">
        <button
          type="button"
          className={move}
          disabled={index === 0}
          onClick={() => onMove(index, index - 1)}
          aria-label={`Move ${name} up`}
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className={move}
          disabled={index === count - 1}
          onClick={() => onMove(index, index + 1)}
          aria-label={`Move ${name} down`}
        >
          <ArrowDown className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}

// Re-ordering: the items in a sortable list. The order shown is the student's saved order when it is a full
// permutation of the items, else the order they arrive in (already shuffled by the API). `onChange` only fires
// when the student actually moves something.
export function OrderingAnswer({
  q,
  value,
  onChange,
  assetUrls,
}: {
  q: StudentOrderingQuestion;
  value: string[] | undefined;
  onChange: (v: string[]) => void;
  assetUrls: Record<string, string>;
}) {
  const items = useMemo(() => {
    const byId = new Map(q.items.map((i) => [i.id, i]));
    if (value && value.length === q.items.length && new Set(value).size === value.length && value.every((id) => byId.has(id)))
      return value.map((id) => byId.get(id)!);
    return [...q.items];
  }, [q.items, value]);
  const ids = items.map((i) => i.id);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // A short press before a touch drags, so swiping on the page still scrolls it.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return;
    onChange(arrayMove(ids, from, to));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  }

  const nameOf = (id: string | number) => {
    const i = ids.indexOf(String(id));
    return label(items[i] ?? { id: "", text: "" }, i + 1);
  };
  const place = (id: string | number) => `position ${ids.indexOf(String(id)) + 1} of ${ids.length}`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up '${nameOf(active.id)}', ${place(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `'${nameOf(active.id)}' is over ${place(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) =>
      over ? `Item '${nameOf(active.id)}' moved to ${place(over.id)}.` : `'${nameOf(active.id)}' dropped, back at ${place(active.id)}.`,
    onDragCancel: ({ active }) => `Move cancelled. '${nameOf(active.id)}' is back at ${place(active.id)}.`,
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">Drag the items into the correct order</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To pick up an item, press space or enter. Use the up and down arrow keys to move it, then press space or enter to drop it, or escape to cancel. The move up and move down buttons also work.",
          },
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2" aria-label="Items to put in order">
            {items.map((item, i) => (
              <SortableCard key={item.id} item={item} index={i} count={items.length} assetUrls={assetUrls} onMove={move} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}
