"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Check, ChevronDown, Clock, X } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import type { Outcome, Quadrant } from "@examinus/contract/analytics";
import { formatDelta, formatMs, questionAnchor } from "./format";

// One question of the attempt. `prompt`, `side` and `body` are drawn on the server (markdown, drawings…), so this
// component only filters and expands what it is given.
export type ReviewEntry = {
  id: string;
  number: number;
  outcome: Outcome;
  status: "pending" | "full" | "partial" | "wrong";
  tags: readonly string[];
  timeMs: number | null;
  deltaMs: number | null;
  quadrant: Quadrant | null;
  quadrantLabel: string | null;
  answerChanges: number | null;
  prompt: ReactNode;
  side: ReactNode;
  body: ReactNode;
};

const statusStyle = {
  pending: "bg-surface-muted text-muted",
  full: "bg-success-soft text-success",
  partial: "bg-warning-soft text-warning",
  wrong: "bg-danger-soft text-danger",
} as const;

const quadrantTone = { fluent_recall: "success", effortful_success: "info", impulsive_error: "danger", time_sink: "warning" } as const;

type Filter = { kind: "all" } | { kind: "incorrect" } | { kind: "time_sink" } | { kind: "topic"; topic: string };

const matches = (e: ReviewEntry, f: Filter) =>
  f.kind === "all" ||
  (f.kind === "incorrect" && (e.outcome === "incorrect" || e.outcome === "skipped")) ||
  (f.kind === "time_sink" && e.quadrant === "time_sink") ||
  (f.kind === "topic" && e.tags.includes(f.topic));

export function QuestionReviewList({ entries }: { entries: ReviewEntry[] }) {
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());

  const topics = useMemo(() => [...new Set(entries.flatMap((e) => e.tags))], [entries]);
  const shown = entries.filter((e) => matches(e, filter));

  // A link from the timeline lands on its question, even when a filter hides it or its answer is folded.
  useEffect(() => {
    const goTo = () => {
      const number = entries.find((e) => `#${questionAnchor(e.number)}` === window.location.hash)?.number;
      if (number === undefined) return;
      setFilter({ kind: "all" });
      setOpen((o) => new Set(o).add(number));
      requestAnimationFrame(() => document.getElementById(questionAnchor(number))?.scrollIntoView({ block: "start" }));
    };
    goTo();
    window.addEventListener("hashchange", goTo);
    return () => window.removeEventListener("hashchange", goTo);
  }, [entries]);

  const toggle = (n: number) =>
    setOpen((o) => {
      const next = new Set(o);
      if (!next.delete(n)) next.add(n);
      return next;
    });

  const chips: { label: string; filter: Filter; count: number }[] = [
    { label: "All", filter: { kind: "all" }, count: entries.length },
    { label: "Incorrect", filter: { kind: "incorrect" }, count: entries.filter((e) => matches(e, { kind: "incorrect" })).length },
    { label: "Time sinks", filter: { kind: "time_sink" }, count: entries.filter((e) => matches(e, { kind: "time_sink" })).length },
    ...topics.map((topic) => ({
      label: topic,
      filter: { kind: "topic", topic } as Filter,
      count: entries.filter((e) => e.tags.includes(topic)).length,
    })),
  ];
  const active = (f: Filter) => f.kind === filter.kind && (f.kind !== "topic" || (filter.kind === "topic" && filter.topic === f.topic));

  return (
    <Card>
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-semibold">Question review</h2>
        <div role="group" aria-label="Filter questions" className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={`${c.filter.kind}:${c.filter.kind === "topic" ? c.filter.topic : ""}`}
              type="button"
              aria-pressed={active(c.filter)}
              onClick={() => setFilter(c.filter)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                active(c.filter) ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-foreground",
              )}
            >
              {c.label} <span className="tabular-nums">{c.count}</span>
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">No questions match this filter.</p>
      ) : (
        <ol className="divide-y divide-border">
          {shown.map((e) => {
            const expanded = open.has(e.number);
            return (
              <li key={e.id} id={questionAnchor(e.number)} className="scroll-mt-20 px-5 py-4 text-sm">
                <div className="flex gap-3">
                  <span className={clsx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", statusStyle[e.status])}>
                    {e.status === "pending" ? (
                      <Clock className="size-3.5" aria-label="Waiting for grading" />
                    ) : e.status === "full" ? (
                      <Check className="size-3.5" aria-label="Correct" />
                    ) : (
                      <X className="size-3.5" aria-label={e.status === "partial" ? "Partly right" : "Wrong"} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex gap-1.5">
                      <span className="text-muted">{e.number}.</span>
                      {e.prompt}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {e.tags.map((t) => (
                        <Badge key={t} tone="primary">
                          {t}
                        </Badge>
                      ))}
                      {e.timeMs !== null && (
                        <Badge>
                          {formatMs(e.timeMs)}
                          {e.deltaMs !== null && ` · ${formatDelta(e.deltaMs)} vs avg`}
                        </Badge>
                      )}
                      {e.quadrant && e.quadrantLabel && <Badge tone={quadrantTone[e.quadrant]}>{e.quadrantLabel}</Badge>}
                      {e.answerChanges !== null && (
                        <Badge>
                          {e.answerChanges} answer {e.answerChanges === 1 ? "change" : "changes"}
                        </Badge>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`${questionAnchor(e.number)}-details`}
                      onClick={() => toggle(e.number)}
                      className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <ChevronDown className={clsx("size-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
                      {expanded ? "Hide answer" : "Show answer"}
                    </button>
                    <div id={`${questionAnchor(e.number)}-details`} hidden={!expanded}>
                      {expanded && e.body}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">{e.side}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
