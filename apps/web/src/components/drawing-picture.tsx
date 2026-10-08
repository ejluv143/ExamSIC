"use client";

import type { Stroke } from "@examora/contract";
import { DrawingSurface } from "./drawing-canvas";

// A student's drawing as the teacher and the student see it afterwards: the picture the student's canvas was
// exported to, or, when none was uploaded, the question's background with the saved strokes painted on it. The
// teacher's marks are painted over that. With `onMarks` the marks can be drawn (while `marking`; otherwise the
// picture can be zoomed and dragged).
export function DrawingPicture({
  width,
  height,
  pictureUrl,
  strokes,
  background,
  marks,
  onMarks,
  marking = false,
  label,
}: {
  width: number;
  height: number;
  pictureUrl?: string;
  strokes: readonly Stroke[];
  background?: { url: string; alt: string };
  marks: readonly Stroke[];
  onMarks?: (next: Stroke[]) => void;
  marking?: boolean;
  label: string;
}) {
  return (
    <DrawingSurface
      width={width}
      height={height}
      strokes={marks}
      onStrokes={marking ? onMarks : undefined}
      background={pictureUrl ? { url: pictureUrl, alt: label } : background}
      underlay={pictureUrl ? undefined : strokes}
      marks
      zoomable
      label={label}
    />
  );
}
