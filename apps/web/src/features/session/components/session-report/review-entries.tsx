import { triesText } from "@/features/mastery/components/mastery-results";
import { Badge } from "@/components/ui";
import { questionTypeLabel } from "@/lib/format";
import { Review } from "@/components/question-kinds/views/review";
import type { MyResult } from "@examinus/contract/attempt";
import { quadrantLabels, type SessionAnalytics } from "@examinus/domain/analytics";
import type { ReviewEntry } from "./question-review-list";

// The review list is a client component (it filters and expands), but the answers are drawn here on the server,
// where the markdown, drawings and placement reviews already render; the client only receives the finished markup.
export function buildReviewEntries(r: MyResult, analytics: SessionAnalytics): ReviewEntry[] {
  return r.items.map(({ question: q, answer, points, feedback, mastery, answerChanges }, i) => {
    const a = analytics.questions[i]!;
    const full = points !== null && points >= q.points;
    return {
      id: q.id,
      number: i + 1,
      outcome: a.outcome,
      status: points === null ? "pending" : full ? "full" : points > 0 ? "partial" : "wrong",
      tags: a.topicTags,
      timeMs: a.timeTakenMs,
      deltaMs: a.deltaMs,
      quadrant: a.quadrant,
      quadrantLabel: a.quadrant ? quadrantLabels[a.quadrant] : null,
      answerChanges,
      prompt: <Review mode="prompt" q={q} answer={answer} urls={r.assetUrls} />,
      side: (
        <>
          <Badge tone={points === null ? "neutral" : full ? "success" : points > 0 ? "warning" : "danger"}>
            {points === null ? "To grade" : `${points} / ${q.points}`}
          </Badge>
          <p className="mt-1 text-xs text-muted">{questionTypeLabel[q.type]}</p>
          {mastery && (
            <p className="mt-0.5 text-xs font-medium" data-testid="mastery-tries">
              {mastery.mastered === null ? "Waits for grading" : mastery.mastered ? "Mastered" : "Not mastered"} · {triesText(mastery.tries)}
            </p>
          )}
        </>
      ),
      body: <Review mode="result" q={q} answer={answer} full={full} feedback={feedback} urls={r.assetUrls} />,
    };
  });
}
