import clsx from "clsx";
import { Badge } from "@/components/ui";
import { topicBadgeLabels } from "@examinus/contract/analytics";

// Plain SVG and CSS charts on the theme tokens, so they follow light and dark mode.

export type Band = "danger" | "warning" | "success";

// Under 50% is weak, under 75% is middling.
export const band = (p: number): Band => (p < 50 ? "danger" : p < 75 ? "warning" : "success");

export const barColor: Record<Band, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
};

export function ProgressRing({ value, total, label }: { value: number; total: number; label: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <svg viewBox="0 0 64 64" className="size-14 shrink-0 -rotate-90" role="img" aria-label={label}>
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-surface-muted" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${share * c} ${c}`}
        className="stroke-primary"
      />
    </svg>
  );
}

// Students per 10% bucket; 100% joins the top bucket.
export function Histogram({ percents }: { percents: number[] }) {
  const buckets = Array.from({ length: 10 }, () => 0);
  for (const p of percents) buckets[Math.min(9, Math.floor(p / 10))]++;
  const peak = Math.max(...buckets, 1);
  const label = `Score distribution of ${percents.length} students: ${buckets
    .map((n, i) => `${i * 10} to ${i === 9 ? 100 : i * 10 + 9} percent, ${n}`)
    .join("; ")}`;

  if (percents.length === 0)
    return <p className="px-5 py-10 text-center text-sm text-muted">No completed scores yet.</p>;

  return (
    <div className="px-5 py-4">
      <div role="img" aria-label={label} className="flex h-40 items-end gap-1.5 border-b border-border">
        {buckets.map((n, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${i * 10}–${i === 9 ? 100 : i * 10 + 9}%: ${n}`}>
            {n > 0 && <span className="mb-1 text-center text-xs tabular-nums text-muted">{n}</span>}
            <div
              className={clsx("rounded-t", barColor[band(i * 10 + 5)])}
              style={{ height: `${(n / peak) * 80}%`, minHeight: n > 0 ? 4 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 text-[10px] text-muted tabular-nums" aria-hidden>
        {buckets.map((_, i) => (
          <span key={i} className="flex-1 text-center">
            {i * 10}
          </span>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-muted">Score (%) · students per 10% bucket</p>
    </div>
  );
}

export function PercentBar({ percent, className }: { percent: number | null; className?: string }) {
  return (
    <div
      role="img"
      aria-label={percent === null ? "No data" : `${percent} percent`}
      className={clsx("h-2 overflow-hidden rounded-full bg-surface-muted", className)}
    >
      {percent !== null && <div className={clsx("h-full rounded-full", barColor[band(percent)])} style={{ width: `${percent}%` }} />}
    </div>
  );
}

export type StatusSlice = { label: string; count: number; color: string; tone: "success" | "warning" | "info" | "neutral" };

export function StatusBreakdown({ slices }: { slices: StatusSlice[] }) {
  const total = slices.reduce((n, s) => n + s.count, 0);
  if (total === 0) return <p className="px-5 py-10 text-center text-sm text-muted">No students on this session.</p>;
  return (
    <div className="space-y-4 px-5 py-4">
      <div
        role="img"
        aria-label={`Status of ${total} students: ${slices.map((s) => `${s.label} ${s.count}`).join(", ")}`}
        className="flex h-4 overflow-hidden rounded-full bg-surface-muted"
      >
        {slices
          .filter((s) => s.count > 0)
          .map((s) => (
            <div key={s.label} className={s.color} style={{ width: `${(s.count / total) * 100}%` }} title={`${s.label}: ${s.count}`} />
          ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={clsx("size-2.5 rounded-full", s.color)} aria-hidden />
            <span className="text-muted">{s.label}</span>
            <span className="ml-auto font-medium tabular-nums">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type TopicRow = { topic: string; accuracy: number; answers: number; medianTime: string };

export function TopicMastery({ rows }: { rows: TopicRow[] }) {
  if (rows.length === 0) return <p className="px-5 py-10 text-center text-sm text-muted">Nothing graded yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.topic} className="px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 flex-1 truncate font-medium" title={r.topic}>
              {r.topic}
            </span>
            {r.accuracy < 60 ? (
              <Badge tone="danger">{topicBadgeLabels.needs_review}</Badge>
            ) : r.accuracy >= 80 ? (
              <Badge tone="success">{topicBadgeLabels.strength}</Badge>
            ) : null}
            <span className="w-10 text-right text-sm font-semibold tabular-nums">{r.accuracy}%</span>
          </div>
          <PercentBar percent={r.accuracy} className="mt-2" />
          <p className="mt-1 text-xs text-muted tabular-nums">
            {r.answers} {r.answers === 1 ? "answer" : "answers"} · median time {r.medianTime}
          </p>
        </li>
      ))}
    </ul>
  );
}
