import { AssetImage } from "@/components/asset-image";
import { DrawingPicture } from "@/components/drawing-picture";
import { ZoomImage } from "@/components/zoom-image";
import { parseDrawingAnswer, parseDrawingFeedback } from "@examinus/domain/drawing";
import type { DrawingQuestion } from "@examinus/domain/kinds/drawing";
import type { AnswerValue } from "@examinus/domain/quiz";
import type { ReviewProps } from "../views/review";
import { RubricTicks, StudentAnswer } from "../shared/review-grading";
import { PickedImage } from "../shared/review-items";
import { PlainPrompt } from "../shared/review-prompt";
import { NoAnswer, ResultFrame } from "../shared/review-result";
import { DrawingReview } from "./drawing-review";

export function Review(props: ReviewProps<"drawing">) {
  switch (props.mode) {
    case "prompt":
      return <PlainPrompt q={props.q} urls={props.urls} />;
    case "result":
      // A drawing's feedback is the teacher's comment plus marks (shown on the picture), never raw JSON.
      return (
        <ResultFrame q={props.q} urls={props.urls} feedback={parseDrawingFeedback(props.feedback).text}>
          <DrawingResult q={props.q} answer={props.answer} feedback={props.feedback} urls={props.urls} />
        </ResultFrame>
      );
    case "grading": {
      const { q, answer, urls, grading } = props;
      return (
        <>
          <RubricTicks q={q} rubric={q.rubric} urls={urls} grading={grading} />
          <StudentAnswer>
            <DrawingReview q={q} answer={answer} marks={grading.draft.marks} onMarks={grading.setMarks} urls={urls} />
          </StudentAnswer>
        </>
      );
    }
    case "live":
      return <p className="text-sm text-muted">{props.answer ? "Drawing saved." : "No answer yet."}</p>;
    case "key": {
      const { q, urls } = props;
      const background = q.backgroundImageId === undefined ? null : (urls[q.backgroundImageId] ?? null);
      return (
        <div className="mt-2 space-y-1 text-sm text-muted">
          <p>
            {[q.allowDraw && "Draw", q.allowUpload && (q.cameraOnly ? "Take photos" : "Upload or take photos")].filter(Boolean).join(" · ")}
            {" · "}
            {q.canvasWidth} × {q.canvasHeight}
            {" · Rubric: "}
            {q.rubric.length ? q.rubric.map((r) => `${r.criterion} (${r.points})`).join("; ") : "—"}
          </p>
          {q.backgroundImageId !== undefined && <PickedImage url={background} alt={q.backgroundAlt} />}
        </div>
      );
    }
  }
}

// The student's drawing with the teacher's marks over it, and their photos.
function DrawingResult({
  q,
  answer,
  feedback,
  urls,
}: {
  q: DrawingQuestion;
  answer: AnswerValue | undefined;
  feedback: string | null;
  urls: Record<string, string>;
}) {
  const drawing = parseDrawingAnswer(answer);
  const { marks } = parseDrawingFeedback(feedback);
  if (drawing.strokes.length === 0 && !drawing.assetId && drawing.photos.length === 0) return <NoAnswer />;
  const backgroundUrl = q.backgroundImageId ? urls[q.backgroundImageId] : undefined;
  return (
    <div className="space-y-2">
      {(drawing.assetId || drawing.strokes.length > 0) && (
        <DrawingPicture
          width={q.canvasWidth}
          height={q.canvasHeight}
          pictureUrl={drawing.assetId ? urls[drawing.assetId] : undefined}
          strokes={drawing.strokes}
          background={backgroundUrl ? { url: backgroundUrl, alt: q.backgroundAlt ?? "" } : undefined}
          marks={marks}
          label={marks.length > 0 ? "Your drawing, with your teacher's marks" : "Your drawing"}
        />
      )}
      {drawing.photos.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {drawing.photos.map((id, i) =>
            urls[id] ? (
              <ZoomImage key={id} url={urls[id]} alt={`Your photo ${i + 1}`} />
            ) : (
              <AssetImage key={id} id={id} alt={`Your photo ${i + 1}`} assetUrls={urls} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
