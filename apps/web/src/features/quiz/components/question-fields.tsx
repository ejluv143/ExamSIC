"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Award, Lightbulb, MessageSquareText, type LucideIcon } from "lucide-react";
import { Segmented } from "@/components/segmented";
import { TextEditor } from "@/components/text-editor";
import type { Question } from "@examinus/domain/question";
import { EditorAssetUrls } from "@/components/question-kinds/shared/editor-image-field";
import { AnswerEditor } from "@/components/question-kinds/views/editor";
import { modelOf } from "@/components/question-kinds/views/editor-model";
import { PointsInput } from "@/components/question-kinds/shared/editor-fields";
import { TagField } from "@/features/bank/components/tag-combobox";
import { QuestionPreview } from "./question-preview";
import { ScoringSection } from "./scoring-section";

// The topics the teacher already uses (from the question bank), suggested in the topic field.
export const EditorTopics = createContext<readonly string[]>([]);

// Each part of a question has its own coloured icon, so the teacher can tell at a glance whether they are
// writing what students read, the answer key, or how it is scored.
const tones = {
  question: "bg-primary-soft text-primary",
  answer: "bg-success-soft text-success",
  scoring: "bg-warning-soft text-warning",
  explanation: "bg-info-soft text-info",
} as const;

function Section({
  tone,
  icon: Icon,
  title,
  hint,
  children,
}: {
  tone: keyof typeof tones;
  icon: LucideIcon;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section>
      <header className="mb-2 flex items-start gap-2">
        <span className={clsx("grid size-7 shrink-0 place-items-center rounded-md", tones[tone])}>
          <Icon className="size-4" aria-hidden />
        </span>
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-xs text-muted">{hint}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

// Everything a teacher edits in one question, as labelled fields: the text, the answer (one editor per type),
// the points and scoring, the topic and the explanation, with a Preview of what students get. Used by the
// question cards and the table's side dialog.
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
  const topics = useContext(EditorTopics);
  const model = modelOf(q);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const tabs = (
    <Segmented
      label={`Question ${number}: edit or preview`}
      value={view}
      options={[
        ["edit", "Edit"],
        ["preview", "Preview"],
      ]}
      onChange={setView}
    />
  );
  if (view === "preview")
    return (
      <div className="space-y-4">
        {tabs}
        <QuestionPreview question={q} number={number} />
      </div>
    );
  return (
    <div className="space-y-6">
      {tabs}
      <Section
        tone="question"
        icon={MessageSquareText}
        title="Question"
        hint="What students read. Plain text; the markdown editor adds formatting, math and pictures."
      >
        <TextEditor
          value={q.prompt}
          onChange={(prompt) => onChange({ ...q, prompt })}
          label={`Question ${number} text`}
          rows={4}
          blanks={model.promptBlanks}
          placeholder={typeof model.promptPlaceholder === "function" ? model.promptPlaceholder(q) : model.promptPlaceholder}
          assetUrls={assetUrls}
          images
        />
      </Section>

      <Section tone="answer" {...model.answer}>
        <AnswerEditor q={q} onChange={onChange} />
      </Section>

      {/* Scoring and the explanation share a row on wide screens; each is short next to the answer. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          tone="scoring"
          icon={Award}
          title="Points and scoring"
          hint="What the question is worth and how partly right answers count."
        >
          <div className="space-y-3">
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
              <div className="min-w-40 flex-1 text-sm">
                <TagField
                  label="Topic (optional)"
                  value={q.topic ?? ""}
                  options={topics}
                  placeholder="e.g. Normalization"
                  hint="Groups the question in the question bank and reports."
                  onChange={(topic) => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { topic: _previous, ...without } = q;
                    onChange((topic === "" ? without : { ...without, topic }) as Question);
                  }}
                />
              </div>
            </div>
            <ScoringSection question={q} onChange={onChange} poolLocked={poolLocked} />
          </div>
        </Section>

        <Section
          tone="explanation"
          icon={Lightbulb}
          title="Explanation (optional)"
          hint="Why the answer is right, shown after answering and with results."
        >
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
        </Section>
      </div>
    </div>
  );
}
