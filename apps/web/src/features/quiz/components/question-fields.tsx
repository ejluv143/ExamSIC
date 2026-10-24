"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TextEditor } from "@/components/text-editor";
import { Card, Switch } from "@/components/ui";
import type { Question } from "@examinus/domain/question";
import { questionLabel } from "@/lib/format";
import { QuestionTypeBadge } from "@/components/question-kinds/question-style";
import { EditorAssetUrls } from "@/components/question-kinds/shared/editor-image-field";
import { PointsInput } from "@/components/question-kinds/shared/editor-fields";
import { AnswerEditor } from "@/components/question-kinds/views/editor";
import { modelOf } from "@/components/question-kinds/views/editor-model";
import { TagField } from "@/features/bank/components/tag-combobox";
import { QuestionPreview } from "./question-preview";
import { ScoringSection } from "./scoring-section";

// The topics the teacher already uses (from the question bank), suggested in the topic field.
export const EditorTopics = createContext<readonly string[]>([]);

const pointsLabel = (n: number) => `${n} ${n === 1 ? "pt" : "pts"}`;

// One question as a teacher edits it: on the left what the student sees (the number, the text and the answer area),
// written in place; on the right (below it on a phone) the properties: type, points, topic, scoring, explanation.
// `panes` gives each side its own scroll for a parent of fixed height (the question editor dialog); without it the
// parent scrolls the whole thing (the question bank's dialog).
export function QuestionFields({
  question: q,
  number,
  onChange,
  poolLocked,
  panes,
}: {
  question: Question;
  number: number;
  onChange: (q: Question) => void;
  // The question is in a pool part: its points are set by the part and can't be edited here.
  poolLocked?: boolean;
  panes?: boolean;
}) {
  return (
    <div className={clsx("flex min-h-full flex-col lg:flex-row", panes && "lg:h-full lg:min-h-0")}>
      <div className={clsx("min-w-0 flex-1 p-4 sm:p-6", panes && "lg:overflow-y-auto")}>
        <QuestionCanvas question={q} number={number} onChange={onChange} />
      </div>
      <aside
        aria-label="Question properties"
        className={clsx(
          "shrink-0 border-t border-border bg-surface-muted/50 text-sm lg:w-60 lg:border-t-0 lg:border-l xl:w-64",
          panes && "lg:overflow-y-auto",
        )}
      >
        <QuestionProperties question={q} number={number} onChange={onChange} poolLocked={poolLocked} />
      </aside>
    </div>
  );
}

// What students see of the question, edited where it is: the prompt is written as it reads, the answer area is
// the type's editor. "Preview as student" swaps it for the real, answerable view.
function QuestionCanvas({ question: q, number, onChange }: { question: Question; number: number; onChange: (q: Question) => void }) {
  const assetUrls = useContext(EditorAssetUrls);
  const model = modelOf(q);
  const [preview, setPreview] = useState(false);
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <Switch checked={preview} onChange={setPreview} label="Preview as student" className="ml-auto w-fit items-center gap-2" />
      {preview ? (
        <QuestionPreview question={q} number={number} />
      ) : (
        <Card className="p-4">
          <div className="mb-3 flex items-start gap-3">
            <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-md bg-surface-muted px-1.5 text-sm font-semibold tabular-nums">
              {number}
            </span>
            <div className="min-w-0 flex-1">
              <TextEditor
                bare="min-h-7 font-medium"
                value={q.prompt}
                onChange={(prompt) => onChange({ ...q, prompt })}
                label={`Question ${number} text`}
                blanks={model.promptBlanks}
                placeholder={typeof model.promptPlaceholder === "function" ? model.promptPlaceholder(q) : model.promptPlaceholder}
                assetUrls={assetUrls}
                images
              />
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <QuestionTypeBadge type={q.type} label={questionLabel(q)} />
                {pointsLabel(q.points)}
              </p>
            </div>
          </div>
          {q.type === "multiple_choice" || q.type === "true_false" ? (
            // The answer is the choices themselves: drawn as the student's list, with no frame around it.
            <AnswerEditor q={q} onChange={onChange} />
          ) : (
            <section className="rounded-lg border border-border bg-surface-muted/40 p-3">
              <h4 className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold">
                Your answer
                <span className="text-xs font-normal text-muted">You set: {model.answer.title.toLowerCase()}</span>
              </h4>
              <AnswerEditor q={q} onChange={onChange} />
            </section>
          )}
        </Card>
      )}
    </div>
  );
}

// The properties panel: sections that are always open from lg up. Below lg it is one collapsed "Properties" row
// (with a one-line summary) under the question; the same sections, so only the CSS changes.
function QuestionProperties({
  question: q,
  number,
  onChange,
  poolLocked,
}: {
  question: Question;
  number: number;
  onChange: (q: Question) => void;
  poolLocked?: boolean;
}) {
  const assetUrls = useContext(EditorAssetUrls);
  const topics = useContext(EditorTopics);
  const model = modelOf(q);
  const [open, setOpen] = useState(false);
  const partial = model.partialCredit?.applies(q) ?? false;
  const summary = [pointsLabel(q.points), partial && q.partialCredit ? "Partial credit" : null, questionLabel(q)].filter(Boolean).join(" · ");
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="question-properties"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm lg:hidden"
      >
        <ChevronDown className={clsx("size-4 shrink-0 text-muted transition", open && "rotate-180")} aria-hidden />
        <span className="font-semibold">Properties</span>
        <span className="min-w-0 flex-1 truncate text-muted">{summary}</span>
      </button>
      <div id="question-properties" className={clsx("divide-y divide-border border-t border-border lg:block lg:border-t-0", open ? "block" : "hidden")}>
        <Section title="Question">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Type</span>
              <QuestionTypeBadge type={q.type} label={questionLabel(q)} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Points</span>
              <PointsInput value={q.points} readOnly={poolLocked} onChange={(points) => onChange({ ...q, points })} label={`Points for question ${number}`} />
            </div>
            {poolLocked && <p className="-mt-1 text-xs text-muted">Set by the part&apos;s pool.</p>}
            <TagField
              label="Topic"
              value={q.topic ?? ""}
              options={topics}
              placeholder="e.g. Normalization"
              onChange={(topic) => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { topic: _previous, ...without } = q;
                onChange((topic === "" ? without : { ...without, topic }) as Question);
              }}
            />
          </div>
        </Section>
        <Section title="Scoring" defaultOpen={false}>
          <ScoringSection question={q} onChange={onChange} poolLocked={poolLocked} />
        </Section>
        <Section title="Explanation" defaultOpen={q.explanation !== undefined && q.explanation !== ""}>
          <TextEditor
            value={q.explanation ?? ""}
            onChange={(explanation) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { explanation: _previous, ...without } = q;
              onChange((explanation === "" ? without : { ...without, explanation }) as Question);
            }}
            label={`Question ${number} explanation`}
            rows={3}
            assetUrls={assetUrls}
            images
          />
          <p className="mt-1 text-xs text-muted">Shown with results.</p>
        </Section>
      </div>
    </div>
  );
}

// One accordion section of the panel.
function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-semibold tracking-wide text-muted uppercase select-none">
        <ChevronRight className="size-3.5 transition group-open:rotate-90" aria-hidden />
        {title}
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}
