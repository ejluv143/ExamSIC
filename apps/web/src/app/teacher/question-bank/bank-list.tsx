"use client";

import { useState } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import { Badge, Card, EmptyState, inputBase, inputClass } from "@/components/ui";
import { HotspotView } from "@/components/hotspot-view";
import { Markdown } from "@/components/markdown";
import { languageLabel } from "@/lib/code";
import { questionLabel, questionTypeLabel } from "@/lib/format";
import { blankKey, blankStyle, type Question, type QuestionType } from "@examora/contract";

// A choice or matching item as the list shows it: its picture (or the alt text when there is no URL) and its text.
function ItemView({ item, urls }: { item: { text: string; imageId?: string; alt?: string }; urls: Record<string, string> }) {
  return (
    <span className="inline-flex flex-col gap-1">
      {item.imageId !== undefined && <PickedImage url={urls[item.imageId] ?? null} alt={item.alt} />}
      {(item.imageId === undefined || item.text.trim()) && <Markdown inline assetUrls={urls}>{item.text}</Markdown>}
    </span>
  );
}

function PickedImage({ url, alt }: { url: string | null; alt: string | undefined }) {
  return url ? (
    // Signed, short-lived URLs from another origin: next/image's optimiser doesn't apply.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt ?? ""} className="max-h-24 max-w-48 rounded border border-border object-contain" />
  ) : (
    <span className="text-xs">[image: {alt || "no description"}]</span>
  );
}

function AnswerKey({ q, urls }: { q: Question; urls: Record<string, string> }) {
  switch (q.type) {
    case "multiple_choice":
      return (
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {q.choices.map((c, i) => (
            <li
              key={c.id}
              className={clsx(
                "flex items-start gap-1 rounded-md px-2 py-1",
                q.correctChoiceIds.includes(c.id) ? "bg-success-soft font-medium text-success" : "text-muted",
              )}
            >
              {String.fromCharCode(65 + i)}. <ItemView item={c} urls={urls} />
            </li>
          ))}
        </ul>
      );
    case "true_false":
      return <p className="mt-2 text-sm text-success">Answer: {q.answer ? "True" : "False"}</p>;
    case "blank":
      return (
        <p className="mt-2 text-sm text-success">
          {blankStyle(q) === "single" ? "Accepts: " : "Blanks: "}
          {blankKey(q).map((a, i) => `${i + 1}) ${a.join(" / ")}`).join("  ")}
        </p>
      );
    case "matching":
      return (
        <ul className="mt-2 space-y-1 text-sm text-success">
          {q.left.map((l) => {
            const match = q.right.find((r) => r.id === l.rightId);
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-1.5">
                <ItemView item={l} urls={urls} /> → {match && <ItemView item={match} urls={urls} />}
              </li>
            );
          })}
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
    case "drawing": {
      const background = q.backgroundImageId === undefined ? null : (urls[q.backgroundImageId] ?? null);
      return (
        <div className="mt-2 space-y-1 text-sm text-muted">
          <p>
            {[q.allowDraw && "Draw", q.allowUpload && (q.cameraOnly ? "Take photos" : "Upload or take photos")].filter(Boolean).join(" · ")}
            {" · "}
            {q.canvasWidth} × {q.canvasHeight}
            {" · Rubric: "}
            {q.rubric.length ? q.rubric.map((r) => `${r.criterion} (${r.points})`).join("; ") : "—"}
          </p>
          {q.backgroundImageId !== undefined && <PickedImage url={background} alt={q.backgroundAlt} />}
        </div>
      );
    }
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
    case "categorization":
      return (
        <ul className="mt-2 space-y-1 text-sm text-success">
          {q.categories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{c.name || "(unnamed)"}:</span>
              {q.items
                .filter((x) => x.categoryId === c.id)
                .map((x) => (
                  <ItemView key={x.id} item={x} urls={urls} />
                ))}
            </li>
          ))}
          {q.items.some((x) => x.categoryId === null) && (
            <li className="flex flex-wrap items-center gap-1.5 text-muted">
              <span className="font-medium">Left unsorted:</span>
              {q.items
                .filter((x) => x.categoryId === null)
                .map((x) => (
                  <ItemView key={x.id} item={x} urls={urls} />
                ))}
            </li>
          )}
        </ul>
      );
    case "ordering":
      return (
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-success">
          {q.items.map((x) => (
            <li key={x.id}>
              <ItemView item={x} urls={urls} />
            </li>
          ))}
        </ol>
      );
    case "hotspot":
      return (
        <div className="mt-2 space-y-1 text-sm text-success">
          <p>
            {q.regions.length} {q.regions.length === 1 ? "area" : "areas"} · up to {q.maxClicks} {q.maxClicks === 1 ? "click" : "clicks"}
          </p>
          <HotspotView imageId={q.imageId} alt={q.alt} assetUrls={urls} regions={q.regions} tolerance={q.tolerance} className="max-w-sm" />
        </div>
      );
  }
}

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
              <Markdown className="mt-2 font-medium" assetUrls={assetUrls}>{q.prompt}</Markdown>
              <AnswerKey q={q} urls={assetUrls} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
