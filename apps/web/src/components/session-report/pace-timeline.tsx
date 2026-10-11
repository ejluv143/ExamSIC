import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { quadrantLabels, type HalfStat, type SessionAnalytics } from "@examinus/contract/analytics";
import { formatDelta, formatMs, questionAnchor } from "./format";

const barColor = { correct: "bg-success", incorrect: "bg-danger", skipped: "bg-danger", pending: "bg-border" } as const;

function Half({ title, stat }: { title: string; stat: HalfStat }) {
  return (
    <div className="rounded-lg bg-surface-muted p-3">
      <p className="text-xs text-muted">{title}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums">
        {formatMs(stat.avgTimeMs)} per question · {stat.accuracy === null ? "—" : `${stat.accuracy}%`} right
      </p>
    </div>
  );
}

export function PaceTimeline({ analytics }: { analytics: SessionAnalytics }) {
  const { questions, summary, pacing } = analytics;
  const times = questions.map((q) => q.timeTakenMs ?? 0);
  const max = Math.max(0, ...times);
  const recorded = max > 0;
  const labelEvery = questions.length <= 20 ? 1 : 5;

  return (
    <Card>
      <CardHeader title="Pace & fatigue" description="Time spent on each question, in order. Select a bar to jump to it." />
      <div className="space-y-4 p-5">
        {!recorded ? (
          <p className="text-sm text-muted">Time per question wasn&apos;t recorded for this attempt.</p>
        ) : (
          <>
            <div className="overflow-x-auto pb-1">
              <div style={{ minWidth: `${questions.length * 10}px` }}>
                <div className="relative h-40 pt-3">
                  <div className="flex h-full items-end gap-0.5 sm:gap-1">
                    {questions.map((q) => {
                      const label = `Q${q.index + 1} · ${q.timeTakenMs === null ? "no time recorded" : formatMs(q.timeTakenMs)}${q.quadrant === "time_sink" ? ` · ${quadrantLabels.time_sink}` : ""}`;
                      const height = q.timeTakenMs === null ? 0 : Math.max(3, (q.timeTakenMs / max) * 100);
                      return (
                        <a
                          key={q.questionId}
                          href={`#${questionAnchor(q.index + 1)}`}
                          title={label}
                          aria-label={`${label}, ${q.outcome}`}
                          className="group flex h-full min-w-1 flex-1 items-end rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          <span
                            className={clsx(
                              "relative block w-full rounded-t-sm transition-opacity group-hover:opacity-80",
                              q.timeTakenMs === null ? "bg-surface-muted" : barColor[q.outcome],
                            )}
                            style={{ height: `${q.timeTakenMs === null ? 3 : height}%` }}
                          >
                            {q.quadrant === "time_sink" && (
                              <span aria-hidden className="absolute -top-2.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-warning" />
                            )}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                  {summary.avgTimeMs !== null && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted"
                      style={{ bottom: `${(Math.min(summary.avgTimeMs, max) / max) * (100 - 7.5)}%` }}
                    >
                      <span className="absolute -top-4 right-0 rounded bg-surface px-1 text-[10px] text-muted">avg {formatMs(summary.avgTimeMs)}</span>
                    </div>
                  )}
                </div>
                <div aria-hidden className="mt-1 flex gap-0.5 text-[10px] text-muted sm:gap-1">
                  {questions.map((q) => (
                    <span key={q.questionId} className="min-w-1 flex-1 overflow-visible text-center">
                      {(q.index + 1) % labelEvery === 0 || q.index === 0 ? q.index + 1 : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <li className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-sm bg-success" /> Correct</li>
              <li className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-sm bg-danger" /> Incorrect or skipped</li>
              <li className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-sm bg-border" /> Waiting for grading</li>
              <li className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-warning" /> Time sink</li>
            </ul>
            <div className="grid gap-2 sm:grid-cols-2">
              <Half title="First half" stat={pacing.firstHalf} />
              <Half title="Second half" stat={pacing.secondHalf} />
            </div>
            {pacing.driftMs !== null && (
              <p className="text-xs text-muted">
                Pace drift: {formatDelta(pacing.driftMs)} per question from the first half to the second.
              </p>
            )}
          </>
        )}
        {pacing.fatigue && (
          <p role="status" className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-medium">Cognitive fatigue detected.</span> You slowed down and made more mistakes in the second half. Short breaks between sections can help.
            </span>
          </p>
        )}
      </div>
    </Card>
  );
}
