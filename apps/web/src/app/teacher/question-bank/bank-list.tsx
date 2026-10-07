"use client";

import { useState } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import { Badge, Card, EmptyState, inputBase, inputClass } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { languageLabel } from "@/lib/code";
import { questionLabel, questionTypeLabel } from "@/lib/format";
import { blankKey, type Question, type QuestionType } from "@examora/contract";

function AnswerKey({ q }: { q: Question }) {
  switch (q.type) {
    case "multiple_choice":
      return (
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {q.choices.map((c, i) => (
            <li
              key={c.id}
              className={clsx(
                "rounded-md px-2 py-1",
                q.correctChoiceIds.includes(c.id) ? "bg-success-soft font-medium text-success" : "text-muted",
              )}
            >
              {String.fromCharCode(65 + i)}. <Markdown inline>{c.text}</Markdown>
            </li>
          ))}
        </ul>
      );
    case "true_false":
      return <p className="mt-2 text-sm text-success">Answer: {q.answer ? "True" : "False"}</p>;
    case "blank":
      return (
        <p className="mt-2 text-sm text-success">
          {q.mode === "identification" ? "Accepts: " : "Blanks: "}
          {blankKey(q).map((a, i) => `${i + 1}) ${a.join(" / ")}`).join("  ")}
        </p>
      );
    case "matching":
      return (
        <ul className="mt-2 space-y-1 text-sm text-success">
          {q.left.map((l) => (
            <li key={l.id}>
              <Markdown inline>{l.text}</Markdown> → <Markdown inline>{q.right.find((r) => r.id === l.rightId)?.text ?? ""}</Markdown>
            </li>
          ))}
        </ul>
      );
    case "enumeration":
      return (
        <p className="mt-2 text-sm text-success">
          {q.orderMatters ? "In order: " : "Any order: "}
          {q.items.map((x) => x.split("|").join(" / ")).join(", ")}
        </p>
      );
    case "numeric":
      return (
        <p className="mt-2 text-sm text-success">
          Answer: {q.answer}
          {q.tolerance > 0 && ` ± ${q.tolerance}`}
          {q.unit && ` ${q.unit}`}
        </p>
      );
    case "essay":
      return (
        <p className="mt-2 text-sm text-muted">
          Rubric: {q.rubric.length ? q.rubric.map((r) => `${r.criterion} (${r.points})`).join("; ") : "—"}
        </p>
      );
    case "sql":
      return (
        <p className="mt-2 text-sm text-success">
          SQL{q.hiddenDataSql.trim() ? " · with hidden data check" : ""}
          {q.orderMatters ? " · order matters" : ""}
        </p>
      );
    case "code":
      return (
        <p className="mt-2 text-sm text-success">
          {languageLabel[q.language]} · {q.tests.length} test {q.tests.length === 1 ? "case" : "cases"} (
          {q.tests.filter((t) => t.hidden).length} hidden)
        </p>
      );
  }
}

export function BankList({ bank }: { bank: readonly Question[] }) {
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
        <select
          value={type}
          onChange={(e) => setType(e.target.value as QuestionType | "")}
          aria-label="Question type"
          className={inputBase}
        >
          <option value="">All types</option>
          {Object.entries(questionTypeLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          aria-label="Topic"
          className={inputBase}
        >
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
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
              <Markdown className="mt-2 font-medium">{q.prompt}</Markdown>
              <AnswerKey q={q} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
