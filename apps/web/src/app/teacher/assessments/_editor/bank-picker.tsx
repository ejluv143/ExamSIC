"use client";

import { useContext, useState } from "react";
import clsx from "clsx";
import { Button, Card, inputBase } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { QuestionTypeBadge } from "@/lib/question-style";
import type { Question, QuestionType } from "@examora/contract";
import { EditorAssetUrls } from "./image-field";

// The teacher's question bank, to add its questions to a part.
export function BankPicker({
  bank,
  types,
  usedPrompts,
  onPick,
}: {
  bank: readonly Question[];
  // The question types the quiz's subject offers; the others show on request.
  types: readonly QuestionType[];
  usedPrompts: Set<string>;
  onPick: (q: Question) => void;
}) {
  const assetUrls = useContext(EditorAssetUrls);
  const [topic, setTopic] = useState("");
  const [allTypes, setAllTypes] = useState(false);
  const topics = [...new Set(bank.map((q) => q.topic).filter(Boolean))] as string[];
  const shown = bank.filter((q) => (!topic || q.topic === topic) && (allTypes || types.includes(q.type)));

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <span className="font-medium">Question bank</span>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className={clsx(inputBase, "py-1.5")}>
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={allTypes} onChange={(e) => setAllTypes(e.target.checked)} className="size-4 accent-primary" />
          Show all question types
        </label>
      </div>
      <ul className="max-h-80 divide-y divide-border overflow-y-auto">
        {shown.map((q) => {
          const used = usedPrompts.has(q.prompt);
          return (
            <li key={q.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <Markdown className="text-sm" assetUrls={assetUrls}>{q.prompt}</Markdown>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <QuestionTypeBadge type={q.type} mode={q.type === "blank" ? q.mode : undefined} />
                  {q.points} pts{q.topic && ` · ${q.topic}`}
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
