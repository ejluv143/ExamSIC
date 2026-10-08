"use client";

import { Fragment, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import clsx from "clsx";
import { Eraser, Highlighter, Pencil, Redo2, Trash2, Type, Undo2 } from "lucide-react";
import { ZoomPane } from "./zoom-image";
import { maxStrokePoints, maxStrokes, type Stroke, type StrokeTool } from "@examora/contract";
import {
  containRect,
  markColors,
  paintStroke,
  paintStrokes,
  penColors,
  prepareCanvas,
  textPx,
  thicknesses,
} from "@/lib/drawing-render";

export type SurfaceHandle = {
  // The drawing (with its background picture, when the browser allows) as a PNG the size of the canvas.
  exportPng: () => Promise<Blob>;
};

const toolIcons = { pen: Pencil, highlighter: Highlighter, eraser: Eraser, text: Type } as const;
const toolLabels: Record<StrokeTool, string> = { pen: "Pen", highlighter: "Highlighter", eraser: "Eraser", text: "Text" };

type Background = { url: string; alt: string };

// A drawing board in canvas units. With `onStrokes` it takes pen, touch and mouse input (smoothed with
// perfect-freehand); without it, it just shows the strokes. `background` is a picture under the strokes (drawn
// into the exported PNG too), `underlay` read-only strokes under the new ones (the student's drawing when the
// teacher marks over it). `marks` selects the teacher's colours and tools.
export function DrawingSurface({
  width,
  height,
  strokes,
  onStrokes,
  background,
  underlay,
  marks = false,
  active = true,
  label,
  ref,
  zoomable = false,
}: {
  width: number;
  height: number;
  strokes: readonly Stroke[];
  onStrokes?: (next: Stroke[]) => void;
  background?: Background;
  underlay?: readonly Stroke[];
  marks?: boolean;
  // false: input passes through to whatever is under (the teacher's zoom pane drags instead of drawing).
  active?: boolean;
  label: string;
  ref?: Ref<SurfaceHandle>;
  // Zoom and drag around the board (the toolbar stays put); drawing only happens while `active`.
  zoomable?: boolean;
}) {
  const Wrap = zoomable ? ZoomPane : Fragment;
  const colors = marks ? markColors : penColors;
  const tools: StrokeTool[] = ["pen", "highlighter", "text", "eraser"];
  const [tool, setTool] = useState<StrokeTool>("pen");
  const [color, setColor] = useState<string>(colors[0]);
  const [size, setSize] = useState<number>(thicknesses[1].size);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [anon, setAnon] = useState(true);

  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const underCanvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement>(null);
  // The committed strokes, painted once, so each pointer move only redraws that and the stroke in progress.
  const base = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<Stroke | null>(null);
  const frame = useRef(0);
  // Clock zero for the strokes' timing: the drawing's first stroke (kept going after a reload).
  const origin = useRef<number | null>(null);
  const readOnly = !onStrokes;
  // The API keeps at most this many strokes and points; stop before it would drop the end of the drawing.
  const pointCount = useMemo(() => strokes.reduce((n, s) => n + s.points.length, 0), [strokes]);
  const full = strokes.length >= maxStrokes || pointCount >= maxStrokePoints - 5000;

  function present() {
    const el = canvas.current;
    const layer = base.current;
    const ctx = el && prepareCanvas(el, width, height);
    if (!el || !ctx || !layer) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    if (live.current) paintStroke(ctx, live.current);
  }

  useEffect(() => {
    base.current ??= document.createElement("canvas");
    const ctx = prepareCanvas(base.current, width, height);
    if (ctx) paintStrokes(ctx, strokes);
    present();
    // `present` only reads refs and the canvas size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, width, height]);

  useEffect(() => {
    const el = underCanvas.current;
    const ctx = el && prepareCanvas(el, width, height);
    if (ctx && underlay) paintStrokes(ctx, underlay);
  }, [underlay, width, height]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  useImperativeHandle(ref, () => ({
    async exportPng() {
      const layer = base.current;
      if (!layer) throw new Error("The drawing isn't ready yet.");
      // The background reloads when its signed link is renewed; give it a moment so it isn't left out.
      const img = image.current;
      if (img && !img.complete)
        await new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
          setTimeout(resolve, 3000);
        });
      const draw = async (withBackground: boolean) => {
        const out = document.createElement("canvas");
        out.width = width;
        out.height = height;
        const ctx = out.getContext("2d");
        if (!ctx) throw new Error("This browser can't save the drawing.");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        if (withBackground && img && img.complete && img.naturalWidth > 0) {
          const r = containRect(img.naturalWidth, img.naturalHeight, width, height);
          ctx.drawImage(img, r.x, r.y, r.w, r.h);
        }
        ctx.drawImage(layer, 0, 0, width, height);
        return new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
      };
      // A background from another origin without CORS taints the canvas and the export throws; the strokes
      // alone are then sent, so the teacher still gets the drawing.
      const blob = await draw(true).catch(() => draw(false));
      if (!blob) throw new Error("This browser can't save the drawing.");
      return blob;
    },
  }));

  const point = (e: React.PointerEvent | PointerEvent): [number, number, number] => {
    const rect = canvas.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * width) / rect.width;
    const y = ((e.clientY - rect.top) * height) / rect.height;
    const pressure = e.pointerType === "mouse" ? 0.5 : e.pressure || 0.5;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pressure * 100) / 100];
  };

  const now = () => {
    if (origin.current === null) {
      const last = strokes.at(-1);
      origin.current = performance.now() - (last ? last.at + last.ms : 0);
    }
    return Math.round(performance.now() - origin.current);
  };

  function commit(stroke: Stroke) {
    if (!onStrokes) return;
    setRedo([]);
    onStrokes([...strokes, stroke]);
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly || !active || (e.pointerType === "mouse" && e.button !== 0) || full) return;
    e.preventDefault();
    // Drawing isn't also a drag of the zoom pane.
    e.stopPropagation();
    const [x, y, p] = point(e);
    if (tool === "text") {
      setTextAt({ x, y });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    live.current = { tool, color, size, points: [[x, y, p]], at: now(), ms: 0 };
    present();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = live.current;
    if (!stroke) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const next = [...stroke.points];
    for (const ev of events.length > 0 ? events : [e.nativeEvent]) {
      const p = point(ev);
      const last = next[next.length - 1];
      // Skip points that barely moved, so a stroke stays small.
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 0.5) next.push(p);
    }
    live.current = { ...stroke, points: next };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(present);
  }

  function onPointerUp() {
    const stroke = live.current;
    if (!stroke) return;
    live.current = null;
    cancelAnimationFrame(frame.current);
    commit({ ...stroke, ms: Math.max(0, now() - stroke.at) });
  }

  function placeText(value: string) {
    const at = textAt;
    setTextAt(null);
    const text = value.trim();
    if (!at || !text) return;
    commit({ tool: "text", color, size, points: [[at.x, at.y, 0.5]], text, at: now(), ms: 0 });
  }

  const undo = () => {
    const last = strokes.at(-1);
    if (!last || !onStrokes) return;
    setRedo((r) => [...r, last]);
    onStrokes(strokes.slice(0, -1));
  };
  const redoStroke = () => {
    const next = redo.at(-1);
    if (!next || !onStrokes) return;
    setRedo((r) => r.slice(0, -1));
    onStrokes([...strokes, next]);
  };
  const clear = () => {
    if (!onStrokes || strokes.length === 0) return;
    // Latest first, so redo brings them back in their original order.
    setRedo((r) => [...r, ...strokes.slice().reverse()]);
    onStrokes([]);
  };

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-muted p-2">
          <div className="flex gap-1" role="group" aria-label="Tool">
            {tools.map((t) => {
              const Icon = toolIcons[t];
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tool === t}
                  title={toolLabels[t]}
                  aria-label={toolLabels[t]}
                  onClick={() => setTool(t)}
                  className={clsx(
                    "grid size-8 place-items-center rounded-md border",
                    tool === t ? "border-primary bg-primary-soft text-primary" : "border-transparent hover:bg-surface",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </button>
              );
            })}
          </div>
          {tool !== "eraser" && (
            <div className="flex items-center gap-1.5" role="group" aria-label="Colour">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={clsx(
                    "size-6 rounded-full border-2",
                    color === c ? "border-primary ring-2 ring-primary/30" : "border-surface",
                  )}
                />
              ))}
            </div>
          )}
          <div className="flex gap-1" role="group" aria-label="Thickness">
            {thicknesses.map((t) => (
              <button
                key={t.size}
                type="button"
                title={t.label}
                aria-label={t.label}
                aria-pressed={size === t.size}
                onClick={() => setSize(t.size)}
                className={clsx(
                  "grid size-8 place-items-center rounded-md border",
                  size === t.size ? "border-primary bg-primary-soft" : "border-transparent hover:bg-surface",
                )}
              >
                <span className="rounded-full bg-foreground" style={{ width: t.size + 3, height: t.size + 3 }} />
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-1">
            <button
              type="button"
              onClick={undo}
              disabled={strokes.length === 0}
              title="Undo"
              aria-label="Undo"
              className="grid size-8 place-items-center rounded-md hover:bg-surface disabled:opacity-40"
            >
              <Undo2 className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={redoStroke}
              disabled={redo.length === 0}
              title="Redo"
              aria-label="Redo"
              className="grid size-8 place-items-center rounded-md hover:bg-surface disabled:opacity-40"
            >
              <Redo2 className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={strokes.length === 0}
              title="Clear"
              aria-label="Clear"
              className="grid size-8 place-items-center rounded-md text-danger hover:bg-surface disabled:opacity-40"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
      <Wrap>
      <div
        ref={box}
        className="relative w-full overflow-hidden rounded-lg border border-border bg-white"
        style={{ aspectRatio: `${width} / ${height}`, maxWidth: readOnly || marks ? undefined : width }}
      >
        {background && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={image}
            src={background.url}
            alt={background.alt}
            crossOrigin={anon ? "anonymous" : undefined}
            // A server without CORS can't be read back into the PNG; show the picture anyway.
            onError={() => setAnon(false)}
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full object-contain select-none"
          />
        )}
        {underlay && <canvas ref={underCanvas} aria-hidden className="pointer-events-none absolute inset-0 size-full" />}
        <canvas
          ref={canvas}
          role="img"
          aria-label={label}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          className={clsx(
            "absolute inset-0 size-full touch-none",
            readOnly || !active ? "pointer-events-none" : tool === "text" ? "cursor-text" : "cursor-crosshair",
          )}
        />
        {textAt && (
          <input
            autoFocus
            maxLength={200}
            aria-label="Text label"
            onBlur={(e) => placeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") {
                e.currentTarget.value = "";
                e.currentTarget.blur();
              }
            }}
            style={{
              left: textAt.x * scale,
              top: textAt.y * scale,
              fontSize: textPx(size) * scale,
              color,
              minWidth: 80,
            }}
            className="absolute rounded border border-dashed border-primary bg-white/80 px-0.5 leading-none outline-none"
          />
        )}
      </div>
      </Wrap>
      {!readOnly && full && (
        <p className="text-xs text-danger">That is as much as one drawing can hold. Undo a stroke to add more.</p>
      )}
    </div>
  );
}
