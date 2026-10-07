"use client";

import { useContext } from "react";
import { MarkdownEditor } from "@/components/markdown-editor";
import { inputClass } from "@/components/ui";
import type { Question } from "@examora/contract";
import { EditorAssetUrls } from "./image-field";
import { AnswerEditor, promptPlaceholder, ScoringSection } from "./questions";
import { PointsInput } from "./questions/shared";

// Everything a teacher edits in one question, as labelled fields: the text, the answer (one editor per type),
// the points and scoring, the topic and the explanation. Used by the question cards and the table's side dialog.
export function QuestionFields({
  question: q,
  number,
  onChange,
  poolLocked,
}: {
  question: Question;
  number: number;
  onChange: (q: Question) => void;
  // The question is in a pool part: its points are set by the part and can't be edited here.
  poolLocked?: boolean;
}) {
  const assetUrls = useContext(EditorAssetUrls);
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-sm font-medium">Question</p>
        <MarkdownEditor
          value={q.prompt}
          onChange={(prompt) => onChange({ ...q, prompt })}
          label={`Question ${number} text`}
          rows={3}
          blanks={q.type === "blank" && q.mode !== "identification"}
          placeholder={promptPlaceholder(q)}
          assetUrls={assetUrls}
          images
        />
        <p className="mt-1 text-xs text-muted">What students read. Supports markdown, math and pictures.</p>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">Answer</p>
        <AnswerEditor question={q} onChange={onChange} />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Points and scoring</p>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Points</span>
            <PointsInput
              value={q.points}
              readOnly={poolLocked}
              onChange={(points) => onChange({ ...q, points })}
              label={`Points for question ${number}`}
            />
            <span className="mt-1 block max-w-48 text-xs text-muted">
              {poolLocked ? "Set by the part's pool." : "What a fully correct answer earns. Whole or half points."}
            </span>
          </label>
          <label className="block min-w-48 flex-1 text-sm">
            <span className="mb-1 block text-muted">Topic (optional)</span>
            <input
              value={q.topic ?? ""}
              onChange={(e) => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { topic: _previous, ...without } = q;
                onChange((e.target.value === "" ? without : { ...without, topic: e.target.value }) as Question);
              }}
              placeholder="e.g. Normalization"
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-muted">Groups the question in the question bank and reports.</span>
          </label>
        </div>
        <ScoringSection question={q} onChange={onChange} poolLocked={poolLocked} />
      </div>

      <details className="rounded-lg border border-border" open={!!q.explanation}>
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Explanation (optional)</summary>
        <div className="border-t border-border p-3">
          <MarkdownEditor
            value={q.explanation ?? ""}
            onChange={(explanation) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { explanation: _previous, ...without } = q;
              onChange((explanation === "" ? without : { ...without, explanation }) as Question);
            }}
            label={`Question ${number} explanation`}
            rows={3}
            placeholder="Why the answer is right. Mastery students read it after each answer, and it is shown with the results."
            assetUrls={assetUrls}
            images
          />
        </div>
      </details>
    </div>
  );
}
