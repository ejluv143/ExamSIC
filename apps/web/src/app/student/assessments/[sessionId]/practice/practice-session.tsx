"use client";

import { useState } from "react";
import clsx from "clsx";
import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { AnswerInput } from "@/components/online-exam";
import { Markdown } from "@/components/markdown";
import { Button, ButtonLink, Card } from "@/components/ui";
import { questionTypeLabel } from "@/lib/format";
import { hasAnswer } from "@examinus/domain/quiz";
import type { Question, StudentQuestion } from "@examinus/domain/question";
import type { AnswerValue } from "@examinus/domain/quiz";
import { answerKey } from "@examinus/domain/answer-text";
import { autoScore } from "@examinus/domain/scoring";

export type PracticeItem = { question: Question; student: StudentQuestion };

// Practice questions have no drawings, so there is nothing to finish before moving on.
const noDrawings = () => {};

export function PracticeSession({
  items,
  assetUrls,
  resultHref,
}: {
  items: PracticeItem[];
  assetUrls: Record<string, string>;
  resultHref: string;
}) {
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState<AnswerValue | undefined>(undefined);
  // The fraction of the points the checked answer earns; null until checked.
  const [checked, setChecked] = useState<number | null>(null);
  const [right, setRight] = useState(0);

  const done = index >= items.length;
  const current = items[index];

  if (done || !current) {
    return (
      <Card className="space-y-4 p-6 text-center" role="status">
        <p className="text-sm text-muted">Practice finished</p>
        <p className="text-5xl font-semibold tabular-nums">
          {right} <span className="text-2xl text-muted">/ {items.length}</span>
        </p>
        <p className="text-sm text-muted">right on the first try.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              setRound((n) => n + 1);
              setIndex(0);
              setValue(undefined);
              setChecked(null);
              setRight(0);
            }}
          >
            Practice again
          </Button>
          <ButtonLink href={resultHref} variant="secondary">
            Back to result
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const { question: q, student } = current;
  const tone = checked === null ? null : checked >= 1 ? "right" : checked > 0 ? "partial" : "wrong";

  const check = () => {
    const fraction = autoScore(q, value ?? null, null) ?? 0;
    setChecked(fraction);
    if (fraction >= 1) setRight((n) => n + 1);
  };
  const next = () => {
    setIndex((n) => n + 1);
    setValue(undefined);
    setChecked(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted" aria-live="polite">
        Question {index + 1} of {items.length}
      </p>
      <Card key={`${round}:${q.id}`} className="@container p-4 @lg:p-5">
        <div className="mb-3">
          {q.type !== "blank" && (
            <Markdown className="font-medium" assetUrls={assetUrls}>
              {q.prompt}
            </Markdown>
          )}
          <p className="mt-0.5 text-xs text-muted">{questionTypeLabel[q.type]}</p>
        </div>
        {/* Once checked the answer is frozen, so it can't be changed to match the key. */}
        <fieldset disabled={checked !== null} className="min-w-0">
          <AnswerInput
            q={student}
            value={value}
            onChange={setValue}
            assetUrls={assetUrls}
            uploads={false}
            registerDrawing={noDrawings}
          />
        </fieldset>
        {checked === null && (
          <div className="mt-4 flex justify-end">
            <Button onClick={check} disabled={!hasAnswer(value ?? null)}>
              Check answer
            </Button>
          </div>
        )}
      </Card>

      {tone && (
        <Card
          role="status"
          className={clsx("space-y-3 p-4 @lg:p-5", tone === "right" && "border-success", tone === "wrong" && "border-danger", tone === "partial" && "border-warning")}
        >
          <div className="flex items-center gap-2 font-semibold">
            {tone === "right" ? (
              <CheckCircle2 className="size-5 text-success" aria-hidden />
            ) : tone === "partial" ? (
              <MinusCircle className="size-5 text-warning" aria-hidden />
            ) : (
              <XCircle className="size-5 text-danger" aria-hidden />
            )}
            {tone === "right" ? "Correct!" : tone === "partial" ? "Partly right." : "Not quite."}
          </div>
          {tone !== "right" && (
            <p className="text-sm">
              <span className="text-muted">Correct answer: </span>
              <Markdown inline assetUrls={assetUrls}>{answerKey(q)}</Markdown>
            </p>
          )}
          {q.explanation && (
            <Markdown className="rounded-md bg-surface-muted px-2 py-1 text-sm text-muted" assetUrls={assetUrls}>
              {q.explanation}
            </Markdown>
          )}
          <div className="flex justify-end">
            <Button onClick={next}>{index + 1 < items.length ? "Next" : "See summary"}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
