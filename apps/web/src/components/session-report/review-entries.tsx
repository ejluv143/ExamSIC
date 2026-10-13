import clsx from "clsx";
import { Check, X } from "lucide-react";
import { AssetImage } from "@/components/asset-image";
import { DrawingPicture } from "@/components/drawing-picture";
import { Markdown } from "@/components/markdown";
import { triesText } from "@/components/mastery-results";
import { CategorizationReview, HotspotReview, OrderingReview } from "@/components/placement-review";
import { Badge } from "@/components/ui";
import { ZoomImage } from "@/components/zoom-image";
import { questionTypeLabel } from "@/lib/format";
import { parseDrawingAnswer, parseDrawingFeedback } from "@examinus/domain/drawing";
import { blankStyle } from "@examinus/domain/kinds/blank";
import type { MyResult } from "@examinus/contract/attempt";
import type { Question } from "@examinus/domain/question";
import type { AnswerValue } from "@examinus/domain/quiz";
import { answerKey, answerText } from "@examinus/domain/answer-text";
import { quadrantLabels, type SessionAnalytics } from "@examinus/domain/analytics";
import { partResults } from "@examinus/domain/scoring";
import type { ReviewEntry } from "./question-review-list";

// The review list is a client component (it filters and expands), but the answers are drawn here on the server,
// where the markdown, drawings and placement reviews already render; the client only receives the finished markup.
export function buildReviewEntries(r: MyResult, analytics: SessionAnalytics): ReviewEntry[] {
  return r.items.map(({ question: q, answer, points, feedback, mastery, answerChanges }, i) => {
    const a = analytics.questions[i]!;
    const full = points !== null && points >= q.points;
    return {
      id: q.id,
      number: i + 1,
      outcome: a.outcome,
      status: points === null ? "pending" : full ? "full" : points > 0 ? "partial" : "wrong",
      tags: a.topicTags,
      timeMs: a.timeTakenMs,
      deltaMs: a.deltaMs,
      quadrant: a.quadrant,
      quadrantLabel: a.quadrant ? quadrantLabels[a.quadrant] : null,
      answerChanges,
      prompt: <Prompt q={q} answer={answer} urls={r.assetUrls} />,
      side: (
        <>
          <Badge tone={points === null ? "neutral" : full ? "success" : points > 0 ? "warning" : "danger"}>
            {points === null ? "To grade" : `${points} / ${q.points}`}
          </Badge>
          <p className="mt-1 text-xs text-muted">{questionTypeLabel[q.type]}</p>
          {mastery && (
            <p className="mt-0.5 text-xs font-medium" data-testid="mastery-tries">
              {mastery.mastered === null ? "Waits for grading" : mastery.mastered ? "Mastered" : "Not mastered"} · {triesText(mastery.tries)}
            </p>
          )}
        </>
      ),
      body: <Body q={q} answer={answer} full={full} feedback={feedback} urls={r.assetUrls} />,
    };
  });
}

// An inline blank is filled in the sentence itself, so it is drawn with the prompt.
function Prompt({ q, answer, urls }: { q: Question; answer: AnswerValue; urls: Record<string, string> }) {
  const parts = partResults(q, answer);
  const inlineBlank = q.type === "blank" && blankStyle(q) !== "single";
  return (
    <Markdown
      className="min-w-0 flex-1"
      assetUrls={urls}
      renderBlank={
        inlineBlank
          ? (b, accepted) => {
              const part = parts?.[b];
              return (
                <span
                  className={clsx(
                    "mx-0.5 inline-block rounded px-1.5 font-medium",
                    part?.correct ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                  )}
                >
                  {part?.given || "—"}
                  {!part?.correct && <span className="ml-1 text-success">({accepted[0]})</span>}
                </span>
              );
            }
          : undefined
      }
    >
      {q.prompt}
    </Markdown>
  );
}

