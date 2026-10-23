"use client";

import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import type { Accommodations } from "@examinus/domain/accommodations";
import { Select } from "@/components/select";
import { Badge, EmptyState, inputBase } from "@/components/ui";
import { SortHeader, type SortDir } from "@/components/sort-header";
import { band, barColor } from "./charts";
import { AccommodationsChip, AccommodationsDialog } from "./accommodations-dialog";

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
  timeMs: number | null;
  integrityLevel: "low" | "medium" | "high" | null;
  status: StudentStatus;
  accommodations: Accommodations | null;
  links: ReactNode;
};

const statusTone = { Graded: "success", "Needs grading": "warning", "In progress": "info", "Not submitted": "neutral" } as const;
const filters: ("All" | StudentStatus)[] = ["All", "Graded", "Needs grading", "In progress", "Not submitted"];

type SortKey = "name" | "attempts" | "score" | "time" | "status" | "integrity";
const defaultDir: Record<SortKey, SortDir> = { name: "asc", attempts: "desc", score: "desc", time: "desc", status: "asc", integrity: "desc" };
// Ascending status order: graded first.
const statusRank: Record<StudentStatus, number> = { Graded: 0, "Needs grading": 1, "In progress": 2, "Not submitted": 3 };
// Ascending is none < low < medium < high.
const integrityRank = { none: 0, low: 1, medium: 2, high: 3 } as const;

export function StudentsTable({
  rows,
  sessionId,
  exam,
  editable,
}: {
  rows: StudentRow[];
  sessionId: string;
  // Exam sessions can exempt a student from the exam rules.
  exam: boolean;
  // Accommodations can be changed until the session has ended.
  editable: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof filters)[number]>("All");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter(
      (r) => (status === "All" || r.status === status) && (!q || r.name.toLowerCase().includes(q) || r.number.toLowerCase().includes(q)),
    );
    if (!sort) return list;
    const sign = sort.dir === "asc" ? 1 : -1;
    // Rows without a value (no score, no time) stay last in either direction.
    const compare = (a: StudentRow, b: StudentRow) => {
      if (sort.key === "name") return sign * a.name.localeCompare(b.name);
      if (sort.key === "attempts") return sign * (a.attempts - b.attempts);
      if (sort.key === "status") return sign * (statusRank[a.status] - statusRank[b.status]);
      if (sort.key === "integrity") return sign * (integrityRank[a.integrityLevel ?? "none"] - integrityRank[b.integrityLevel ?? "none"]);
      const x = sort.key === "score" ? a.percent : a.timeMs;
      const y = sort.key === "score" ? b.percent : b.timeMs;
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return sign * (x - y);
    };
    return list.toSorted(compare);
  }, [rows, query, status, sort]);

  const head = (key: SortKey) => ({
    active: sort?.key === key,
    dir: sort?.key === key ? sort.dir : defaultDir[key],
    onSort: () => setSort((s) => ({ key, dir: s?.key === key ? (s.dir === "asc" ? "desc" : "asc") : defaultDir[key] })),
  });

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
          <Select
            value={status}
            onChange={setStatus}
            options={filters.map((f) => ({ value: f, label: f }))}
          />
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
                <SortHeader className="px-5 py-2.5" {...head("name")}>Student</SortHeader>
                <SortHeader className="px-3 py-2.5" align="right" {...head("attempts")}>Attempts</SortHeader>
                <SortHeader className="px-3 py-2.5" {...head("score")}>Score</SortHeader>
                <SortHeader className="hidden px-3 py-2.5 md:table-cell" {...head("time")}>Time</SortHeader>
                <SortHeader className="px-3 py-2.5" {...head("status")}>Status</SortHeader>
                <th scope="col" className="px-3 py-2.5 font-medium">Accommodations</th>
                <SortHeader className="px-5 py-2.5" {...head("integrity")}>Integrity</SortHeader>
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
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <AccommodationsChip accommodations={r.accommodations} />
                      {editable && (
                        <AccommodationsDialog
                          sessionId={sessionId}
                          studentId={r.id}
                          name={r.name}
                          accommodations={r.accommodations}
                          exam={exam}
                        />
                      )}
                    </div>
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
