import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { CheckCircle2, Clock } from "lucide-react";
import { Button, ButtonLink, Card } from "@/components/ui";
import { CoachCard } from "@/features/session/components/session-report/coach-card";
import { practiceTypes } from "@/features/session/components/session-report/format";
import { KpiRibbon } from "@/features/session/components/session-report/kpi-ribbon";
import { PaceTimeline } from "@/features/session/components/session-report/pace-timeline";
import { QuestionReviewList } from "@/features/session/components/session-report/question-review-list";
import { buildReviewEntries } from "@/features/session/components/session-report/review-entries";
import { TopicMastery } from "@/features/session/components/session-report/topic-mastery";
import { analyzeAttempt, fallbackCoach, resultTelemetry, weakestTopic } from "@examinus/domain/analytics";
import { getMyResult } from "@/features/attempt/data";
import { formatDateTime } from "@/lib/format";
import { attemptLabel, hasAttemptsLeft } from "@/features/attempt/attempts";
import { availability } from "@/features/session/sessions";
import { modeLabel } from "@examinus/copy/modes";
import { percent } from "@examinus/domain/scoring";
import { attemptHrefs, type PlayerArea } from "../hrefs";

const waiting = {
  immediately: "",
  after_close: "Your score and the answers will show here after it closes",
  manual: "Your score will show here when your teacher releases it",
};

// The player's latest attempt: the score once released, the report, and what to do next. The same for a student
// and a guest; `area` decides where the links lead. `submitted`: they just handed in (the banner at the top).
export async function AttemptResult({ sessionId, area, submitted }: { sessionId: string; area: PlayerArea; submitted: boolean }) {
  const r = await getMyResult(sessionId);
  if (!r) notFound();
  const { session: s, quiz } = r;
  const hrefs = attemptHrefs(area, s.id);
  const when = availability(s.status);
  // The Try again button only shows when the teacher allowed retakes and there are some left.
  const canRetake = when === "open" && hasAttemptsLeft(r.attemptsUsed, s.attemptsAllowed);
  // Mastery: how many questions were mastered, and whether the teacher's target was reached.
  const mastered = r.items.filter((i) => i.mastery?.mastered === true).length;
  const targetMet =
    s.mastery?.targetPercent != null && r.summary ? percent(r.summary.score, r.summary.max) >= s.mastery.targetPercent : null;

  // The report needs the released answers; for an exam, only once the teacher has released the results.
  const reportable = r.summary !== null && r.items.length > 0 && (s.mode !== "exam" || r.visible);
  const analytics = reportable ? analyzeAttempt(resultTelemetry(r, r.userId)) : null;
  const fallback = analytics ? fallbackCoach(analytics) : null;
  const weakest = analytics ? weakestTopic(analytics) : null;
  // Only questions the practice page can check count, so the number matches what the student gets.
  const missed = analytics
    ? analytics.questions.filter((q, i) => (q.outcome === "incorrect" || q.outcome === "skipped") && practiceTypes.has(r.items[i]!.question.type)).length
    : 0;

  return (
    <div className={clsx("mx-auto space-y-4", analytics ? "max-w-6xl" : "max-w-2xl")}>
      {hrefs.list && (
        <Link href={hrefs.list} className="inline-block text-sm text-muted hover:text-foreground">
          ← Quizzes & exams
        </Link>
      )}

      {submitted && r.submittedAt && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success-soft p-3 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />{" "}
          {s.mode === "exam" && !r.summary
            ? "Your exam was submitted. Results will be available when your teacher releases them."
            : s.mode === "exam"
              ? "Your exam was submitted."
              : "Your answers were submitted."}
        </p>
      )}

      <Card className="p-6 text-center">
        <p className="text-sm text-muted">{r.classes.map((c) => `${c.courseCode} · ${c.section}`).join(", ")}</p>
        <h1 className="mt-1 text-xl font-semibold">{quiz.title}</h1>
        {!r.submittedAt ? (
          <p className="mt-4 text-sm text-danger">
            {when === "closed" ? "You didn't submit this one before it closed." : "You haven't submitted this yet."}
          </p>
        ) : r.summary ? (
          <>
            <p className="mt-4 text-5xl font-semibold tabular-nums">
              {r.summary.score} <span className="text-2xl text-muted">/ {r.summary.max}</span>
            </p>
            <p className="mt-1 text-sm text-muted">
              {percent(r.summary.score, r.summary.max)}%
              {r.summary.pendingEssays > 0 &&
                ` so far · ${r.summary.pendingEssays} ${r.summary.pendingEssays === 1 ? "answer is" : "answers are"} still being graded`}
            </p>
            {s.mastery && r.items.length > 0 && (
              <p className="mt-2 text-sm font-medium" data-testid="mastery-summary">
                {mastered} of {r.items.length} questions mastered
                {targetMet !== null && (
                  <span className={targetMet ? "ml-2 text-success" : "ml-2 text-danger"}>
                    {targetMet ? "· target reached" : `· target of ${s.mastery.targetPercent}% not reached`}
                  </span>
                )}
              </p>
            )}
            {!r.answerKey && (
              <p className="mt-2 text-sm text-muted">
                The questions and answers will show here once you&apos;ve used all your attempts or it closes.
              </p>
            )}
          </>
        ) : (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted">
            <Clock className="size-4" aria-hidden />
            {waiting[s.resultsRelease]}
            {s.resultsRelease === "after_close" && s.closesAt && ` (${formatDateTime(s.closesAt)})`}.
          </p>
        )}
        {r.submittedAt && (
          <p className="mt-3 text-xs text-muted">
            Submitted {formatDateTime(r.submittedAt)}
            {s.attemptsAllowed !== 1 && ` · ${attemptLabel(r.attemptsUsed, s.attemptsAllowed)}`}
          </p>
        )}
        {r.paperVersion && r.visible && (
          <p className="mt-1 text-xs text-muted">
            Paper version <span className="font-mono font-medium text-foreground">{r.paperVersion}</span>
          </p>
        )}
        {(canRetake || (!r.submittedAt && when === "open")) && (
          <ButtonLink href={hrefs.take} className="mt-4">
            {r.submittedAt ? "Try again" : `Start ${modeLabel(s.mode).toLowerCase()}`}
          </ButtonLink>
        )}
      </Card>

      {analytics && r.summary && (
        <>
          <CoachCard sessionId={s.id} fallback={fallback!} practiceHref={hrefs.practice} />
          <KpiRibbon analytics={analytics} score={r.summary.score} max={r.summary.max} pendingEssays={r.summary.pendingEssays} />
          <div className="grid gap-4 lg:grid-cols-2">
            <TopicMastery topics={analytics.topics} />
            <PaceTimeline analytics={analytics} />
          </div>
          <QuestionReviewList entries={buildReviewEntries(r, analytics)} />
          <Card className="flex flex-wrap items-center gap-3 p-5">
            <h2 className="mr-auto font-semibold">What next?</h2>
            {missed > 0 && (
              <ButtonLink href={`${hrefs.practice}?scope=missed`} variant="secondary">
                Practice missed questions ({missed})
              </ButtonLink>
            )}
            {weakest && (
              <ButtonLink href={`${hrefs.practice}?topic=${encodeURIComponent(weakest)}`} variant="secondary">
                Start drill on weakest topic
              </ButtonLink>
            )}
            {canRetake ? (
              <ButtonLink href={hrefs.take}>Retake entire quiz</ButtonLink>
            ) : (
              <span className="flex items-center gap-2 text-sm text-muted">
                {when === "open" ? "No attempts left." : "This one is closed."}
                <Button disabled>Retake entire quiz</Button>
              </span>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
