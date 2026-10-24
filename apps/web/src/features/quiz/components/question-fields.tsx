"use client";

import { createContext, useContext, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Segmented } from "@/components/segmented";
import { TextEditor } from "@/components/text-editor";
import type { Question } from "@examinus/domain/question";
import { EditorAssetUrls } from "@/components/question-kinds/shared/editor-image-field";
import { AnswerEditor } from "@/components/question-kinds/views/editor";
import { modelOf } from "@/components/question-kinds/views/editor-model";
import { TagField } from "@/features/bank/components/tag-combobox";
import { QuestionPreview } from "./question-preview";
import { ScoringSection } from "./scoring-section";

// The topics the teacher already uses (from the question bank), suggested in the topic field.
export const EditorTopics = createContext<readonly string[]>([]);

const heading = "mb-1.5 block text-sm font-semibold";

// What a teacher edits in one question's body: the text and the answer (one editor per type) up front, with a
// Preview of what students get; scoring, the explanation and the topic fold away under "More". The question editor
// dialog adds the points and type above it.
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
      <section>
        <h4 className={heading}>Question</h4>
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
      </section>

      <section>
        <h4 className={heading}>{model.answer.title}</h4>
        <AnswerEditor q={q} onChange={onChange} />
      </section>

      <details className="group rounded-lg border border-border">
        <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm font-medium select-none">
          <ChevronRight className="size-4 text-muted transition group-open:rotate-90" aria-hidden />
          More
          <span className="font-normal text-muted">· scoring, explanation, topic</span>
        </summary>
        <div className="grid gap-6 border-t border-border p-4 lg:grid-cols-2">
          <section>
            <h4 className={heading}>Scoring</h4>
            <ScoringSection question={q} onChange={onChange} poolLocked={poolLocked} />
          </section>
          <div className="space-y-5">
            <section>
              <h4 className={heading}>Explanation (optional)</h4>
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
              <p className="mt-1 text-xs text-muted">Shown after answering and with results.</p>
            </section>
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
      </details>
    </div>
  );
}
