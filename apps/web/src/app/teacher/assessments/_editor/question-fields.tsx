"use client";

import { useContext, type ReactNode } from "react";
import clsx from "clsx";
import { Award, CircleCheckBig, ClipboardCheck, Lightbulb, MessageSquareText, type LucideIcon } from "lucide-react";
import { MarkdownEditor } from "@/components/markdown-editor";
import { inputClass } from "@/components/ui";
import type { Question } from "@examora/contract";
import { EditorAssetUrls } from "./image-field";
import { AnswerEditor, promptPlaceholder, ScoringSection } from "./questions";
import { PointsInput } from "./questions/shared";

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

// Essays and drawings have no answer key: the teacher grades them with a rubric.
function answerHeading(q: Question): { icon: LucideIcon; title: string; hint: string } {
  if (q.type === "essay" || q.type === "drawing")
    return { icon: ClipboardCheck, title: "Rubric", hint: "How you grade it. Students never see this." };
  if (q.type === "code" || q.type === "sql")
    return { icon: CircleCheckBig, title: "Answer and tests", hint: "How answers are checked. Hidden tests stay hidden." };
  return { icon: CircleCheckBig, title: "Answer key", hint: "The correct answer. Students never see this." };
}

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
    <div className="space-y-6">
      <Section
        tone="question"
        icon={MessageSquareText}
        title="Question"
        hint="What students read. Supports markdown, math and pictures."
      >
        <MarkdownEditor
          value={q.prompt}
          onChange={(prompt) => onChange({ ...q, prompt })}
          label={`Question ${number} text`}
          rows={6}
          blanks={q.type === "blank"}
          placeholder={promptPlaceholder(q)}
          assetUrls={assetUrls}
          images
        />
      </Section>

      <Section tone="answer" {...answerHeading(q)}>
        <AnswerEditor question={q} onChange={onChange} />
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
              <label className="block min-w-40 flex-1 text-sm">
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
        </Section>

        <Section
          tone="explanation"
          icon={Lightbulb}
          title="Explanation (optional)"
          hint="Why the answer is right, shown after answering and with results."
        >
          <MarkdownEditor
            value={q.explanation ?? ""}
            onChange={(explanation) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { explanation: _previous, ...without } = q;
              onChange((explanation === "" ? without : { ...without, explanation }) as Question);
            }}
            label={`Question ${number} explanation`}
            rows={4}
            assetUrls={assetUrls}
            images
          />
        </Section>
      </div>
    </div>
  );
}
