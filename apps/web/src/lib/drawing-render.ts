// Painting drawing strokes on a canvas, shared by the student's drawing board, the teacher's marks, the replay and
// the result page. Strokes are in canvas units (the question's canvasWidth x canvasHeight), not screen pixels.
import { getStroke } from "perfect-freehand";
import type { Stroke } from "@examora/contract";

export const penColors = ["#111827", "#dc2626", "#2563eb", "#16a34a", "#ea580c", "#9333ea"] as const;
// The teacher's marks stand out from a student's black or blue pen.
export const markColors = ["#dc2626", "#16a34a", "#2563eb", "#ea580c"] as const;
export const thicknesses = [
  { size: 2, label: "Thin" },
  { size: 4, label: "Medium" },
  { size: 8, label: "Thick" },
] as const;

// The font size of a text label drawn with a given thickness.
export const textPx = (size: number) => 10 + size * 3;

// Never trust a stroke's numbers: a bad one must not stop the picture from drawing.
const finite = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);

// Sets the canvas to `width` x `height` canvas units at the screen's pixel density and returns its context,
// scaled so strokes can be painted in canvas units.
export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

function fillOutline(ctx: CanvasRenderingContext2D, outline: number[][]) {
  if (outline.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.closePath();
  ctx.fill();
}

export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  ctx.save();
  ctx.fillStyle = stroke.color;
  if (stroke.tool === "text") {
    const [x, y] = stroke.points[0] ?? [0, 0];
    ctx.font = `${textPx(finite(stroke.size, 4))}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(stroke.text ?? "", finite(x, 0), finite(y, 0));
    ctx.restore();
    return;
  }
  const size = finite(stroke.size, 4);
  // A mouse reports a flat 0.5; only a pen or finger has real pressure to show.
  const flat = stroke.points.every((p) => p[2] === 0.5);
  if (stroke.tool === "eraser") ctx.globalCompositeOperation = "destination-out";
  if (stroke.tool === "highlighter") ctx.globalAlpha = 0.35;
  const width = stroke.tool === "pen" ? size : stroke.tool === "highlighter" ? size * 3 : size * 4;
  const outline = getStroke(
    stroke.points.map((p) => [finite(p[0], 0), finite(p[1], 0), finite(p[2], 0.5)]),
    {
      size: width,
      thinning: stroke.tool === "pen" ? 0.5 : 0,
      smoothing: 0.5,
      streamline: 0.4,
      simulatePressure: flat,
      last: true,
    },
  );
  fillOutline(ctx, outline);
  ctx.restore();
}

export function paintStrokes(ctx: CanvasRenderingContext2D, strokes: readonly Stroke[]) {
  for (const s of strokes) paintStroke(ctx, s);
}

// Where the image fits inside the canvas without stretching, centred.
export function containRect(imageW: number, imageH: number, width: number, height: number) {
  const scale = Math.min(width / imageW, height / imageH);
  const w = imageW * scale;
  const h = imageH * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

// How long the drawing took, with long pauses cut short so a replay doesn't wait through them. Returns each
// stroke's start on that shortened clock, and the total.
const maxGapMs = 600;
export function replayClock(strokes: readonly Stroke[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let clock = 0;
  let prevEnd = 0;
  for (const s of strokes) {
    clock += Math.min(Math.max(0, s.at - prevEnd), maxGapMs);
    starts.push(clock);
    clock += Math.max(0, s.ms);
    prevEnd = s.at + s.ms;
  }
  return { starts, total: clock };
}

// The strokes as drawn by time `t` on the shortened clock; the one being drawn is cut part-way.
export function strokesAt(strokes: readonly Stroke[], starts: readonly number[], t: number): Stroke[] {
  const shown: Stroke[] = [];
  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    if (starts[i] > t) break;
    if (s.tool === "text" || s.ms <= 0 || t >= starts[i] + s.ms) {
      shown.push(s);
      continue;
    }
    const n = Math.max(1, Math.floor(s.points.length * ((t - starts[i]) / s.ms)));
    shown.push({ ...s, points: s.points.slice(0, n) });
  }
  return shown;
}
