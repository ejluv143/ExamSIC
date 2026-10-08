"use client";

import clsx from "clsx";
import { Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { encodeHotspotAnswer, parseHotspotAnswer, type Marker, type StudentHotspotQuestion } from "@examora/contract";
import { AssetImage } from "./asset-image";
import { Button } from "./ui";

// A tap or click moves less than this many pixels; a longer movement is a scroll or a drag and places nothing.
const tapSlop = 8;
// How close (in image widths) the keyboard crosshair must be to a marker for Enter to remove that marker.
const grabRadius = 0.03;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const percent = (n: number) => Math.round(n * 100);

// "Click the right spot" answer: click or tap the picture to drop numbered markers (up to `maxClicks`).
// Tap a marker, or use its Remove button, to take it off; drag a marker to move it.
// Keyboard: Tab to the picture, move the crosshair with the arrow keys (Shift = bigger steps), press Enter or Space to
// place a marker at the crosshair (or remove the marker it is on), Backspace or Delete removes the last marker.
export function HotspotAnswer({
  q,
  value,
  onChange,
  assetUrls,
}: {
  q: StudentHotspotQuestion;
  value: string | undefined;
  onChange: (v: string | null) => void;
  assetUrls: Record<string, string>;
}) {
  const stored = useMemo(() => parseHotspotAnswer(value).slice(0, q.maxClicks), [value, q.maxClicks]);
  const area = useRef<HTMLDivElement>(null);
  // The marker being dragged and where it is now; the answer changes when it is dropped.
  const [drag, setDrag] = useState<{ index: number; at: Marker } | null>(null);
  const press = useRef<{ id: number; x: number; y: number } | null>(null);
  const [crosshair, setCrosshair] = useState<Marker | null>(null);
  const [message, setMessage] = useState("");
  const [full, setFull] = useState(false);
  const markers = drag ? stored.map((m, i) => (i === drag.index ? drag.at : m)) : stored;
  const atLimit = stored.length >= q.maxClicks;

  const commit = (next: Marker[], said: string) => {
    onChange(encodeHotspotAnswer(next));
    setMessage(said);
    setFull(false);
  };
  const place = (at: Marker) => {
    if (atLimit) {
      setFull(true);
      setMessage("Remove a marker to place another.");
      return;
    }
    commit([...stored, at], `Marker ${stored.length + 1} placed. ${stored.length + 1} of ${q.maxClicks} markers.`);
  };
  const remove = (index: number) =>
    commit(
      stored.filter((_, i) => i !== index),
      `Marker ${index + 1} removed. ${stored.length - 1} of ${q.maxClicks} markers.`,
    );

  const pointAt = (e: { clientX: number; clientY: number }): Marker => {
    const box = area.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - box.left) / box.width), y: clamp01((e.clientY - box.top) / box.height) };
  };

  // Placing: the pointer must come up close to where it went down, so scrolling never drops a marker.
  const areaDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && !(e.target instanceof HTMLImageElement)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const areaUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = press.current;
    press.current = null;
    if (!start || start.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > tapSlop) return;
    setCrosshair(null);
    place(pointAt(e));
  };

  // Moving or removing a marker.
  const markerDown = (e: PointerEvent<HTMLButtonElement>, index: number) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setDrag({ index, at: stored[index]! });
  };
  const markerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const start = press.current;
    if (!drag || !start || start.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) <= tapSlop && drag.at === stored[drag.index]) return;
    setDrag({ index: drag.index, at: pointAt(e) });
  };
  const markerUp = (e: PointerEvent<HTMLButtonElement>, index: number) => {
    const start = press.current;
    press.current = null;
    if (!drag || !start || start.id !== e.pointerId) return;
    setDrag(null);
    if (drag.at === stored[index]) remove(index); // pressed and released in place: a tap
    else commit(stored.map((m, i) => (i === index ? drag.at : m)), `Marker ${index + 1} moved.`);
  };
  const markerKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(index);
    }
  };

  const areaKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const step = e.shiftKey ? 0.05 : 0.01;
    const at = crosshair ?? stored.at(-1) ?? { x: 0.5, y: 0.5 };
    const moves: Record<string, Marker> = {
      ArrowLeft: { x: at.x - step, y: at.y },
      ArrowRight: { x: at.x + step, y: at.y },
      ArrowUp: { x: at.x, y: at.y - step },
      ArrowDown: { x: at.x, y: at.y + step },
    };
    const moved = moves[e.key];
    if (moved) {
      e.preventDefault();
      const next = { x: clamp01(moved.x), y: clamp01(moved.y) };
      setCrosshair(next);
      setMessage(`Crosshair at ${percent(next.x)} percent across, ${percent(next.y)} percent down.`);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const target = crosshair ?? at;
      const near = stored.findIndex((m) => Math.hypot(m.x - target.x, m.y - target.y) <= grabRadius);
      if (near >= 0) remove(near);
      else place(target);
    } else if ((e.key === "Delete" || e.key === "Backspace") && stored.length > 0) {
      e.preventDefault();
      remove(stored.length - 1);
    }
  };

  const url = assetUrls[q.imageId];
  if (!url) return <AssetImage id={q.imageId} alt={q.alt} assetUrls={assetUrls} />;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted" id={`hotspot-help-${q.imageId}`}>
        {q.maxClicks === 1 ? "Click or tap the picture to mark the spot." : `Click or tap the picture to place up to ${q.maxClicks} markers.`} Tap a marker to
        remove it, or drag it to move it. With a keyboard, focus the picture, move the crosshair with the arrow keys (Shift for bigger steps) and press Enter to
        place or remove a marker; Backspace removes the last one.
      </p>
      <div
        ref={area}
        role="group"
        tabIndex={0}
        aria-label={`${q.alt}. Picture to mark. ${stored.length} of ${q.maxClicks} markers placed.`}
        aria-describedby={`hotspot-help-${q.imageId}`}
        className="relative inline-block max-w-full cursor-crosshair select-none rounded-md align-top focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onPointerDown={areaDown}
        onPointerUp={areaUp}
        onPointerCancel={() => (press.current = null)}
        onKeyDown={areaKey}
        onFocus={(e) => {
          if (e.target === e.currentTarget && e.currentTarget.matches(":focus-visible")) setCrosshair(stored.at(-1) ?? { x: 0.5, y: 0.5 });
        }}
        onBlur={(e) => {
          if (e.target === e.currentTarget) setCrosshair(null);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" draggable={false} className="block h-auto max-w-full rounded-md" />
        {markers.map((m, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Marker ${i + 1} at ${percent(m.x)} percent across, ${percent(m.y)} percent down. Press to remove.`}
            className={clsx(
              "absolute grid size-8 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center rounded-full border-2 border-white bg-primary text-xs font-bold text-primary-foreground shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              drag?.index === i ? "cursor-grabbing" : "cursor-grab",
            )}
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
            onPointerDown={(e) => markerDown(e, i)}
            onPointerMove={markerMove}
            onPointerUp={(e) => markerUp(e, i)}
            onPointerCancel={() => {
              press.current = null;
              setDrag(null);
            }}
            onKeyDown={(e) => markerKey(e, i)}
          >
            {i + 1}
          </button>
        ))}
        {crosshair && (
          <span
            aria-hidden
            className="pointer-events-none absolute size-8 -translate-x-1/2 -translate-y-1/2 text-primary"
            style={{ left: `${crosshair.x * 100}%`, top: `${crosshair.y * 100}%` }}
          >
            <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-current ring-1 ring-white" />
            <span className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-current ring-1 ring-white" />
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">
          Markers: {stored.length} of {q.maxClicks}
        </span>
        {stored.map((_, i) => (
          <Button key={i} variant="secondary" className="py-0.5 text-xs" aria-label={`Remove marker ${i + 1}`} onClick={() => remove(i)}>
            <Trash2 className="size-3.5" /> {i + 1}
          </Button>
        ))}
        {stored.length > 1 && (
          <Button variant="ghost" className="py-0.5 text-xs" onClick={() => commit([], "All markers removed.")}>
            Clear all
          </Button>
        )}
      </div>
      {full && <p className="text-xs text-warning">Remove a marker to place another.</p>}
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  );
}
