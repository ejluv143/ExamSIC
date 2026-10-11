"use client";

import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import { Badge, EmptyState, inputBase } from "@/components/ui";
import { band, barColor } from "./charts";

export type StudentStatus = "Graded" | "Needs grading" | "In progress" | "Not submitted";

// Plain data computed on the server; the integrity and report links arrive already rendered.
export type StudentRow = {
  id: string;
  name: string;
  number: string;
  initials: string;
  attempts: number;
  percent: number | null;
  scoreText: string | null;
  partial: boolean;
  timeText: string;
  status: StudentStatus;
  links: ReactNode;
};

const statusTone = { Graded: "success", "Needs grading": "warning", "In progress": "info", "Not submitted": "neutral" } as const;
const filters: ("All" | StudentStatus)[] = ["All", "Graded", "Needs grading", "In progress", "Not submitted"];

export function StudentsTable({ rows }: { rows: StudentRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof filters)[number]>("All");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) => (status === "All" || r.status === status) && (!q || r.name.toLowerCase().includes(q) || r.number.toLowerCase().includes(q)),
    );
  }, [rows, query, status]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <label className="relative min-w-48 flex-1 sm:max-w-xs">
          <span className="sr-only">Search students</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or number"
            className={clsx(inputBase, "w-full pl-9")}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputBase}>
            {filters.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <p className="ml-auto text-xs text-muted tabular-nums" aria-live="polite">
          {shown.length} of {rows.length}
        </p>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No students match" />
      ) : (
        <div className="max-h-[34rem] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface-muted text-xs text-muted uppercase">
              <tr>
                <th className="px-5 py-2.5 font-medium">Student</th>
                <th className="px-3 py-2.5 text-right font-medium">Attempts</th>
                <th className="px-3 py-2.5 font-medium">Score</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Time</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Integrity</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary"
                        aria-hidden
                      >
                        {r.initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.name}</p>
                        <p className="font-mono text-xs text-muted">{r.number}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.attempts}</td>
                  <td className="min-w-36 px-3 py-3">
                    {r.percent === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <div>
                        <div className="flex items-baseline justify-between gap-2 tabular-nums">
                          <span className="font-semibold">
                            {r.percent}%{r.partial && <span className="ml-1 text-xs font-normal text-muted">so far</span>}
                          </span>
                          <span className="text-xs text-muted">{r.scoreText}</span>
                        </div>
                        <div
                          role="img"
                          aria-label={`${r.percent} percent`}
                          className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted"
                        >
                          <div className={clsx("h-full rounded-full", barColor[band(r.percent)])} style={{ width: `${r.percent}%` }} />
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="hidden px-3 py-3 whitespace-nowrap text-muted tabular-nums md:table-cell">{r.timeText}</td>
                  <td className="px-3 py-3">
                    <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-1">{r.links}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
