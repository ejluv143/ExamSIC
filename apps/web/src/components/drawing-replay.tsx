"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Pause, Play, SkipBack } from "lucide-react";
import type { Stroke } from "@examora/contract";
import { replayClock, strokesAt } from "@/lib/drawing-render";
import { Button } from "./ui";
import { DrawingSurface } from "./drawing-canvas";

const speeds = [1, 2, 4, 8];

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Plays back how a drawing was made, stroke by stroke at the pace it was drawn (long pauses cut short).
export function DrawingReplay({
  strokes,
  width,
  height,
  background,
}: {
  strokes: readonly Stroke[];
  width: number;
  height: number;
  background?: { url: string; alt: string };
}) {
  const { starts, total } = useMemo(() => replayClock(strokes), [strokes]);
  const [t, setT] = useState(total);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const head = useRef(total);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let id = requestAnimationFrame(function tick(now) {
      head.current = Math.min(total, head.current + (now - last) * speed);
      last = now;
      setT(head.current);
      if (head.current >= total) setPlaying(false);
      else id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [playing, speed, total]);

  const shown = useMemo(() => strokesAt(strokes, starts, t), [strokes, starts, t]);

  if (strokes.length === 0) return <p className="text-sm text-muted">No strokes were recorded for this drawing.</p>;

  function seek(ms: number) {
    head.current = ms;
    setT(ms);
  }

  return (
    <div className="space-y-3">
      <DrawingSurface width={width} height={height} strokes={shown} background={background} label="Drawing replay" />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          className="px-2 py-1"
          onClick={() => {
            if (!playing && head.current >= total) seek(0);
            setPlaying((p) => !p);
          }}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        </Button>
        <Button
          variant="ghost"
          className="px-2 py-1"
          onClick={() => {
            setPlaying(false);
            seek(0);
          }}
          aria-label="Back to the start"
        >
          <SkipBack className="size-4" aria-hidden />
        </Button>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(total))}
          value={Math.round(t)}
          onChange={(e) => {
            setPlaying(false);
            seek(Number(e.target.value));
          }}
          aria-label="Position in the replay"
          className="min-w-32 flex-1 accent-primary"
        />
        <span className="text-xs text-muted tabular-nums">
          {clock(t)} / {clock(total)}
        </span>
        <div className="flex gap-1" role="group" aria-label="Speed">
          {speeds.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className={clsx(
                "rounded-md border px-2 py-1 text-xs",
                speed === s ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-surface-muted",
              )}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
