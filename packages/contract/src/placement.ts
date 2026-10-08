// Answers that place things: sorting items into categories, putting items in order, clicking on an image.
// A categorization answer is stored as JSON text of { itemId: categoryId | null }, a hotspot answer as JSON text of
// [{ x, y }] (coordinates from 0 to 1 across the image), an ordering answer as the list of item ids; all of them in
// the existing answer value, like drawings. The API and the web app share these parsers and hit tests.
import type { CategorizationQuestion, HotspotQuestion, HotspotRegion, OrderingQuestion } from "./question.ts";
import type { AnswerValue } from "./quiz.ts";

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// --- Categorization ---

// itemId -> categoryId for the items the student put in a category. Items missing from the record are unsorted.
export type CategorizationAnswer = Record<string, string | null>;

export function parseCategorizationAnswer(value: AnswerValue | undefined): CategorizationAnswer {
  if (typeof value !== "string") return {};
  const parsed = parseJson(value);
  if (!isRecord(parsed)) return {};
  const out: CategorizationAnswer = {};
  for (const [k, v] of Object.entries(parsed)) if (typeof v === "string" || v === null) out[k] = v;
  return out;
}

export const encodeCategorizationAnswer = (answer: CategorizationAnswer): string => JSON.stringify(answer);

// The answer cut down to the question's own items and categories; null when nothing is sorted.
export function cleanCategorizationAnswer(q: CategorizationQuestion, value: AnswerValue): AnswerValue {
  const given = parseCategorizationAnswer(value);
  const categories = new Set(q.categories.map((c) => c.id));
  const out: CategorizationAnswer = {};
  for (const item of q.items) {
    const c = given[item.id];
    out[item.id] = typeof c === "string" && categories.has(c) ? c : null;
  }
  return Object.values(out).some((c) => c !== null) ? encodeCategorizationAnswer(out) : null;
}

export type CategorizationResult = { itemId: string; given: string | null; correct: boolean };

// Each item with where the student put it (null: left unsorted) and whether that is right. A distractor is right
// when unsorted.
export function categorizationResults(q: CategorizationQuestion, value: AnswerValue): CategorizationResult[] {
  const given = parseCategorizationAnswer(value);
  return q.items.map((item) => {
    const c = given[item.id] ?? null;
    return { itemId: item.id, given: c, correct: c === item.categoryId };
  });
}

// --- Ordering ---

// The ids of the student's order, when they are exactly the question's items once each; otherwise null.
export function parseOrderingAnswer(q: Pick<OrderingQuestion, "items">, value: AnswerValue | undefined): string[] | null {
  if (!Array.isArray(value) || value.length !== q.items.length) return null;
  const ids = new Set(q.items.map((i) => i.id));
  return value.every((id) => ids.has(id)) && new Set(value).size === value.length ? value : null;
}

export type OrderingResult = { itemId: string; correct: boolean };

// Each position (in the correct order) with whether the student put the right item there.
export function orderingResults(q: OrderingQuestion, value: AnswerValue): OrderingResult[] {
  const order = parseOrderingAnswer(q, value);
  return q.items.map((item, i) => ({ itemId: item.id, correct: order?.[i] === item.id }));
}

// --- Hotspot ---

export type Marker = { x: number; y: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round4 = (n: number) => Math.round(n * 10000) / 10000;

// The markers of an answer value, whatever was stored; invalid entries are dropped, coordinates clamped to 0..1.
export function parseHotspotAnswer(value: AnswerValue | undefined): Marker[] {
  if (typeof value !== "string") return [];
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];
  const out: Marker[] = [];
  for (const m of parsed) {
    if (isRecord(m) && typeof m.x === "number" && typeof m.y === "number" && Number.isFinite(m.x) && Number.isFinite(m.y))
      out.push({ x: round4(clamp01(m.x)), y: round4(clamp01(m.y)) });
  }
  return out;
}

export const encodeHotspotAnswer = (markers: readonly Marker[]): string | null =>
  markers.length === 0 ? null : JSON.stringify(markers);

// At most `maxClicks` markers are kept (the first ones); null when none are left.
export function cleanHotspotAnswer(q: Pick<HotspotQuestion, "maxClicks">, value: AnswerValue): AnswerValue {
  return encodeHotspotAnswer(parseHotspotAnswer(value).slice(0, Math.max(1, q.maxClicks)));
}

// Whether a point is inside a region, widened by `tolerance` (in image widths and heights) on every side.
export function inRegion(region: HotspotRegion, p: Marker, tolerance = 0): boolean {
  if (region.shape === "rect")
    return p.x >= region.x - tolerance && p.x <= region.x + region.w + tolerance && p.y >= region.y - tolerance && p.y <= region.y + region.h + tolerance;
  const rx = region.w / 2 + tolerance;
  const ry = region.h / 2 + tolerance;
  if (rx <= 0 || ry <= 0) return false;
  const dx = (p.x - (region.x + region.w / 2)) / rx;
  const dy = (p.y - (region.y + region.h / 2)) / ry;
  return dx * dx + dy * dy <= 1;
}

export type HotspotResult = {
  // For each region, in order: whether at least one marker is in it.
  hit: boolean[];
  // How many markers are outside every region.
  outside: number;
};

export function hotspotResults(q: Pick<HotspotQuestion, "regions" | "tolerance">, markers: readonly Marker[]): HotspotResult {
  return {
    hit: q.regions.map((r) => markers.some((m) => inRegion(r, m, q.tolerance))),
    outside: markers.filter((m) => !q.regions.some((r) => inRegion(r, m, q.tolerance))).length,
  };
}
