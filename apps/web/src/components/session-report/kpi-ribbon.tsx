import clsx from "clsx";
import { Clock, Gauge } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import type { Outcome, Quadrant, SessionAnalytics } from "@examinus/contract/analytics";
import { percent } from "@examinus/contract/scoring";
import { formatDelta, formatMs } from "./format";
import { ScoreGauge } from "./score-gauge";

const outcomes: { key: Outcome; label: string; bar: string; dot: string }[] = [
  { key: "correct", label: "Correct", bar: "bg-success", dot: "bg-success" },
  { key: "incorrect", label: "Incorrect", bar: "bg-danger", dot: "bg-danger" },
  { key: "skipped", label: "Skipped", bar: "bg-warning", dot: "bg-warning" },
  { key: "pending", label: "Pending", bar: "bg-border", dot: "bg-border" },
];

const behaviours: { key: Quadrant; one: string; many: string; tone: "success" | "info" | "danger" | "warning" }[] = [
  { key: "fluent_recall", one: "Fluent", many: "Fluent", tone: "success" },
  { key: "effortful_success", one: "Effortful", many: "Effortful", tone: "info" },
  { key: "impulsive_error", one: "Impulsive", many: "Impulsive", tone: "danger" },
  { key: "time_sink", one: "Time sink", many: "Time sinks", tone: "warning" },
];

export function KpiRibbon({
  analytics,
  score,
  max,
  pendingEssays,
}: {
  analytics: SessionAnalytics;
  score: number;
  max: number;
  pendingEssays: number;
}) {
  const { summary, behavior } = analytics;
  const scored = summary.total - summary.pending;
  const main = percent(score, max);
  const tags = behaviours.filter((b) => behavior[b.key] > 0);

  return (
    <section aria-label="Key numbers" className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr]">
      <Card className="flex items-center gap-4 p-5">
        <ScoreGauge percent={main} label="Score" sublabel={`${score} / ${max} pts`} />
        <div className="min-w-0 text-sm">
          <p className="font-semibold">Score</p>
          <p className="mt-1 text-muted">
            {summary.accuracy === null ? "—" : `${summary.accuracy}%`} accuracy
            <span className="block">
              {summary.correct} of {scored} questions right
            </span>
          </p>
          {pendingEssays > 0 && <p className="mt-1 text-xs text-warning">{pendingEssays} still being graded</p>}
        </div>
      </Card>

      <Card className="p-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="size-4 text-muted" aria-hidden /> Time spent
        </p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">
          {summary.totalDurationMs > 0 ? formatMs(summary.totalDurationMs) : "—"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {summary.avgTimeMs === null ? "Time per question wasn't recorded" : `${formatMs(summary.avgTimeMs)} per question on average`}
        </p>
        <div className="mt-3">
          {summary.pacingDeltaMs !== null && summary.targetTimeMs !== null ? (
            <Badge tone={summary.pacingDeltaMs <= 0 ? "success" : "warning"}>
              {formatDelta(summary.pacingDeltaMs)} vs {formatMs(summary.targetTimeMs)} target
            </Badge>
          ) : (
            <Badge>No time target</Badge>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="size-4 text-muted" aria-hidden /> How you worked
        </p>
        {tags.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {tags.map((b) => (
              <li key={b.key}>
                <Badge tone={b.tone}>
                  {behavior[b.key]} {behavior[b.key] === 1 ? b.one : b.many}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Not enough timing data to tell.</p>
        )}
      </Card>

      <Card className="p-5">
        <p className="text-sm font-semibold">Outcomes</p>
        <div
          role="img"
          aria-label={outcomes.map((o) => `${summary[o.key]} ${o.label.toLowerCase()}`).join(", ")}
          className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-muted"
        >
          {outcomes.map(
            (o) => summary[o.key] > 0 && <span key={o.key} className={o.bar} style={{ width: `${(summary[o.key] / summary.total) * 100}%` }} />,
          )}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          {outcomes.map((o) => (
            <li key={o.key} className="flex items-center gap-2">
              <span aria-hidden className={clsx("size-2 rounded-full", o.dot)} />
              <span className="text-muted">{o.label}</span>
              <span className="ml-auto font-medium tabular-nums">{summary[o.key]}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