function Body({
  q,
  answer,
  full,
  feedback,
  urls,
}: {
  q: Question;
  answer: AnswerValue;
  full: boolean;
  feedback: string;
  urls: Record<string, string>;
}) {
  const yours = answerText(q, answer);
  // A drawing's feedback is the teacher's comment plus marks (shown on the picture), never raw JSON.
  const feedbackText = q.type === "drawing" ? parseDrawingFeedback(feedback).text : feedback;
  const parts = partResults(q, answer);
  const inlineBlank = q.type === "blank" && blankStyle(q) !== "single";
  const listed = q.type === "matching" || q.type === "enumeration" || (q.type === "blank" && !inlineBlank);
  return (
    <div className="space-y-1 text-sm">
      {q.type === "code" || q.type === "sql" ? (
        yours ? (
          <pre className="max-h-72 overflow-auto rounded-md bg-surface-muted p-3 font-mono text-xs">{yours}</pre>
        ) : (
          <p className="italic text-muted">No answer</p>
        )
      ) : q.type === "drawing" ? (
        <DrawingResult q={q} answer={answer} feedback={feedback} urls={urls} />
      ) : q.type === "essay" ? (
        yours ? (
          <Markdown className="rounded-md bg-surface-muted p-3" assetUrls={urls}>{yours}</Markdown>
        ) : (
          <p className="italic text-muted">No answer</p>
        )
      ) : q.type === "categorization" ? (
        <CategorizationReview q={q} value={answer} assetUrls={urls} showKey />
      ) : q.type === "ordering" ? (
        <OrderingReview q={q} value={answer} assetUrls={urls} showKey={!full} />
      ) : q.type === "hotspot" ? (
        <HotspotReview q={q} value={answer} assetUrls={urls} />
      ) : (listed || inlineBlank) && parts ? (
        listed && (
          <ul className="space-y-1">
            {parts.map((part, k) => (
              <li key={k} className="flex items-start gap-2">
                {part.correct ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Correct" />
                ) : (
                  <X className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Wrong" />
                )}
                <span className="min-w-0 flex-1">
                  {q.type === "matching" && (
                    <>
                      <Markdown inline assetUrls={urls}>{q.left[k]?.text ?? ""}</Markdown>
                      <span className="text-muted"> → </span>
                    </>
                  )}
                  {part.given ? (
                    <Markdown inline assetUrls={urls}>{part.given}</Markdown>
                  ) : (
                    <span className="italic text-muted">No answer</span>
                  )}
                  {!part.correct && q.type === "matching" && (
                    <span className="text-success">
                      {" "}
                      (<Markdown inline assetUrls={urls}>{q.right.find((r) => r.id === q.left[k]?.rightId)?.text ?? ""}</Markdown>)
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div>
          <p>
            <span className="text-muted">Your answer: </span>
            {yours ? <Markdown inline assetUrls={urls}>{yours}</Markdown> : <span className="italic text-muted">No answer</span>}
          </p>
          {q.type === "multiple_choice" && (
            <div className="mt-1 flex flex-wrap gap-2">
              {q.choices
                .filter((c) => c.imageId && (Array.isArray(answer) ? answer : [answer]).includes(c.id))
                .map((c) => (
                  <AssetImage key={c.id} id={c.imageId!} alt={c.alt ?? ""} assetUrls={urls} className="max-h-32" />
                ))}
            </div>
          )}
        </div>
      )}
      {q.type !== "essay" && q.type !== "drawing" && q.type !== "code" && q.type !== "sql" && q.type !== "matching" && q.type !== "categorization" && q.type !== "ordering" && q.type !== "hotspot" && !full && (
        <p className="text-success">
          <span className="text-muted">Correct: </span>
          <Markdown inline assetUrls={urls}>{answerKey(q)}</Markdown>
        </p>
      )}
      {feedbackText && (
        <Markdown className="rounded-md bg-info-soft px-2 py-1 text-info" assetUrls={urls}>
          {feedbackText}
        </Markdown>
      )}
      {q.explanation && (
        <Markdown className="rounded-md bg-surface-muted px-2 py-1 text-muted" assetUrls={urls}>
          {q.explanation}
        </Markdown>
      )}
    </div>
  );
}

// The student's drawing with the teacher's marks over it, and their photos.
function DrawingResult({
  q,
  answer,
  feedback,
  urls,
}: {
  q: Extract<Question, { type: "drawing" }>;
  answer: AnswerValue | undefined;
  feedback: string | null;
  urls: Record<string, string>;
}) {
  const drawing = parseDrawingAnswer(answer);
  const { marks } = parseDrawingFeedback(feedback);
  if (drawing.strokes.length === 0 && !drawing.assetId && drawing.photos.length === 0)
    return <p className="italic text-muted">No answer</p>;
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
