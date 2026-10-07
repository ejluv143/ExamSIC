import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { Check, CheckCircle2, Clock, X } from "lucide-react";
import { MathText } from "@/components/math-text";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { answerKey, answerText } from "@/lib/answers";
import { blankedPrompt } from "@/lib/blanks";
import { getMyResult } from "@/lib/data/student";
import { formatDateTime, questionTypeLabel } from "@/lib/format";
import { attemptLabel, hasAttemptsLeft } from "@/lib/attempts";
import { availability, modeLabel } from "@/lib/sessions";
import { percent } from "@examora/contract/scoring";

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

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/student/assessments" className="inline-block text-sm text-muted hover:text-foreground">
        ← Quizzes & exams
      </Link>

      {submitted && r.submittedAt && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-success-soft p-3 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden /> Your answers were submitted.
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
        {(canRetake || (!r.submittedAt && when === "open")) && (
          <ButtonLink href={`/student/assessments/${s.id}`} className="mt-4">
            {r.submittedAt ? "Try again" : `Start ${modeLabel(s.mode).toLowerCase()}`}
          </ButtonLink>
        )}
      </Card>

      {r.items.length > 0 && (
        <Card>
          <h2 className="border-b border-border px-5 py-3 font-semibold">Your answers</h2>
          <ol className="divide-y divide-border">
            {r.items.map(({ question: q, answer, points, feedback }, i) => {
              const yours = answerText(q, answer);
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
                    <p>
                      <span className="text-muted">{i + 1}.</span> <MathText text={blankedPrompt(q.prompt)} />
                    </p>
                    {q.type === "code" || q.type === "sql" ? (
                      yours ? (
                        <pre className="max-h-72 overflow-auto rounded-md bg-surface-muted p-3 font-mono text-xs">
                          {yours}
                        </pre>
                      ) : (
                        <p className="italic text-muted">No answer</p>
                      )
                    ) : (
                      <p>
                        <span className="text-muted">Your answer: </span>
                        {yours ? <MathText text={yours} /> : <span className="italic text-muted">No answer</span>}
                      </p>
                    )}
                    {q.type !== "essay" && q.type !== "code" && q.type !== "sql" && !full && (
                      <p className="text-success">
                        <span className="text-muted">Correct: </span>
                        <MathText text={answerKey(q)} />
                      </p>
                    )}
                    {feedback && <p className="rounded-md bg-info-soft px-2 py-1 text-info">{feedback}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={points === null ? "neutral" : full ? "success" : points > 0 ? "warning" : "danger"}>
                      {points === null ? "To grade" : `${points} / ${q.points}`}
                    </Badge>
                    <p className="mt-1 text-xs text-muted">{questionTypeLabel[q.type]}</p>
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
