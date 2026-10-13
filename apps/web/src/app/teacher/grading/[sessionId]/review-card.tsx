"use client";

import { useState } from "react";
import { Flag, Pencil } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import { Review } from "@/features/question-kinds/views/review";
import type { AiControls } from "@/components/ai-grading-controls";
import type { DraftRow } from "@/features/question-kinds/views/review";
import { questionLabel } from "@/lib/format";
import type { AttemptDetail } from "@examinus/contract/session";
import type { Stroke } from "@examinus/domain/drawing";
import type { Question } from "@examinus/domain/question";
import { autoPoints } from "./draft";

// One question of the attempt being graded: the prompt, the type's own review of the answer against the key (with
// its grading controls), and the score and feedback the teacher gives.
export function ReviewCard({
  number,
  question: q,
  attempt,
  value,
  onPoints,
  onFeedback,
  onMarks,
  assetUrls,
  ai,
}: {
  number: number;
  question: Question;
  attempt: AttemptDetail;
  value: DraftRow;
  onPoints: (points: string) => void;
  onFeedback: (feedback: string) => void;
  onMarks: (marks: Stroke[]) => void;
  assetUrls: Record<string, string>;
  ai: AiControls;
}) {
  const row = attempt.answers.find((a) => a.questionId === q.id);
  const automatic = autoPoints(q, row);
  const changed = automatic !== null && value.points.trim() !== "" && Number(value.points) !== automatic;
  // Rubric rows ticked as quick scoring; the score is their sum until the teacher types another.
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());

  function setScore(points: string) {
    setTicked(new Set());
    onPoints(points);
  }

  return (
    <Card>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              Question {number} · {questionLabel(q)} · {q.points} pts
            </p>
            {row?.markedForReview && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-warning">
                <Flag className="size-3" aria-hidden /> The student left it marked for review
              </p>
            )}
            <Markdown className="mt-1 font-medium" assetUrls={assetUrls}>{q.prompt}</Markdown>
          </div>
          {automatic !== null && (
            <span className="flex shrink-0 gap-1.5">
              <Badge tone={automatic >= q.points ? "success" : automatic > 0 ? "warning" : "danger"}>
                Auto {automatic} / {q.points}
              </Badge>
              {changed && (
                <Badge tone="info">
                  <Pencil className="mr-1 inline size-3" aria-hidden />
                  Changed by you
                </Badge>
              )}
            </span>
          )}
        </div>

        <Review
          mode="grading"
          q={q}
          answer={row?.value ?? null}
          urls={assetUrls}
          grading={{
            row,
            codeResults: attempt.codeResults[q.id],
            typing: attempt.typing[q.id],
            draft: value,
            ticked,
            setTicked,
            setPoints: onPoints,
            setFeedback: onFeedback,
            setMarks: onMarks,
            ai,
          }}
        />

        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <div>
            <Field label={`Score (0–${q.points})`}>
              <input
                type="number"
                min={0}
                max={q.points}
                step={0.5}
                value={value.points}
                onChange={(e) => setScore(e.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setScore(String(q.points))}>
                Full points
              </Button>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setScore("0")}>
                Zero
              </Button>
              {changed && (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setScore(String(automatic))}>
                  Undo change
                </Button>
              )}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Feedback (optional)</p>
            <MarkdownEditor label="Feedback" rows={3} value={value.feedback} onChange={onFeedback} />
            <p className="mt-1 text-xs text-muted">Students see this when results are released.</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
