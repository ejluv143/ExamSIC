import { Schema } from "effect";
import { drawingAssetIds, encodeDrawingAnswer, maxPhotos, maxStrokePoints, maxStrokes, parseDrawingAnswer } from "../drawing.ts";
import { imageRefs, RubricRow, studentBase, studentCommon, teacherBase, type QuestionKind } from "./base.ts";
import { rubricKey } from "./essay.ts";
import { defaultPlaceholder, newBase, rescaleRubric, rubricHeading, rubricProblem, rubricSummary } from "./editor.ts";

const type = Schema.Literal("drawing");

// Students draw on a canvas, or photograph their work (up to three photos), and the teacher grades the picture
// against the rubric. `backgroundImageId` is an image to draw on (described by `backgroundAlt`). `cameraOnly`:
// photos must be taken with the camera, not picked from the gallery.
const studentFields = {
  backgroundImageId: Schema.optionalKey(Schema.String),
  backgroundAlt: Schema.optionalKey(Schema.String),
  allowDraw: Schema.Boolean,
  allowUpload: Schema.Boolean,
  cameraOnly: Schema.Boolean,
  canvasWidth: Schema.Int,
  canvasHeight: Schema.Int,
};
const fields = { ...studentFields, rubric: Schema.Array(RubricRow) };

export const DrawingBody = Schema.Struct({ type, ...fields });
export const DrawingQuestion = Schema.Struct({ ...teacherBase, type, ...fields });
export type DrawingQuestion = typeof DrawingQuestion.Type;
export const StudentDrawingQuestion = Schema.Struct({ ...studentBase, type, ...studentFields });
export type StudentDrawingQuestion = typeof StudentDrawingQuestion.Type;

// A drawing is graded by hand against the rubric, which a student reveal drops (issue #14).
export const RevealDrawingQuestion = Schema.Struct({ ...teacherBase, type, ...studentFields });
export type RevealDrawingQuestion = typeof RevealDrawingQuestion.Type;

export const drawing: QuestionKind<"drawing"> = {
  type: "drawing",
  label: "Drawing",
  subjects: ["english", "math", "science"],
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
  rescale: rescaleRubric,
  editor: {
    promptPlaceholder: defaultPlaceholder,
    answer: rubricHeading,
    summary: rubricSummary,
  },
  toStudent: (q) => ({
    ...studentCommon(q),
    type: q.type,
    ...(q.backgroundImageId === undefined ? {} : { backgroundImageId: q.backgroundImageId }),
    ...(q.backgroundAlt === undefined ? {} : { backgroundAlt: q.backgroundAlt }),
    allowDraw: q.allowDraw,
    allowUpload: q.allowUpload,
    cameraOnly: q.cameraOnly,
    canvasWidth: q.canvasWidth,
    canvasHeight: q.canvasHeight,
  }),
  toReveal: ({ rubric: _rubric, ...q }) => q,
  images: (q) => imageRefs([[q.backgroundImageId, q.backgroundAlt, "the background"]]),
  answerPictures: true,
  // The strokes and picture ids of the drawing, kept to what the question allows and to a sane size.
  cleanAnswer: (q, v) => {
    const given = parseDrawingAnswer(v);
    let points = 0;
    const strokes = q.allowDraw
      ? given.strokes
          .slice(0, maxStrokes)
          .filter((s) => (points += s.points.length) <= maxStrokePoints)
          .map((s) => (s.text === undefined ? s : { ...s, text: s.text.slice(0, 200) }))
      : [];
    const photos = q.allowUpload ? [...new Set(given.photos)].slice(0, maxPhotos) : [];
    const assetId = q.allowDraw ? given.assetId : null;
    return strokes.length === 0 && assetId === null && photos.length === 0 ? null : encodeDrawingAnswer({ strokes, assetId, photos });
  },
  autoScore: () => null,
  reviewable: true,
  teacherGraded: true,
  answerKey: (q) => rubricKey(q.rubric ?? []),
  answerText: (_q, value) => {
    const d = parseDrawingAnswer(value);
    const parts = [
      ...(d.strokes.length > 0 ? [`${d.strokes.length} ${d.strokes.length === 1 ? "stroke" : "strokes"}`] : []),
      ...(d.photos.length > 0 ? [`${d.photos.length} ${d.photos.length === 1 ? "photo" : "photos"}`] : []),
    ];
    return parts.length > 0 ? `Drawing (${parts.join(", ")})` : "";
  },
  // An empty canvas doesn't count.
  answerGiven: (_q, v) => {
    const d = parseDrawingAnswer(v);
    return d.strokes.length > 0 || drawingAssetIds(d).length > 0;
  },
  summary: (_q, v) => {
    const d = parseDrawingAnswer(v);
    const photos = d.photos.length;
    return d.strokes.length > 0 || d.assetId !== null
      ? `Drawing${photos ? ` and ${photos} ${photos === 1 ? "photo" : "photos"}` : ""}`
      : `${photos} ${photos === 1 ? "photo" : "photos"}`;
  },
  typing: false,
  freeForm: true,
  // A drawing can't be scored for speed, so a game gives it no points whatever its game points say (it keeps its
  // grading points) and the class sees a gallery. A relay can't use drawings at all: a piece only unlocks on an
  // answer that can be checked.
  gameProblem: (questions, { relay }) =>
    relay && questions.length > 0 ? "A Team Relay can't have drawing questions: a piece only unlocks on an answer that can be checked." : null,
  gameUnscored: true,
  gameTally: () => [],
  gameBuckets: () => null,
};
