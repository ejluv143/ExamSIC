"use client";

import clsx from "clsx";
import { Search, X } from "lucide-react";
import type { QuestionType } from "@examinus/domain/question";
import { Segmented } from "@/components/segmented";
import { Select } from "@/components/select";
import { Button, inputClass, segmentClass, segmentGroupClass } from "@/components/ui";
import { questionTypeLabel } from "@/lib/format";
import { hasFilters, sourceLabel, type Filters, type Source } from "../model";

// Search, the filters (subject, topic, type, source) and the By Section | By Topic switch. The filters are the
// page's URL, so a view can be linked and survives a reload.
export function BankToolbar({
  filters,
  onChange,
  onClear,
  subjects,
  topics,
}: {
  filters: Filters;
  onChange: (change: Partial<Filters>) => void;
  onClear: () => void;
  subjects: readonly string[];
  topics: readonly string[];
}) {
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" aria-hidden />
          <input
            type="search"
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder="Search questions, subjects and topics"
            aria-label="Search questions"
            className={clsx(inputClass, "pl-9")}
          />
        </div>
        <Segmented<Filters["view"]>
          label="Group questions"
          value={filters.view}
          onChange={(view) => onChange({ view })}
          options={[
            ["section", "By Section"],
            ["topic", "By Topic"],
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          size="sm"
          aria-label="Subject"
          className="w-44"
          value={filters.subject}
          onChange={(subject) => onChange({ subject, topic: "" })}
          options={[{ value: "", label: "All subjects" }, ...subjects.map((s) => ({ value: s, label: s }))]}
        />
        <Select
          size="sm"
          aria-label="Topic"
          className="w-44"
          value={filters.topic}
          onChange={(topic) => onChange({ topic })}
          options={[{ value: "", label: "All topics" }, ...topics.map((t) => ({ value: t, label: t }))]}
        />
        <Select<QuestionType | "">
          size="sm"
          aria-label="Question type"
          className="w-44"
          value={filters.type}
          onChange={(type) => onChange({ type })}
          options={[
            { value: "", label: "All types" },
            ...(Object.entries(questionTypeLabel) as [QuestionType, string][]).map(([value, label]) => ({ value, label })),
          ]}
        />
        <div role="group" aria-label="Source" className={clsx(segmentGroupClass, "gap-0.5 p-0.5")}>
          {(Object.keys(sourceLabel) as Source[]).map((source) => (
            <button
              key={source}
              type="button"
              aria-pressed={filters.source === source}
              onClick={() => onChange({ source })}
              className={clsx(segmentClass(filters.source === source), "px-2.5 py-1")}
            >
              {sourceLabel[source]}
            </button>
          ))}
        </div>
        {hasFilters(filters) && (
          <Button variant="ghost" onClick={onClear}>
            <X className="size-4" aria-hidden /> Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
