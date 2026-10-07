"use client";

import { useState } from "react";
import { Camera, Pencil, PenLine } from "lucide-react";
import { parseDrawingAnswer, type AnswerValue, type Question, type Stroke } from "@examora/contract";
import { AssetImage } from "@/components/asset-image";
import { DrawingPicture } from "@/components/drawing-picture";
import { DrawingReplay } from "@/components/drawing-replay";
import { Badge, Button } from "@/components/ui";
import { ZoomImage } from "@/components/zoom-image";

// A student's drawing answer for grading: the picture full size (zoom with the buttons or the wheel, drag to
// move), marks the teacher can draw over it, a replay of the strokes, and the student's photos.
export function DrawingReview({
  q,
  answer,
  marks,
  onMarks,
  urls,
}: {
  q: Extract<Question, { type: "drawing" }>;
  answer: AnswerValue | null;
  marks: Stroke[];
  onMarks: (marks: Stroke[]) => void;
  urls: Record<string, string>;
}) {
  const drawing = parseDrawingAnswer(answer);
  const [marking, setMarking] = useState(false);
  if (drawing.strokes.length === 0 && !drawing.assetId && drawing.photos.length === 0)
    return (
      <div className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-muted">No answer</div>
    );

  const backgroundUrl = q.backgroundImageId ? urls[q.backgroundImageId] : undefined;
  const background = backgroundUrl ? { url: backgroundUrl, alt: q.backgroundAlt ?? "" } : undefined;
  const hasDrawing = drawing.strokes.length > 0 || !!drawing.assetId;

  return (
    <div className="space-y-4">
      {hasDrawing && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={marking ? "primary" : "secondary"}
              className="px-3 py-1.5 text-xs"
              aria-pressed={marking}
              onClick={() => setMarking((m) => !m)}
            >
              <Pencil className="size-3.5" aria-hidden /> {marking ? "Done marking" : "Mark on the picture"}
            </Button>
            {marks.length > 0 && <Badge tone="info">{marks.length} {marks.length === 1 ? "mark" : "marks"}</Badge>}
            <span className="text-xs text-muted">
              {marking
                ? "Draw over the picture. Your marks are saved with the score, and the student sees them."
                : "Zoom with the buttons or the wheel, and drag to move around."}
            </span>
          </div>
          <DrawingPicture
            width={q.canvasWidth}
            height={q.canvasHeight}
            pictureUrl={drawing.assetId ? urls[drawing.assetId] : undefined}
            strokes={drawing.strokes}
            background={background}
            marks={marks}
            onMarks={onMarks}
            marking={marking}
            label="Student's drawing"
          />
          {!drawing.assetId && (
            <p className="text-xs text-muted">The picture was never uploaded, so this is drawn from the saved strokes.</p>
          )}
        </div>
      )}

      {drawing.strokes.length > 0 && (
        <details className="rounded-lg border border-border">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm">
            <PenLine className="size-4 text-muted" aria-hidden />
            <span className="flex-1 font-medium">Drawing replay</span>
            <span className="text-xs text-muted">
              {drawing.strokes.length} {drawing.strokes.length === 1 ? "stroke" : "strokes"}
            </span>
          </summary>
          <div className="border-t border-border p-3">
            <DrawingReplay strokes={drawing.strokes} width={q.canvasWidth} height={q.canvasHeight} background={background} />
          </div>
        </details>
      )}

      {drawing.photos.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Camera className="size-4 text-muted" aria-hidden /> Photos
          </p>
          <div className="space-y-3">
            {drawing.photos.map((id, i) =>
              urls[id] ? (
                <ZoomImage key={id} url={urls[id]} alt={`Student's photo ${i + 1}`} />
              ) : (
                <AssetImage key={id} id={id} alt={`Student's photo ${i + 1}`} assetUrls={urls} />
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
