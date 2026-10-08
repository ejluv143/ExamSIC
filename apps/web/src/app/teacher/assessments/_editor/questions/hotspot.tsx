"use client";

import clsx from "clsx";
import { Circle, Square, Trash2 } from "lucide-react";
import { useContext, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { HotspotQuestion, HotspotRegion, HotspotShape, Marker, Question } from "@examora/contract";
import { RegionLabels, RegionShapes } from "@/components/hotspot-view";
import { Button, inputBase, inputClass } from "@/components/ui";
import { useAssetUrls } from "@/lib/use-asset-urls";
import { EditorAssetUrls, ImageField, type PickedImage } from "../image-field";
import { newId } from "./shared";

// The smallest a region may be, in image widths or heights, and how far it is nudged by the arrow keys.
const minSize = 0.01;
const nudge = 0.005;
const nudgeBig = 0.02;
const maxTolerance = 0.1;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const regionName = (r: HotspotRegion, i: number) => r.label?.trim() || `Area ${i + 1}`;

type Gesture =
  | { kind: "draw"; id: string; origin: Marker; shape: HotspotShape; created: boolean }
  | { kind: "move"; id: string; origin: Marker; from: HotspotRegion }
  | { kind: "resize"; id: string; fixed: Marker };

// A number in percent that keeps what was typed until it is valid, then reports it as a fraction.
function PercentInput({
  label,
  value,
  onChange,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (fraction: number) => void;
  max?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const n = draft === null || draft.trim() === "" ? NaN : Number(draft);
  const invalid = draft !== null && !(n >= 0 && n <= max);
  return (
    <label className="flex items-center gap-1 text-xs text-muted">
      {label}
      <input
        type="number"
        min={0}
        max={max}
        step={0.5}
        value={draft ?? String(round1(value * 100))}
        aria-invalid={invalid}
        onChange={(e) => {
          setDraft(e.target.value);
          const typed = Number(e.target.value);
          if (e.target.value.trim() !== "" && typed >= 0 && typed <= max) onChange(typed / 100);
        }}
        onBlur={() => setDraft(null)}
        className={clsx(inputBase, "w-20 py-1", invalid && "border-danger")}
      />
    </label>
  );
}

// A hotspot question: the picture, the correct areas drawn on it, how many clicks students get and how close
// a click may be to an area. Draw an area by dragging on the picture; drag an area to move it and its corners to resize it.
// Keyboard: Tab to an area, arrow keys move it (Shift = bigger steps), Alt + arrow keys resize it, Delete removes it.
export function HotspotEditor({ q, onChange }: { q: HotspotQuestion; onChange: (q: Question) => void }) {
  const initial = useContext(EditorAssetUrls);
  const { urls } = useAssetUrls(initial, q.imageId ? [q.imageId] : []);
  const url = q.imageId ? urls[q.imageId] : undefined;
  const canvas = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [tool, setTool] = useState<HotspotShape>("rect");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The regions changed: the clicks allowed never exceed their number.
  const withRegions = (regions: HotspotRegion[]): HotspotQuestion => ({
    ...q,
    regions,
    maxClicks: clamp(q.maxClicks, 1, Math.max(1, regions.length)),
  });
  const setRegions = (regions: HotspotRegion[]) => onChange(withRegions(regions));
  const patch = (id: string, change: Partial<HotspotRegion>) =>
    setRegions(q.regions.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const remove = (id: string) => {
    setRegions(q.regions.filter((r) => r.id !== id));
    setSelectedId(null);
  };
  const setImage = ({ imageId, alt }: PickedImage) => onChange({ ...q, imageId: imageId ?? "", alt: alt ?? "" });

  const pointAt = (e: { clientX: number; clientY: number }): Marker => {
    const box = canvas.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - box.left) / box.width, 0, 1), y: clamp((e.clientY - box.top) / box.height, 0, 1) };
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.target instanceof Element ? e.target : null;
    const origin = pointAt(e);
    const handle = target?.closest<HTMLElement>("[data-handle]");
    const body = target?.closest<HTMLElement>("[data-region]");
    const region = body ? q.regions.find((r) => r.id === body.dataset.region) : undefined;
    if (handle && region) {
      // Dragging a corner: the opposite corner stays where it is.
      const h = handle.dataset.handle!;
      gesture.current = {
        kind: "resize",
        id: region.id,
        fixed: { x: h.includes("w") ? region.x + region.w : region.x, y: h.includes("n") ? region.y + region.h : region.y },
      };
    } else if (region) {
      gesture.current = { kind: "move", id: region.id, origin, from: region };
      setSelectedId(region.id);
    } else {
      gesture.current = { kind: "draw", id: newId(), origin, shape: tool, created: false };
      setSelectedId(null);
    }
    canvas.current!.setPointerCapture(e.pointerId);
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = pointAt(e);
    if (g.kind === "move") {
      const x = clamp(g.from.x + p.x - g.origin.x, 0, 1 - g.from.w);
      const y = clamp(g.from.y + p.y - g.origin.y, 0, 1 - g.from.h);
      patch(g.id, { x, y });
      return;
    }
    const from = g.kind === "draw" ? g.origin : g.fixed;
    // Keep at least the minimum size on each axis, on whichever side of the fixed corner the pointer is.
    const edge = (fixed: number, at: number) => (Math.abs(at - fixed) >= minSize ? at : clamp(fixed + (at < fixed ? -minSize : minSize), 0, 1));
    const to = { x: edge(from.x, p.x), y: edge(from.y, p.y) };
    const box = {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      w: Math.abs(to.x - from.x),
      h: Math.abs(to.y - from.y),
    };
    if (g.kind === "resize") {
      patch(g.id, box);
      return;
    }
    if (box.w < minSize || box.h < minSize) return;
    if (g.created) patch(g.id, box);
    else {
      g.created = true;
      setRegions([...q.regions, { id: g.id, shape: g.shape, ...box }]);
      setSelectedId(g.id);
    }
  };

  const up = () => {
    gesture.current = null;
  };

  const key = (e: KeyboardEvent<HTMLDivElement>, r: HotspotRegion) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(r.id);
      return;
    }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const step = e.shiftKey ? nudgeBig : nudge;
    if (e.altKey) {
      patch(r.id, { w: clamp(r.w + d[0]! * step, minSize, 1 - r.x), h: clamp(r.h + d[1]! * step, minSize, 1 - r.y) });
    } else {
      patch(r.id, { x: clamp(r.x + d[0]! * step, 0, 1 - r.w), y: clamp(r.y + d[1]! * step, 0, 1 - r.h) });
    }
  };

  const tolerance = q.tolerance;
  const widened = q.regions.map((r) => ({ ...r, x: r.x - tolerance, y: r.y - tolerance, w: r.w + 2 * tolerance, h: r.h + 2 * tolerance }));
  const selected = q.regions.find((r) => r.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Image</p>
        <p className="text-xs text-muted">Students click on this picture. Replacing it keeps the areas you have drawn.</p>
        <ImageField imageId={q.imageId || undefined} alt={q.alt} onChange={setImage} label="the hotspot image" />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Correct areas</p>
        <p className="text-xs text-muted">
          Choose a shape, then drag on the picture to draw an area. Drag an area to move it and its corners to resize it. With a keyboard, Tab to an area and use
          the arrow keys to move it (Shift for bigger steps), Alt with the arrow keys to resize it and Delete to remove it.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Shape to draw">
          <Button variant={tool === "rect" ? "primary" : "secondary"} className="py-1 text-xs" aria-pressed={tool === "rect"} onClick={() => setTool("rect")}>
            <Square className="size-3.5" /> Rectangle
          </Button>
          <Button variant={tool === "ellipse" ? "primary" : "secondary"} className="py-1 text-xs" aria-pressed={tool === "ellipse"} onClick={() => setTool("ellipse")}>
            <Circle className="size-3.5" /> Ellipse
          </Button>
        </div>
        {q.imageId && url && (
          <div
            ref={canvas}
            className="relative inline-block max-w-full cursor-crosshair touch-none select-none align-top"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={q.alt} draggable={false} className="block h-auto max-w-full rounded-md" />
            {tolerance > 0 && <RegionShapes regions={widened} tint="text-muted" dashed />}
            <RegionShapes regions={q.regions} selectedId={selectedId} />
            <RegionLabels regions={q.regions} />
            {q.regions.map((r, i) => {
              const isSelected = r.id === selectedId;
              return (
                <div
                  key={r.id}
                  data-region={r.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${regionName(r, i)}, ${r.shape === "rect" ? "rectangle" : "ellipse"}. Arrow keys move it, Alt and arrow keys resize it, Delete removes it.`}
                  aria-pressed={isSelected}
                  className={clsx(
                    "absolute cursor-move focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
                    r.shape === "ellipse" && "rounded-[50%]",
                  )}
                  style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                  onFocus={() => setSelectedId(r.id)}
                  onKeyDown={(e) => key(e, r)}
                >
                  {isSelected &&
                    (["nw", "ne", "sw", "se"] as const).map((h) => (
                      <span
                        key={h}
                        data-handle={h}
                        aria-hidden
                        className={clsx(
                          "absolute size-3 rounded-sm border border-white bg-primary",
                          h.includes("n") ? "-top-1.5" : "-bottom-1.5",
                          h.includes("w") ? "-left-1.5" : "-right-1.5",
                          h === "nw" || h === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize",
                        )}
                      />
                    ))}
                </div>
              );
            })}
          </div>
        )}
        {q.imageId && !url && <p className="text-xs text-muted">The picture can&apos;t be shown right now, so areas can&apos;t be drawn on it.</p>}
        {!q.imageId && <p className="text-xs text-muted">Add the image first, then draw the areas on it.</p>}
        {q.imageId && url && q.regions.length === 0 && <p className="text-xs text-warning">Draw at least one area.</p>}

        {q.regions.length > 0 && (
          <ul className="space-y-2">
            {q.regions.map((r, i) => (
              <li
                key={r.id}
                className={clsx("space-y-2 rounded-lg p-2", r.id === selectedId ? "bg-primary-soft" : "bg-surface-muted/60")}
                onFocus={() => setSelectedId(r.id)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-6 text-center text-sm font-medium">{i + 1}</span>
                  <input
                    value={r.label ?? ""}
                    onChange={(e) => patch(r.id, { label: e.target.value })}
                    placeholder={`Name (optional), e.g. ${regionName({ ...r, label: undefined }, i)}`}
                    aria-label={`Name of area ${i + 1}`}
                    className={clsx(inputClass, "min-w-40 flex-1")}
                  />
                  <div className="flex gap-1" role="group" aria-label={`Shape of area ${i + 1}`}>
                    <Button
                      variant={r.shape === "rect" ? "primary" : "secondary"}
                      className="p-1.5"
                      aria-label="Rectangle"
                      aria-pressed={r.shape === "rect"}
                      onClick={() => patch(r.id, { shape: "rect" })}
                    >
                      <Square className="size-3.5" />
                    </Button>
                    <Button
                      variant={r.shape === "ellipse" ? "primary" : "secondary"}
                      className="p-1.5"
                      aria-label="Ellipse"
                      aria-pressed={r.shape === "ellipse"}
                      onClick={() => patch(r.id, { shape: "ellipse" })}
                    >
                      <Circle className="size-3.5" />
                    </Button>
                  </div>
                  <Button variant="danger" className="p-1.5" aria-label={`Delete area ${i + 1}`} onClick={() => remove(r.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {r.id === selected?.id && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    <PercentInput label="Left %" value={r.x} max={(1 - r.w) * 100} onChange={(x) => patch(r.id, { x })} />
                    <PercentInput label="Top %" value={r.y} max={(1 - r.h) * 100} onChange={(y) => patch(r.id, { y })} />
                    <PercentInput label="Width %" value={r.w} max={(1 - r.x) * 100} onChange={(w) => patch(r.id, { w: Math.max(w, minSize) })} />
                    <PercentInput label="Height %" value={r.h} max={(1 - r.y) * 100} onChange={(h) => patch(r.id, { h: Math.max(h, minSize) })} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
            Clicks allowed
            <input
              type="number"
              min={1}
              max={Math.max(1, q.regions.length)}
              step={1}
              value={q.maxClicks}
              disabled={q.regions.length === 0}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                if (Number.isFinite(n)) onChange({ ...q, maxClicks: clamp(n, 1, Math.max(1, q.regions.length)) });
              }}
              className={clsx(inputBase, "w-20 py-1")}
            />
          </label>
          <p className="text-xs text-muted">
            How many markers a student may place, from 1 to the number of areas. Each area is worth an equal share, and one marker can only count for areas it is inside.
          </p>
        </div>
        <div className="space-y-1">
          <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
            Tolerance
            <input
              type="range"
              min={0}
              max={maxTolerance * 100}
              step={0.5}
              value={round1(tolerance * 100)}
              onChange={(e) => onChange({ ...q, tolerance: clamp(Number(e.target.value) / 100, 0, maxTolerance) })}
              className="w-48 max-w-full accent-primary"
            />
            <span className="w-12 text-sm font-normal tabular-nums">{round1(tolerance * 100)}%</span>
          </label>
          <p className="text-xs text-muted">
            How far outside an area a click still counts, as a percentage of the picture&apos;s size. The dashed outline on the picture shows the widened areas. Use a little for small areas or touch screens.
          </p>
        </div>
      </div>
    </div>
  );
}
