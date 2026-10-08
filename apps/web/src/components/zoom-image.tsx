"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";

const maxZoom = 8;
const step = 1.25;

type View = { z: number; x: number; y: number };
const home: View = { z: 1, x: 0, y: 0 };

// Content you can zoom (buttons or the mouse wheel) and drag around. The pane keeps the content's size at 100%, so
// a picture is first seen whole. Content that handles its own pointer input (the marking canvas) calls
// `stopPropagation` on pointer down so drawing doesn't also drag.
export function ZoomPane({ children }: { children: ReactNode }) {
  const pane = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(home);
  const drag = useRef<{ id: number; x: number; y: number; from: View } | null>(null);

  // The picture can't be dragged out of the pane.
  function clamp(v: View): View {
    const el = pane.current;
    if (!el) return v;
    return {
      z: v.z,
      x: Math.min(0, Math.max(el.clientWidth * (1 - v.z), v.x)),
      y: Math.min(0, Math.max(el.clientHeight * (1 - v.z), v.y)),
    };
  }

  function zoomTo(factor: number, cx: number, cy: number) {
    setView((v) => {
      const z = Math.min(maxZoom, Math.max(1, v.z * factor));
      return clamp({ z, x: cx - ((cx - v.x) * z) / v.z, y: cy - ((cy - v.y) * z) / v.z });
    });
  }

  // The wheel needs a listener that may cancel the page scroll, which React's onWheel can't.
  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomTo(e.deltaY < 0 ? step : 1 / step, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // `zoomTo` only reads the pane and sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const center = () => [(pane.current?.clientWidth ?? 0) / 2, (pane.current?.clientHeight ?? 0) / 2] as const;
  const zoomed = view.z > 1;

  return (
    <div
      ref={pane}
      onPointerDown={(e) => {
        if (!zoomed) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: view };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d?.id === e.pointerId) setView(clamp({ ...d.from, x: d.from.x + e.clientX - d.x, y: d.from.y + e.clientY - d.y }));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      className="relative overflow-hidden rounded-lg border border-border bg-surface-muted"
      style={{ cursor: zoomed ? "grab" : undefined, touchAction: zoomed ? "none" : undefined }}
    >
      <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: "0 0" }}>
        {children}
      </div>
      <div
        className="absolute top-2 right-2 flex gap-1 rounded-md bg-surface/90 p-1 shadow-sm"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => zoomTo(step, ...center())}
          disabled={view.z >= maxZoom}
          className="grid size-7 place-items-center rounded hover:bg-surface-muted disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => zoomTo(1 / step, ...center())}
          disabled={!zoomed}
          className="grid size-7 place-items-center rounded hover:bg-surface-muted disabled:opacity-40"
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          title="Reset zoom"
          aria-label="Reset zoom"
          onClick={() => setView(home)}
          disabled={!zoomed}
          className="grid size-7 place-items-center rounded hover:bg-surface-muted disabled:opacity-40"
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

// A photo or picture shown whole, with zoom.
export function ZoomImage({ url, alt }: { url: string; alt: string }) {
  return (
    <ZoomPane>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} draggable={false} className="block w-full select-none" />
    </ZoomPane>
  );
}
