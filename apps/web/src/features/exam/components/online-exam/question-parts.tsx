import { AnswerInput, type DrawingFinalizer, type EditHandler, type RunCode } from "@/components/question-kinds/views/input";
import { QuestionTypeBadge } from "@/components/question-kinds/question-style";
import { partHeading } from "@/features/quiz/quiz-editor";
import type { Paper } from "@examinus/contract/attempt";
import type { StudentQuestion } from "@examinus/domain/question";
import type { AnswerValue } from "@examinus/domain/quiz";
import { Markdown } from "@/components/markdown";
import { MarkToggle } from "../question-navigator";
import { Card } from "@/components/ui";

const pointsLabel = (n: number) => `${n} ${n === 1 ? "pt" : "pts"}`;

// The paper's parts, each with its question cards: number, prompt, type, points, the mark toggle and the answer input.
export function QuestionParts({
  parts,
  firstNumber,
  assetUrls,
  answers,
  marks,
  showMarkToggle,
  markBusy,
  onToggleMark,
  onAnswer,
  runOnServer,
  onEdit,
  uploads,
  registerDrawing,
}: {
  parts: Paper["parts"];
  // The number of the first question on the page (one question at a time, it isn't 1).
  firstNumber: number;
  assetUrls: Record<string, string>;
  answers: Record<string, AnswerValue>;
  marks: Record<string, boolean>;
  showMarkToggle: boolean;
  markBusy: boolean;
  onToggleMark: (questionId: string) => void;
  onAnswer: (q: StudentQuestion, value: AnswerValue) => void;
  runOnServer?: RunCode;
  // Records code edits for a student taking it; missing in a preview.
  onEdit?: (questionId: string) => EditHandler;
  uploads: boolean;
  registerDrawing: (questionId: string, finalize: DrawingFinalizer | null) => void;
}) {
  const numbers = new Map(parts.flatMap((part) => part.questions).map((q, i) => [q.id, firstNumber + i]));
  return parts
    .filter((part) => part.questions.length > 0)
    .map((part, p) => (
      <section key={part.id} className="space-y-3">
        <div>
          <h2 className="font-semibold">
            {partHeading(part.title, p + 1)}
            <span className="ml-2 text-sm font-normal text-muted">
              {pointsLabel(part.questions.reduce((n, q) => n + q.points, 0))}
            </span>
          </h2>
          {part.instructions && (
            <Markdown className="text-sm text-muted" assetUrls={assetUrls}>
              {part.instructions}
            </Markdown>
          )}
        </div>
        {part.questions.map((q) => (
          <Card key={q.id} data-question-id={q.id} tabIndex={-1} className="scroll-mt-32 p-4 outline-none @lg:p-5">
            <div className="mb-3 flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-muted text-sm font-semibold tabular-nums">
                {numbers.get(q.id)}
              </span>
              <div className="min-w-0 flex-1">
                {q.type !== "blank" && (
                  <Markdown className="font-medium" assetUrls={assetUrls}>
                    {q.prompt}
                  </Markdown>
                )}
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <QuestionTypeBadge type={q.type} />
                  {pointsLabel(q.points)}
                </p>
              </div>
              {showMarkToggle && (
                <MarkToggle marked={marks[q.id] ?? false} busy={markBusy} onToggle={() => onToggleMark(q.id)} />
              )}
            </div>
            <AnswerInput
              q={q}
              value={answers[q.id]}
              onChange={(v) => onAnswer(q, v)}
              runOnServer={runOnServer}
              onEdit={onEdit?.(q.id)}
              assetUrls={assetUrls}
              uploads={uploads}
              registerDrawing={registerDrawing}
            />
          </Card>
        ))}
      </section>
    ));
}
