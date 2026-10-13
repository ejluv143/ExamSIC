import { Badge, Card, CardHeader } from "@/components/ui";
import { topicBadgeLabels, type TopicBadge, type TopicStat } from "@examinus/domain/analytics";
import { formatMs } from "./format";

const badgeTone = { strength: "success", needs_review: "danger", hesitation: "warning" } as const satisfies Record<TopicBadge, string>;
const barColor = { strength: "bg-success", needs_review: "bg-danger", hesitation: "bg-warning" } as const satisfies Record<TopicBadge, string>;

export function TopicMastery({ topics }: { topics: readonly TopicStat[] }) {
  return (
    <Card>
      <CardHeader title="Topic mastery" description="How you did in each topic of this attempt." />
      <ul className="divide-y divide-border">
        {topics.map((t) => (
          <li key={t.topic} className="space-y-2 px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{t.topic}</span>
              {t.badge && <Badge tone={badgeTone[t.badge]}>{topicBadgeLabels[t.badge]}</Badge>}
              <span className="ml-auto text-sm font-medium tabular-nums">{t.accuracy === null ? "Waiting for grading" : `${t.accuracy}%`}</span>
            </div>
            <div
              role="progressbar"
              aria-label={`${t.topic} accuracy`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={t.accuracy ?? undefined}
              className="h-2 overflow-hidden rounded-full bg-surface-muted"
            >
              <div className={`h-full rounded-full ${t.badge ? barColor[t.badge] : "bg-primary"}`} style={{ width: `${t.accuracy ?? 0}%` }} />
            </div>
            <p className="text-xs text-muted">
              {t.correct} of {t.graded} right · {t.total} {t.total === 1 ? "question" : "questions"} ({Math.round(t.weight * 100)}% of the attempt)
              {t.medianTimeMs !== null && ` · median ${formatMs(t.medianTimeMs)}`}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
