"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type KeyboardCoordinateGetter,
  type Over,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { AssetImage } from "./asset-image";
import { Markdown } from "./markdown";

// Marks everything the student drags on: the exam's integrity rules block dragging text and files in from
// outside the page, and leave drags that start inside an element with this attribute alone.
export const dndAnswerAttribute = "data-dnd-answer";

const arrows: Record<string, true> = {
  [KeyboardCode.Down]: true,
  [KeyboardCode.Up]: true,
  [KeyboardCode.Left]: true,
  [KeyboardCode.Right]: true,
};

// Keyboard dragging: an arrow key jumps the lifted card to the nearest drop area in that direction (the
// default moves it by a few pixels, which never reaches the next area on a long page).
const jumpToDropArea: KeyboardCoordinateGetter = (event, { context: { active, collisionRect, droppableRects, droppableContainers } }) => {
  if (!arrows[event.code]) return undefined;
  event.preventDefault();
  if (!active || !collisionRect) return undefined;
  const cx = collisionRect.left + collisionRect.width / 2;
  const cy = collisionRect.top + collisionRect.height / 2;
  let best: { x: number; y: number; score: number } | undefined;
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const dx = rect.left + rect.width / 2 - cx;
    const dy = rect.top + rect.height / 2 - cy;
    // Only areas that lie in the pressed direction, those on the same row or column first.
    const along = event.code === KeyboardCode.Down ? dy : event.code === KeyboardCode.Up ? -dy : event.code === KeyboardCode.Right ? dx : -dx;
    if (along <= 1) continue;
    const across = event.code === KeyboardCode.Down || event.code === KeyboardCode.Up ? Math.abs(dx) : Math.abs(dy);
    const score = along + across * 2;
    if (!best || score < best.score) {
      best = { x: rect.left + rect.width / 2 - collisionRect.width / 2, y: rect.top + rect.height / 2 - collisionRect.height / 2, score };
    }
  }
  return best && { x: best.x, y: best.y };
};

// Mouse drags after a few pixels (so a plain click still works). Touch needs a short press first, so that
// scrolling a long page with a finger doesn't pick a card up. Space lifts a card with the keyboard, the arrow
// keys move it between the drop areas, Space drops it and Escape puts it back.
export function useDragSensors(coordinateGetter: KeyboardCoordinateGetter = jumpToDropArea) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter,
      keyboardCodes: {
        start: [KeyboardCode.Space, KeyboardCode.Enter],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space, KeyboardCode.Enter],
      },
    }),
  );
}

export const dragInstructions: ScreenReaderInstructions = {
  draggable:
    "To pick up an item, press space or enter. Use the arrow keys to move it to another place, then press space or enter to drop it. Press escape to cancel.",
};

// Screen reader announcements. `item` names what is dragged and `place` names a drop area; both get the
// ids the page gave to its draggables and drop areas.
export function buildAnnouncements(names: {
  item: (id: UniqueIdentifier) => string;
  place: (id: UniqueIdentifier) => string;
}): Announcements {
  return {
    onDragStart: ({ active }) => `Picked up ${names.item(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${names.item(active.id)} is over ${names.place(over.id)}.` : `${names.item(active.id)} is not over a place.`,
    onDragEnd: ({ active, over }) =>
      over ? `Dropped ${names.item(active.id)} on ${names.place(over.id)}.` : `Dropped ${names.item(active.id)}. It stays where it was.`,
    onDragCancel: ({ active }) => `Cancelled. ${names.item(active.id)} stays where it was.`,
  };
}

// A drag area: the sensors, announcements and the floating copy of the card under the pointer. `onDrop` gets
// the dragged card and the drop area it was released on (null when released elsewhere).
export function DndArea({
  names,
  onDrop,
  overlay,
  className,
  children,
}: {
  names: Parameters<typeof buildAnnouncements>[0];
  onDrop: (active: Active, over: Over | null) => void;
  overlay: (activeId: UniqueIdentifier) => ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const sensors = useDragSensors();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements: buildAnnouncements(names), screenReaderInstructions: dragInstructions }}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragEnd={({ active, over }) => {
        setActiveId(null);
        onDrop(active, over);
      }}
      onDragCancel={() => setActiveId(null)}
    >
      <div {...{ [dndAnswerAttribute]: "" }} className={className}>
        {children}
      </div>
      <DragOverlay>{activeId !== null ? overlay(activeId) : null}</DragOverlay>
    </DndContext>
  );
}

// What a card shows: markdown text and/or a picture.
export function CardFace({
  text,
  imageId,
  alt,
  assetUrls,
}: {
  text: string;
  imageId?: string;
  alt?: string;
  assetUrls: Record<string, string>;
}) {
  return (
    <div className="min-w-0 space-y-1 text-left text-sm">
      {text.trim() !== "" && (
        <Markdown inline assetUrls={assetUrls}>
          {text}
        </Markdown>
      )}
      {imageId && <AssetImage id={imageId} alt={alt ?? ""} assetUrls={assetUrls} className="max-h-24" />}
    </div>
  );
}

const cardClass =
  "cursor-grab touch-manipulation select-none rounded-lg border border-border bg-surface px-3 py-2 shadow-xs hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:cursor-grabbing [-webkit-touch-callout:none] [&_img]:[-webkit-user-drag:none]";

// The look of the card that floats under the pointer.
export const overlayCardClass = clsx(cardClass, "cursor-grabbing border-primary shadow-lg");

// A card that can be picked up. `label` is what a screen reader says for it.
export function DragCard({
  id,
  label,
  className,
  children,
}: {
  id: UniqueIdentifier;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      className={clsx(cardClass, isDragging && "opacity-40", className)}
    >
      {children}
    </div>
  );
}

// Somewhere a card can be dropped. `over` styles it while a card is held above it.
export function DropArea({
  id,
  label,
  className,
  overClassName = "border-primary bg-primary-soft",
  children,
}: {
  id: UniqueIdentifier;
  label: string;
  className?: string;
  overClassName?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} role="group" aria-label={label} className={clsx(className, isOver && overClassName)}>
      {children}
    </div>
  );
}
