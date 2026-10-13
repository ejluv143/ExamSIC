import { Schema } from "effect";
import { cleanHotspotAnswer, hotspotResults, parseHotspotAnswer } from "../placement.ts";
import type { AnswerValue } from "../quiz.ts";
import { imageRefs, studentBase, studentCommon, teacherBase, weightedFraction, type QuestionKind } from "./base.ts";

// A correct area of a hotspot image, in coordinates from 0 to 1 across the image's width and height: the top-left
// corner (`x`, `y`) and the size (`w`, `h`). An ellipse is the one that fits inside that box (a circle on a square one).
export const hotspotShapes = ["rect", "ellipse"] as const;
export const HotspotShape = Schema.Literals(hotspotShapes);
export type HotspotShape = typeof HotspotShape.Type;
export const HotspotRegion = Schema.Struct({
  id: Schema.String,
  shape: HotspotShape,
  x: Schema.Number,
  y: Schema.Number,
  w: Schema.Number,
  h: Schema.Number,
  label: Schema.optionalKey(Schema.String),
});
export type HotspotRegion = typeof HotspotRegion.Type;

const type = Schema.Literal("hotspot");

// Students click the image where the answer is. `maxClicks` (1 up to the number of regions) is how many markers
// they may place; `tolerance` (0 to 0.1, in image widths) widens every region a little. Points are shared equally
// by the regions.
const studentFields = {
  imageId: Schema.String,
  alt: Schema.String,
  maxClicks: Schema.Int,
};
const fields = { ...studentFields, regions: Schema.Array(HotspotRegion), tolerance: Schema.Number };

export const HotspotBody = Schema.Struct({ type, ...fields });
export const HotspotQuestion = Schema.Struct({ ...teacherBase, type, ...fields });
export type HotspotQuestion = typeof HotspotQuestion.Type;
export const StudentHotspotQuestion = Schema.Struct({ ...studentBase, type, ...studentFields });
export type StudentHotspotQuestion = typeof StudentHotspotQuestion.Type;

// Each region a marker lands in earns an equal share. Without partial credit every region must be hit and no marker
// may land outside all of them.
export function hotspotFraction(q: HotspotQuestion, answer: AnswerValue): number {
  const markers = parseHotspotAnswer(answer).slice(0, Math.max(1, q.maxClicks));
  if (markers.length === 0) return 0;
  const { hit, outside } = hotspotResults(q, markers);
  if (!q.partialCredit && outside > 0) return 0;
  return weightedFraction(hit, undefined, q.partialCredit);
}

export const hotspot: QuestionKind<"hotspot"> = {
  type: "hotspot",
  toStudent: (q) => ({ ...studentCommon(q), type: q.type, imageId: q.imageId, alt: q.alt, maxClicks: q.maxClicks }),
  images: (q) => imageRefs([[q.imageId, q.alt, "the hotspot image"]]),
  cleanAnswer: cleanHotspotAnswer,
  autoScore: hotspotFraction,
  units: (q) => q.regions.length,
  reviewable: false,
  answerKey: (q) => {
    const labels = q.regions.map((r) => r.label?.trim()).filter(Boolean);
    return `${q.regions.length} ${q.regions.length === 1 ? "area" : "areas"}${labels.length > 0 ? `: ${labels.join(", ")}` : ""}`;
  },
  answerText: (_q, value) => {
    const n = parseHotspotAnswer(value).length;
    return n > 0 ? `${n} ${n === 1 ? "marker" : "markers"}` : "";
  },
  summary: (_q, v) => {
    const n = parseHotspotAnswer(v).length;
    return `${n} ${n === 1 ? "marker" : "markers"}`;
  },
  typing: false,
  gameAnswer: (q) => q.regions.map((r, i) => r.label || `Area ${i + 1}`).join(", "),
};
