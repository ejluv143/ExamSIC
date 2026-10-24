import { keyHeading, newBase, splitsPoints } from "../editor-shared.ts";
import type { EditorModel } from "../editor-model.ts";

export const hotspotModel: EditorModel<"hotspot"> = {
  type: "hotspot",
  create: (id) => ({ ...newBase(id), type: "hotspot", imageId: "", alt: "", regions: [], maxClicks: 1, tolerance: 0 }),
  validate(q) {
    if (!q.imageId) return "needs an image.";
    if (!q.alt.trim()) return "needs a description (alt text) of the image.";
    if (q.regions.length === 0) return "needs at least one correct area on the image.";
    const outside = (n: number) => !(n >= 0 && n <= 1);
    if (q.regions.some((r) => !(r.w >= 0.01) || !(r.h >= 0.01) || outside(r.x) || outside(r.y) || r.x + r.w > 1.0001 || r.y + r.h > 1.0001))
      return "has a correct area that is too small or reaches outside the image.";
    if (!Number.isInteger(q.maxClicks) || q.maxClicks < 1 || q.maxClicks > q.regions.length)
      return `must allow between 1 and ${q.regions.length} clicks.`;
    return q.tolerance >= 0 && q.tolerance <= 0.1 ? null : "has a tolerance outside 0 to 0.1.";
  },
  promptPlaceholder: "e.g. Click the part of the cell that makes energy.",
  answer: keyHeading,
  unit: { noun: "area" },
  partialCredit: { applies: splitsPoints },
  summary: (q) => `${q.regions.length} ${q.regions.length === 1 ? "area" : "areas"}`,
};
