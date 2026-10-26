"use client";

import { useContext, useState } from "react";
import type { BankQuestion } from "@examinus/contract/bank";
import { Button, Card } from "@/components/ui";
import { Select } from "@/components/select";
import { Markdown } from "@/components/markdown";
import { questionLabel } from "@examinus/copy/question-types";
import { QuestionTypeBadge } from "@/components/question-kinds/question-style";
import type { Question, QuestionType } from "@examinus/domain/question";
import { OwnerBadge } from "@/features/bank/components/bank-card";
import { sourceLabel, sourceOf, subjectsOf, topicsOf, type Source } from "@/features/bank/model";
import { EditorAssetUrls } from "@/components/question-kinds/shared/editor-image-field";

// The question bank (the teacher's own, what other teachers shared and the school library), to add its questions
// to a part. Filter by subject, topic and source.
export function BankPicker({
  bank,
  types,
  usedPrompts,
  onPick,
}: {
  bank: readonly BankQuestion[];
  // The question types the quiz's subject offers; the others show on request.
  types: readonly QuestionType[];
  usedPrompts: Set<string>;
  onPick: (q: Question) => void;
}) {
  const assetUrls = useContext(EditorAssetUrls);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [allTypes, setAllTypes] = useState(false);
  const shown = bank.filter(
    (b) =>
      (!subject || b.subject === subject) &&
      (!topic || b.topic === topic) &&
      (source === "all" || sourceOf(b) === source) &&
      (allTypes || types.includes(b.question.type)),
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <span className="font-medium">Question bank</span>
        <Select
          value={subject}
          onChange={(v) => {
            setSubject(v);
            setTopic("");
          }}
          size="sm"
          aria-label="Subject"
          options={[{ value: "", label: "All subjects" }, ...subjectsOf(bank).map((t) => ({ value: t, label: t }))]}
        />
        <Select
          value={topic}
          onChange={setTopic}
          size="sm"
          aria-label="Topic"
          options={[{ value: "", label: "All topics" }, ...topicsOf(bank, subject).map((t) => ({ value: t, label: t }))]}
        />
        <Select<Source>
          value={source}
          onChange={setSource}
          size="sm"
          aria-label="Source"
          options={(Object.keys(sourceLabel) as Source[]).map((v) => ({ value: v, label: v === "all" ? "All sources" : sourceLabel[v] }))}
        />
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={allTypes} onChange={(e) => setAllTypes(e.target.checked)} className="size-4 accent-primary" />
          Show all question types
        </label>
      </div>
      <ul className="max-h-80 divide-y divide-border overflow-y-auto">
        {shown.length === 0 && <li className="px-5 py-6 text-center text-sm text-muted">No questions match these filters.</li>}
        {shown.map((item) => {
          const q = item.question;
          const used = usedPrompts.has(q.prompt);
          return (
            <li key={q.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <Markdown className="text-sm" assetUrls={assetUrls}>{q.prompt}</Markdown>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <QuestionTypeBadge type={q.type} label={questionLabel(q)} />
                  <OwnerBadge item={item} />
                  {q.points} pts{item.subject && ` · ${item.subject}`}{item.topic && ` · ${item.topic}`}
                </p>
              </div>
              <Button variant={used ? "ghost" : "secondary"} disabled={used} onClick={() => onPick(q)}>
                {used ? "Added" : "Add"}
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
