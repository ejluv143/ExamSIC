// Drawing questions: what a student's answer holds (the strokes, the exported picture, up to three photos) and
// the teacher's marks over it. Both are stored as JSON text in the existing string columns
// (`answers.value`, `answers.feedback`), so the API and the web app share these parsers.
import { Schema } from "effect";
import type { AnswerValue } from "./quiz.ts";

export const strokeTools = ["pen", "highlighter", "eraser", "text"] as const;
export const StrokeTool = Schema.Literals(strokeTools);
export type StrokeTool = typeof StrokeTool.Type;

// One stroke or text label. `points` are [x, y, pressure] on the canvas (a text label has one point, its top-left
// corner); `at` is when the stroke started in ms since the drawing began, `ms` how long it took, for the replay.
export const Stroke = Schema.Struct({
  tool: StrokeTool,
  color: Schema.String,
  size: Schema.Number,
  points: Schema.Array(Schema.Tuple([Schema.Number, Schema.Number, Schema.Number])),
  text: Schema.optionalKey(Schema.String),
  at: Schema.Number,
  ms: Schema.Number,
});
export type Stroke = typeof Stroke.Type;

export const maxPhotos = 3;
export const maxStrokes = 3000;
export const maxStrokePoints = 100_000;

// The answer to a drawing question. `assetId`: the latest picture of the canvas (null until one was uploaded).
export const DrawingAnswer = Schema.Struct({
  strokes: Schema.Array(Stroke),
  assetId: Schema.NullOr(Schema.String),
  photos: Schema.Array(Schema.String),
});
export type DrawingAnswer = typeof DrawingAnswer.Type;

// What the teacher writes for a drawing: a comment, and marks drawn over the student's picture.
export const DrawingFeedback = Schema.Struct({ text: Schema.String, marks: Schema.Array(Stroke) });
export type DrawingFeedback = typeof DrawingFeedback.Type;

export const emptyDrawing: DrawingAnswer = { strokes: [], assetId: null, photos: [] };

const decodeAnswer = Schema.decodeUnknownOption(DrawingAnswer);
const decodeFeedback = Schema.decodeUnknownOption(DrawingFeedback);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

// An answer value as a drawing; anything that isn't one is an empty drawing.
export function parseDrawingAnswer(value: AnswerValue | undefined): DrawingAnswer {
  if (typeof value !== "string") return emptyDrawing;
  const parsed = decodeAnswer(parseJson(value));
  return parsed._tag === "Some" ? parsed.value : emptyDrawing;
}

export const encodeDrawingAnswer = (answer: DrawingAnswer): string => JSON.stringify(answer);

// Every picture the answer holds.
export const drawingAssetIds = (answer: DrawingAnswer): string[] => [
  ...(answer.assetId === null ? [] : [answer.assetId]),
  ...answer.photos,
];

// Feedback written for a drawing; plain text (anything that isn't this JSON) is a comment without marks.
export function parseDrawingFeedback(feedback: string | null | undefined): DrawingFeedback {
  if (!feedback) return { text: "", marks: [] };
  const parsed = decodeFeedback(parseJson(feedback));
  return parsed._tag === "Some" ? parsed.value : { text: feedback, marks: [] };
}

export const encodeDrawingFeedback = (feedback: DrawingFeedback): string | null =>
  feedback.text.trim() === "" && feedback.marks.length === 0 ? null : JSON.stringify(feedback);
