"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { Badge, Td } from "@/components/ui";
import { PercentBar } from "./charts";

export type DistractorBar = { label: string; count: number; correct: boolean };

export type ItemRowData = {
  number: number;
  typeLabel: string;
  n: number;
  // Difficulty as a whole percent; null without data.
  percent: number | null;
  discrimination: number | null;
  quality: "good" | "fair" | "poor" | "negative" | null;
  blank: number;
  // Multiple choice and true/false only.
  distractors: DistractorBar[] | null;
};

const qualityTone = { good: "success", fair: "info", poor: "warning", negative: "danger" } as const;

// One question of the item analysis. Questions with options expand to show how many picked each one.
export function ItemAnalysisRow({ item }: { item: ItemRowData }) {
  const [open, setOpen] = useState(false);
  const { distractors } = item;
  const peak = Math.max(1, ...(distractors ?? []).map((d) => d.count));
  return (
    <>
      <tr>
        <Td className="tabular-nums">
          {distractors ? (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={`Answer spread for question ${item.number}`}
              className="-ml-1 inline-flex items-center gap-1 rounded px-1 font-semibold hover:bg-surface-muted"
            >
              <ChevronRight className={clsx("size-3.5 transition-transform", open && "rotate-90")} aria-hidden />Q{item.number}
            </button>
          ) : (
            <span className="pl-5 font-semibold">Q{item.number}</span>
          )}
        </Td>
        <Td className="hidden text-muted sm:table-cell">{item.typeLabel}</Td>
        <Td>
          <div className="flex items-center gap-3">
            <PercentBar percent={item.percent} className="min-w-16 flex-1" />
            <span className="w-10 text-right tabular-nums">{item.percent === null ? "—" : `${item.percent}%`}</span>
          </div>
        </Td>
        <Td>
          {item.discrimination === null || item.quality === null ? (
            <span className="text-muted">—</span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span className={clsx("tabular-nums", item.quality === "negative" && "font-semibold text-danger")}>
                {item.discrimination.toFixed(2)}
              </span>
              <Badge tone={qualityTone[item.quality]}>{item.quality === "negative" ? "Negative" : item.quality[0]!.toUpperCase() + item.quality.slice(1)}</Badge>
            </span>
          )}
        </Td>
        <Td className="text-right tabular-nums">{item.n}</Td>
      </tr>
      {open && distractors && (
        <tr>
          <td colSpan={5} className="border-b border-border bg-surface-muted/50 px-5 py-3">
            <ul className="space-y-1.5" aria-label={`Answers to question ${item.number}`}>
              {distractors.map((d) => (
                <li key={d.label} className="flex items-center gap-3 text-xs">
                  <span className={clsx("w-48 shrink-0 truncate sm:w-64", d.correct && "font-semibold")} title={d.label}>
                    {d.label}
                    {d.correct && <span className="sr-only"> (correct)</span>}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                    <div className={clsx("h-full rounded-full", d.correct ? "bg-success" : "bg-border")} style={{ width: `${(d.count / peak) * 100}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right tabular-nums">{d.count}</span>
                  <span className="w-14 shrink-0 text-success">{d.correct ? "Correct" : ""}</span>
                </li>
              ))}
              <li className="flex items-center gap-3 text-xs text-muted">
                <span className="w-48 shrink-0 sm:w-64">No answer</span>
                <span className="flex-1" />
                <span className="w-16 shrink-0 text-right tabular-nums">{item.blank}</span>
                <span className="w-14 shrink-0" />
              </li>
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
