import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { Check, CheckCircle2, Clock, X } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { answerKey, answerText } from "@/lib/answers";
import { AssetImage } from "@/components/asset-image";
import { CategorizationReview, HotspotReview, OrderingReview } from "@/components/placement-review";
import { DrawingPicture } from "@/components/drawing-picture";
import { ZoomImage } from "@/components/zoom-image";
import { blankStyle, parseDrawingAnswer, parseDrawingFeedback } from "@examora/contract";
import type { AnswerValue, Question } from "@examora/contract";
import { getMyResult } from "@/lib/data/student";
import { formatDateTime, questionTypeLabel } from "@/lib/format";
import { triesText } from "@/components/mastery-results";
import { attemptLabel, hasAttemptsLeft } from "@/lib/attempts";
import { availability, modeLabel } from "@/lib/sessions";
import { percent, partResults } from "@examora/contract/scoring";

export const metadata: Metadata = { title: "Result" };

const waiting = {
  immediately: "",
  after_close: "Your score and the answers will show here after it closes",
  manual: "Your score will show here when your teacher releases it",
};

export default async function ResultPage(props: PageProps<"/student/assessments/[sessionId]/result">) {
  const { sessionId } = await props.params;
  const { submitted } = await props.searchParams;
  const r = await getMyResult(sessionId);
  if (!r) notFound();
  const { session: s, quiz } = r;
  const when = availability(s.status);
  // The Try again button only shows when the teacher allowed retakes and there are some left.
  const canRetake = when === "open" && hasAttemptsLeft(r.attemptsUsed, s.attemptsAllowed);
  // Mastery: how many questions were mastered, and whether the teacher's target was reached.
  const mastered = r.items.filter((i) => i.mastery?.mastered === true).length;
  const targetMet =
    s.mastery?.targetPercent != null && r.summary ? percent(r.summary.score, r.summary.max) >= s.mastery.targetPercent : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/student/assessments" className="inline-block text-sm text-muted hover:text-foreground">
        ← Quizzes & exams
      </Link>

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
          <ButtonLink href={`/student/assessments/${s.id}`} className="mt-4">
            {r.submittedAt ? "Try again" : `Start ${modeLabel(s.mode).toLowerCase()}`}
          </ButtonLink>
        )}
      </Card>

      {r.items.length > 0 && (s.mode !== "exam" || r.visible) && (
        <Card>
          <h2 className="border-b border-border px-5 py-3 font-semibold">Your answers</h2>
          <ol className="divide-y divide-border">
            {r.items.map(({ question: q, answer, points, feedback, mastery }, i) => {
              const yours = answerText(q, answer);
              // A drawing's feedback is the teacher's comment plus marks (shown on the picture), never raw JSON.
              const feedbackText = q.type === "drawing" ? parseDrawingFeedback(feedback).text : feedback;
              const parts = partResults(q, answer);
              const inlineBlank = q.type === "blank" && blankStyle(q) !== "single";
              const listed = q.type === "matching" || q.type === "enumeration" || (q.type === "blank" && !inlineBlank);
              const full = points !== null && points >= q.points;
              return (
                <li key={q.id} className="flex gap-3 px-5 py-4 text-sm">
                  <span
                    className={clsx(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                      points === null
                        ? "bg-surface-muted text-muted"
                        : full
                          ? "bg-success-soft text-success"
                          : points > 0
                            ? "bg-warning-soft text-warning"
                            : "bg-danger-soft text-danger",
                    )}
                  >
                    {points === null ? <Clock className="size-3.5" /> : full ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex gap-1.5">
                      <span className="text-muted">{i + 1}.</span>
                      <Markdown
                        className="min-w-0 flex-1"
                        assetUrls={r.assetUrls}
                        renderBlank={
                          inlineBlank
                            ? (b, accepted) => {
                                const part = parts?.[b];
                                return (
                                  <span
                                    className={clsx(
                                      "mx-0.5 inline-block rounded px-1.5 font-medium",
                                      part?.correct ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                                    )}
                                  >
                                    {part?.given || "—"}
                                    {!part?.correct && <span className="ml-1 text-success">({accepted[0]})</span>}
                                  </span>
                                );
                              }
                            : undefined
                        }
                      >
                        {q.prompt}
                      </Markdown>
                    </div>
                    {q.type === "code" || q.type === "sql" ? (
                      yours ? (
                        <pre className="max-h-72 overflow-auto rounded-md bg-surface-muted p-3 font-mono text-xs">
                          {yours}
                        </pre>
                      ) : (
                        <p className="italic text-muted">No answer</p>
                      )
                    ) : q.type === "drawing" ? (
                      <DrawingResult q={q} answer={answer} feedback={feedback} urls={r.assetUrls} />
                    ) : q.type === "essay" ? (
                      yours ? (
                        <Markdown className="rounded-md bg-surface-muted p-3" assetUrls={r.assetUrls}>{yours}</Markdown>
                      ) : (
                        <p className="italic text-muted">No answer</p>
                      )
                    ) : q.type === "categorization" ? (
                      <CategorizationReview q={q} value={answer} assetUrls={r.assetUrls} showKey />
                    ) : q.type === "ordering" ? (
                      <OrderingReview q={q} value={answer} assetUrls={r.assetUrls} showKey={!full} />
                    ) : q.type === "hotspot" ? (
                      <HotspotReview q={q} value={answer} assetUrls={r.assetUrls} />
                    ) : (listed || inlineBlank) && parts ? (
                      listed && (
                        <ul className="space-y-1">
                          {parts.map((part, k) => (
                            <li key={k} className="flex items-start gap-2">
                              {part.correct ? (
                                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Correct" />
                              ) : (
                                <X className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Wrong" />
                              )}
                              <span className="min-w-0 flex-1">
                                {q.type === "matching" && (
                                  <>
                                    <Markdown inline assetUrls={r.assetUrls}>{q.left[k]?.text ?? ""}</Markdown>
                                    <span className="text-muted"> → </span>
                                  </>
                                )}
                                {part.given ? (
                                  <Markdown inline assetUrls={r.assetUrls}>{part.given}</Markdown>
                                ) : (
                                  <span className="italic text-muted">No answer</span>
                                )}
                                {!part.correct && q.type === "matching" && (
                                  <span className="text-success">
                                    {" "}
                                    (<Markdown inline assetUrls={r.assetUrls}>{q.right.find((r) => r.id === q.left[k]?.rightId)?.text ?? ""}</Markdown>)
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )
                    ) : (
                      <div>
                        <p>
                          <span className="text-muted">Your answer: </span>
                          {yours ? <Markdown inline assetUrls={r.assetUrls}>{yours}</Markdown> : <span className="italic text-muted">No answer</span>}
                        </p>
                        {q.type === "multiple_choice" && (
                          <div className="mt-1 flex flex-wrap gap-2">
                            {q.choices
                              .filter((c) => c.imageId && (Array.isArray(answer) ? answer : [answer]).includes(c.id))
                              .map((c) => (
                                <AssetImage key={c.id} id={c.imageId!} alt={c.alt ?? ""} assetUrls={r.assetUrls} className="max-h-32" />
                              ))}
                          </div>
                        )}
                      </div>
                    )}
                    {q.type !== "essay" && q.type !== "drawing" && q.type !== "code" && q.type !== "sql" && q.type !== "matching" && q.type !== "categorization" && q.type !== "ordering" && q.type !== "hotspot" && !full && (
                      <p className="text-success">
                        <span className="text-muted">Correct: </span>
                        <Markdown inline assetUrls={r.assetUrls}>{answerKey(q)}</Markdown>
                      </p>
                    )}
                    {feedbackText && (
                      <Markdown className="rounded-md bg-info-soft px-2 py-1 text-info" assetUrls={r.assetUrls}>
                        {feedbackText}
                      </Markdown>
                    )}
                    {q.explanation && (
                      <Markdown className="rounded-md bg-surface-muted px-2 py-1 text-muted" assetUrls={r.assetUrls}>
                        {q.explanation}
                      </Markdown>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={points === null ? "neutral" : full ? "success" : points > 0 ? "warning" : "danger"}>
                      {points === null ? "To grade" : `${points} / ${q.points}`}
                    </Badge>
                    <p className="mt-1 text-xs text-muted">{questionTypeLabel[q.type]}</p>
                    {mastery && (
                      <p className="mt-0.5 text-xs font-medium" data-testid="mastery-tries">
                        {mastery.mastered === null ? "Waits for grading" : mastery.mastered ? "Mastered" : "Not mastered"} ·{" "}
                        {triesText(mastery.tries)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </div>
  );
}

// The student's drawing with the teacher's marks over it, and their photos.
function DrawingResult({
  q,
  answer,
  feedback,
  urls,
}: {
  q: Extract<Question, { type: "drawing" }>;
  answer: AnswerValue | undefined;
  feedback: string | null;
  urls: Record<string, string>;
}) {
  const drawing = parseDrawingAnswer(answer);
  const { marks } = parseDrawingFeedback(feedback);
  if (drawing.strokes.length === 0 && !drawing.assetId && drawing.photos.length === 0)
    return <p className="italic text-muted">No answer</p>;
  const backgroundUrl = q.backgroundImageId ? urls[q.backgroundImageId] : undefined;
  return (
    <div className="space-y-2">
      {(drawing.assetId || drawing.strokes.length > 0) && (
        <DrawingPicture
          width={q.canvasWidth}
          height={q.canvasHeight}
          pictureUrl={drawing.assetId ? urls[drawing.assetId] : undefined}
          strokes={drawing.strokes}
          background={backgroundUrl ? { url: backgroundUrl, alt: q.backgroundAlt ?? "" } : undefined}
          marks={marks}
          label={marks.length > 0 ? "Your drawing, with your teacher's marks" : "Your drawing"}
        />
      )}
      {drawing.photos.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {drawing.photos.map((id, i) =>
            urls[id] ? (
              <ZoomImage key={id} url={urls[id]} alt={`Your photo ${i + 1}`} />
            ) : (
              <AssetImage key={id} id={id} alt={`Your photo ${i + 1}`} assetUrls={urls} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
