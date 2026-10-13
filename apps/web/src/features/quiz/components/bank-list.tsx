"use client";

import { useState } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import { Badge, Card, EmptyState, inputClass } from "@/components/ui";
import { Select } from "@/components/select";
import { Markdown } from "@/components/markdown";
import { Review } from "@/components/question-kinds/views/review";
import { questionLabel, questionTypeLabel } from "@/lib/format";
import { type Question, type QuestionType } from "@examinus/domain/question";

export function BankList({ bank, assetUrls }: { bank: readonly Question[]; assetUrls: Record<string, string> }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<QuestionType | "">("");
  const [topic, setTopic] = useState("");

  const topics = [...new Set(bank.map((q) => q.topic).filter(Boolean))].sort() as string[];
  const shown = bank.filter(
    (q) =>
      (!type || q.type === type) &&
      (!topic || q.topic === topic) &&
      (!query || q.prompt.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <Card>
      <div className="flex flex-wrap gap-3 border-b border-border p-4">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions"
            aria-label="Search questions"
            className={clsx(inputClass, "pl-9")}
          />
        </div>
        <Select<QuestionType | "">
          value={type}
          onChange={setType}
          aria-label="Question type"
          options={[
            { value: "", label: "All types" },
            ...(Object.entries(questionTypeLabel) as [QuestionType, string][]).map(([value, label]) => ({ value, label })),
          ]}
        />
        <Select
          value={topic}
          onChange={setTopic}
          aria-label="Topic"
          options={[{ value: "", label: "All topics" }, ...topics.map((t) => ({ value: t, label: t }))]}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No matching questions" />
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((q) => (
            <li key={q.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">{questionLabel(q)}</Badge>
                {q.topic && <Badge>{q.topic}</Badge>}
                <span className="ml-auto text-xs text-muted tabular-nums">{q.points} pts</span>
              </div>
              <Markdown className="mt-2 font-medium" assetUrls={assetUrls}>{q.prompt}</Markdown>
              <Review mode="key" q={q} urls={assetUrls} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
