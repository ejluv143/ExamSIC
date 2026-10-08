"use client";

import clsx from "clsx";
import { useState } from "react";
import { Button, inputBase } from "@/components/ui";
import type { DrawingQuestion, Question } from "@examora/contract";
import { ImageField, type PickedImage } from "../image-field";
import { Check2 } from "./shared";
import { RubricEditor } from "./essay";

export const canvasPresets = [
  [800, 600],
  [1000, 700],
  [600, 600],
] as const;
export const canvasMin = 200;
export const canvasMax = 2000;

// A canvas side in pixels. Keeps what was typed until it is a whole number from 200 to 2000.
export function SizeInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const n = draft === null || draft.trim() === "" ? NaN : Number(draft);
  const invalid = draft !== null && !(Number.isInteger(n) && n >= canvasMin && n <= canvasMax);
  return (
    <span className="inline-flex flex-col">
      <input
        type="number"
        inputMode="numeric"
        min={canvasMin}
        max={canvasMax}
        step={1}
        value={draft ?? String(value)}
        aria-label={label}
        aria-invalid={invalid}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = e.target.value.trim() === "" ? NaN : Number(e.target.value);
          if (Number.isInteger(next) && next >= canvasMin && next <= canvasMax) onChange(next);
        }}
        onBlur={() => setDraft(null)}
        className={clsx(inputBase, "w-24 py-1", invalid && "border-danger")}
      />
      {invalid && <span className="text-xs text-danger">{canvasMin} to {canvasMax}.</span>}
    </span>
  );
}

// A drawing question: an optional picture to draw on, how students may answer, the canvas size and the rubric.
export function DrawingEditor({ q, onChange }: { q: DrawingQuestion; onChange: (q: Question) => void }) {
  // At least one way to answer stays on.
  const setDraw = (allowDraw: boolean) => onChange({ ...q, allowDraw, ...(allowDraw ? {} : { allowUpload: true }) });
  const setUpload = (allowUpload: boolean) =>
    onChange({ ...q, allowUpload, ...(allowUpload ? {} : { allowDraw: true, cameraOnly: false }) });
  const setBackground = ({ imageId, alt }: PickedImage) => {
    const next = Object.fromEntries(
      Object.entries(q).filter(([key]) => key !== "backgroundImageId" && key !== "backgroundAlt"),
    ) as unknown as DrawingQuestion; // only the two optional background keys were dropped
    onChange(imageId === undefined ? next : { ...next, backgroundImageId: imageId, backgroundAlt: alt ?? "" });
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Background image (optional)</p>
        <p className="text-xs text-muted">Students draw on top of it, e.g. a diagram to label or a grid to plot on.</p>
        <ImageField imageId={q.backgroundImageId} alt={q.backgroundAlt} onChange={setBackground} label="the background image" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">How students answer</p>
        <Check2 checked={q.allowDraw} onChange={setDraw}>
          Students can draw
        </Check2>
        <Check2 checked={q.allowUpload} onChange={setUpload}>
          Students can upload or take photos
        </Check2>
        {q.allowUpload && (
          <div className="ml-6">
            <Check2
              checked={q.cameraOnly}
              onChange={(cameraOnly) => onChange({ ...q, cameraOnly })}
              hint="Students must take the photo with the camera, not pick one from their gallery."
            >
              Camera only
            </Check2>
          </div>
        )}
      </div>
      {q.allowDraw && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Canvas size (pixels)</p>
          <div className="flex flex-wrap items-start gap-2">
            {canvasPresets.map(([w, h]) => (
              <Button
                key={`${w}x${h}`}
                variant={q.canvasWidth === w && q.canvasHeight === h ? "primary" : "secondary"}
                className="py-1 text-xs"
                onClick={() => onChange({ ...q, canvasWidth: w, canvasHeight: h })}
              >
                {w} × {h}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-start gap-2 text-sm">
            <SizeInput value={q.canvasWidth} label="Canvas width" onChange={(canvasWidth) => onChange({ ...q, canvasWidth })} />
            <span className="pt-1.5 text-muted">×</span>
            <SizeInput value={q.canvasHeight} label="Canvas height" onChange={(canvasHeight) => onChange({ ...q, canvasHeight })} />
          </div>
        </div>
      )}
      <RubricEditor q={q} onChange={onChange} />
    </div>
  );
}
