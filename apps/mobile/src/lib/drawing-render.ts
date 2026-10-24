// Turning drawing strokes into SVG shapes, shared by the drawing board, the results and the PNG export (the web's
// `lib/drawing-render.ts`, which paints on a canvas). Strokes are in canvas units, not screen pixels.
import { getStroke } from "perfect-freehand";
import type { Stroke } from "@examinus/domain/drawing";

export const penColors = ["#111827", "#dc2626", "#2563eb", "#16a34a", "#ea580c", "#9333ea"] as const;
export const thicknesses = [
  { size: 2, label: "Thin" },
  { size: 4, label: "Medium" },
  { size: 8, label: "Thick" },
] as const;

// The font size of a text label drawn with a given thickness.
export const textPx = (size: number) => 10 + size * 3;

// Where the image fits inside the canvas without stretching, centred.
export function containRect(imageW: number, imageH: number, width: number, height: number) {
  const scale = Math.min(width / imageW, height / imageH);
  const w = imageW * scale;
  const h = imageH * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

// Never trust a stroke's numbers: a bad one must not stop the picture from drawing.
const finite = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);
const fixed = (n: number) => Math.round(n * 100) / 100;

export type Shape =
  | { kind: "path"; d: string; color: string; opacity: number }
  | { kind: "text"; x: number; y: number; size: number; color: string; text: string };

// What the strokes drawn so far look like: the `shapes` of this step on top of everything before it, with `erasers`
// (path outlines) wiping out the earlier steps' shapes only. An eraser never touches the background picture.
export type Step = { shapes: Shape[]; erasers: string[] };

function outlinePath(stroke: Stroke): string {
  const size = finite(stroke.size, 4);
  // A mouse reports a flat 0.5; only a pen or finger has real pressure to show.
  const flat = stroke.points.every((p) => p[2] === 0.5);
  const width = stroke.tool === "pen" ? size : stroke.tool === "highlighter" ? size * 3 : size * 4;
  const outline = getStroke(
    stroke.points.map((p) => [finite(p[0], 0), finite(p[1], 0), finite(p[2], 0.5)]),
    { size: width, thinning: stroke.tool === "pen" ? 0.5 : 0, smoothing: 0.5, streamline: 0.4, simulatePressure: flat, last: true },
  );
  if (outline.length === 0) return "";
  let d = `M${fixed(outline[0]![0])},${fixed(outline[0]![1])}`;
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i]!;
    const [x1, y1] = outline[(i + 1) % outline.length]!;
    d += `Q${fixed(x0)},${fixed(y0)} ${fixed((x0 + x1) / 2)},${fixed((y0 + y1) / 2)}`;
  }
  return `${d}Z`;
}

// The text's baseline sits about this far (in font sizes) below the top-left corner the stroke stores.
const ascent = 0.85;

export function strokeSteps(strokes: readonly Stroke[]): Step[] {
  const steps: Step[] = [{ shapes: [], erasers: [] }];
  for (const stroke of strokes) {
    let step = steps[steps.length - 1]!;
    if (stroke.tool === "eraser") {
      const d = outlinePath(stroke);
      if (d) step.erasers.push(d);
      continue;
    }
    // A shape after erasers starts a new step.
    if (step.erasers.length > 0) {
      step = { shapes: [], erasers: [] };
      steps.push(step);
    }
    if (stroke.tool === "text") {
      const [x, y] = stroke.points[0] ?? [0, 0];
      const size = textPx(finite(stroke.size, 4));
      step.shapes.push({ kind: "text", x: finite(x, 0), y: finite(y, 0) + size * ascent, size, color: stroke.color, text: stroke.text ?? "" });
      continue;
    }
    const d = outlinePath(stroke);
    if (d) step.shapes.push({ kind: "path", d, color: stroke.color, opacity: stroke.tool === "highlighter" ? 0.35 : 1 });
  }
  return steps;
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The strokes as a standalone SVG document (no background), for drawing onto a canvas in a browser.
export function strokesMarkup(strokes: readonly Stroke[], width: number, height: number): string {
  const shape = (s: Shape) =>
    s.kind === "path"
      ? `<path d="${s.d}" fill="${escape(s.color)}" fill-opacity="${s.opacity}"/>`
      : `<text x="${s.x}" y="${s.y}" font-size="${s.size}" font-family="sans-serif" fill="${escape(s.color)}">${escape(s.text)}</text>`;
  let inner = "";
  let defs = "";
  strokeSteps(strokes).forEach((step, i) => {
    inner += step.shapes.map(shape).join("");
    if (step.erasers.length === 0) return;
    defs += `<mask id="m${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="white"/>${step.erasers
      .map((d) => `<path d="${d}" fill="black"/>`)
      .join("")}</mask>`;
    inner = `<g mask="url(#m${i})">${inner}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs>${inner}</svg>`;
}
