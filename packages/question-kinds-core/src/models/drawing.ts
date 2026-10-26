import { newBase, rescaleRubric, rubricHeading, rubricProblem, rubricSummary, defaultPlaceholder } from "../editor-shared.ts";
import type { EditorModel } from "../editor-model.ts";

export const drawingModel: EditorModel<"drawing"> = {
  type: "drawing",
  create: (id) => ({
    ...newBase(id),
    type: "drawing",
    allowDraw: true,
    allowUpload: false,
    cameraOnly: false,
    canvasWidth: 800,
    canvasHeight: 600,
    rubric: [],
  }),
  validate(q) {
    if (!q.allowDraw && !q.allowUpload) return "must let students draw, upload photos, or both.";
    const size = [q.canvasWidth, q.canvasHeight];
    if (size.some((n) => !Number.isInteger(n) || n < 200 || n > 2000)) return "needs a canvas between 200 and 2000 pixels on each side.";
    return rubricProblem(q);
  },
  promptPlaceholder: defaultPlaceholder,
  answer: rubricHeading,
  summary: rubricSummary,
  rescale: rescaleRubric,
};
