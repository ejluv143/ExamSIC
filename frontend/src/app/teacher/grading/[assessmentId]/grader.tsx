"use client";

import { useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { CodeTests } from "@/components/code-tests";
import { MathText } from "@/components/math-text";
import clsx from "clsx";
import { Check, EyeOff, Pencil, ShieldAlert, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, inputClass } from "@/components/ui";
import { answerKey } from "@/lib/answers";
import { blankedPrompt } from "@/lib/blanks";
import { formatDateTime, fullName, questionTypeLabel } from "@/lib/format";
import { awayCount, integrityEventLabel, isAway } from "@/lib/integrity";
import { automaticScore, partResults, reviewableTypes, submissionScore } from "@/lib/scoring";
import type { Assessment, CodeTestResult, Question, Student, Submission } from "@/lib/types";

type Draft = Record<string, { points: string; feedback: string }>;

const auto = (q: Question, sub: Submission) => automaticScore(q, sub);

function draftFor(questions: Question[], sub: Submission | undefined): Draft {
  return Object.fromEntries(
    questions.map((q) => [
      q.id,
      {
        points: (sub?.manualScores[q.id] ?? (sub ? auto(q, sub) : null))?.toString() ?? "",
        feedback: sub?.feedback[q.id] ?? "",
      },
    ]),
  );
}

// Worth a look: every essay, any answer the key didn't fully accept, and anything already re-scored.
function needsLook(q: Question, sub: Submission) {
  if (q.type === "essay" || sub.manualScores[q.id] !== undefined) return true;
  return (auto(q, sub) ?? 0) < q.points;
}

export function Grader({
  assessment,
  submissions: initialSubmissions,
  students,
  initialSubmissionId,
}: {
  assessment: Assessment;
  submissions: Submission[];
  students: Student[];
  initialSubmissionId?: string;
}) {
  const reviewable = assessment.questions.filter((q) => reviewableTypes.includes(q.type));
  const studentById = new Map(students.map((s) => [s.id, s]));

  // Waiting submissions first, then graded, each alphabetical.
  const [submissions, setSubmissions] = useState(() =>
    [...initialSubmissions].sort(
      (x, y) =>
        Number(x.status === "graded") - Number(y.status === "graded") ||
        fullName(studentById.get(x.studentId)!).localeCompare(fullName(studentById.get(y.studentId)!)),
    ),
  );
  const [selectedId, setSelectedId] = useState(
    initialSubmissionId ?? submissions.find((s) => s.status === "needs_grading")?.id ?? submissions[0]?.id,
  );
  const [blind, setBlind] = useState(false);
  const [onlyToCheck, setOnlyToCheck] = useState(true);

  const selected = submissions.find((s) => s.id === selectedId);
  const [draft, setDraft] = useState(() => draftFor(reviewable, selected));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function select(id: string) {
    setSelectedId(id);
    setDraft(draftFor(reviewable, submissions.find((s) => s.id === id)));
    setError(null);
    setSaved(false);
  }

  const setPoints = (id: string, points: string) => setDraft((d) => ({ ...d, [id]: { ...d[id], points } }));

  const label = (sub: Submission, i: number) =>
    blind ? `Student ${i + 1}` : fullName(studentById.get(sub.studentId)!);

  function saveAndNext() {
    if (!selected) return;
    const manualScores: Record<string, number> = {};
    const feedback: Record<string, string> = {};
    for (const q of reviewable) {
      const raw = draft[q.id].points.trim();
      const points = Number(raw);
      if (raw === "" || Number.isNaN(points) || points < 0 || points > q.points) {
        setError(`Question ${assessment.questions.indexOf(q) + 1}: enter a score from 0 to ${q.points}.`);
        return;
      }
      // Only keep scores that differ from the automatic one, so a later key fix still applies.
      if (q.type === "essay" || points !== auto(q, selected)) manualScores[q.id] = points;
      if (draft[q.id].feedback.trim()) feedback[q.id] = draft[q.id].feedback.trim();
    }
    // TODO: PUT the grades to the API once backend/api exists.
    const updated = submissions.map((s) =>
      s.id === selected.id ? { ...s, manualScores, feedback, status: "graded" as const } : s,
    );
    setSubmissions(updated);
    setError(null);
    const next = updated.find((s) => s.status === "needs_grading");
    if (next) {
      setSelectedId(next.id);
      setDraft(draftFor(reviewable, next));
      setSaved(false);
    } else {
      setSaved(true);
    }
  }

  if (reviewable.length === 0) {
    return (
      <Card>
        <EmptyState title="Nothing to review">
          This assessment only has multiple choice, true or false and numeric questions, which are scored automatically.
        </EmptyState>
      </Card>
    );
  }

  const waiting = submissions.filter((s) => s.status === "needs_grading").length;
  const shown = selected ? reviewable.filter((q) => !onlyToCheck || needsLook(q, selected)) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <Card className="self-start lg:sticky lg:top-6">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">{waiting === 0 ? "All graded" : `${waiting} waiting`}</span>
          <Button
            variant="ghost"
            className="px-2 py-1 text-xs"
            aria-pressed={blind}
            onClick={() => setBlind((b) => !b)}
            title="Hide student names while grading"
          >
            <EyeOff className="size-3.5" aria-hidden /> {blind ? "Show names" : "Hide names"}
          </Button>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto p-2">
          {submissions.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => select(s.id)}
                aria-current={s.id === selectedId}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                  s.id === selectedId ? "bg-primary-soft text-primary" : "hover:bg-surface-muted",
                )}
              >
                <span className="flex-1 truncate">{label(s, i)}</span>
                {s.status === "graded" ? (
                  <Check className="size-4 text-success" aria-label="Graded" />
                ) : (
                  <span className="size-2 rounded-full bg-warning" aria-label="Needs grading" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {selected ? (
        <div className="min-w-0 space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="font-semibold">{label(selected, submissions.indexOf(selected))}</p>
              {!blind && (
                <p className="font-mono text-xs text-muted">{studentById.get(selected.studentId)?.studentNumber}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {selected.integrityEvents.length > 0 && (
                <Badge tone="warning">
                  {selected.integrityEvents.length} {selected.integrityEvents.length === 1 ? "flag" : "flags"}
                </Badge>
              )}
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={onlyToCheck}
                  onChange={(e) => setOnlyToCheck(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Only answers to check
              </label>
              <TotalScore assessment={assessment} submission={selected} />
            </div>
          </Card>

          {selected.integrityEvents.length > 0 && <ActivityLog submission={selected} />}

          {shown.length === 0 && (
            <Card>
              <EmptyState title="Every typed answer matched the key">
                Clear &quot;Only answers to check&quot; to look through them anyway.
              </EmptyState>
            </Card>
          )}

          {shown.map((q) => (
            <ReviewCard
              key={q.id}
              number={assessment.questions.indexOf(q) + 1}
              question={q}
              submission={selected}
              value={draft[q.id]}
              onPoints={(points) => setPoints(q.id, points)}
              onFeedback={(feedback) => setDraft((d) => ({ ...d, [q.id]: { ...d[q.id], feedback } }))}
            />
          ))}

          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success">
              Saved (demo). Scores are kept only on this page until the API is connected.
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={saveAndNext}>{waiting > 1 ? "Save & next" : "Save"}</Button>
          </div>
        </div>
      ) : (
        <Card>
          <EmptyState title="No submissions yet" />
        </Card>
      )}
    </div>
  );
}

function ReviewCard({
  number,
  question: q,
  submission,
  value,
  onPoints,
  onFeedback,
}: {
  number: number;
  question: Question;
  submission: Submission;
  value: { points: string; feedback: string };
  onPoints: (points: string) => void;
  onFeedback: (feedback: string) => void;
}) {
  const answer = submission.answers[q.id] ?? null;
  const automatic = auto(q, submission);
  const parts = partResults(q, answer);
  const changed = automatic !== null && value.points.trim() !== "" && Number(value.points) !== automatic;

  return (
    <Card>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              Question {number} · {questionTypeLabel[q.type]} · {q.points} pts
            </p>
            <p className="mt-1 font-medium">
              <MathText text={q.type === "fill_in_the_blank" ? blankedPrompt(q.prompt) : q.prompt} />
            </p>
          </div>
          {automatic !== null && (
            <span className="flex shrink-0 gap-1.5">
              <Badge tone={automatic >= q.points ? "success" : automatic > 0 ? "warning" : "danger"}>
                Auto {automatic} / {q.points}
              </Badge>
              {changed && (
                <Badge tone="info">
                  <Pencil className="mr-1 inline size-3" aria-hidden />
                  Changed by you
                </Badge>
              )}
            </span>
          )}
        </div>

        {q.type === "sql" ? (
          <div className="space-y-2 rounded-lg bg-info-soft p-3 text-sm">
            <p className="font-medium text-info">Answer query</p>
            <pre className="overflow-auto font-mono text-xs whitespace-pre-wrap">{q.answerSql}</pre>
            {q.rubric && <p>{q.rubric}</p>}
          </div>
        ) : q.type === "essay" || q.type === "code" ? (
          q.rubric && (
            <div className="rounded-lg bg-info-soft p-3 text-sm">
              <p className="mb-0.5 font-medium text-info">Rubric</p>
              <p>{q.rubric}</p>
            </div>
          )
        ) : (
          <div className="rounded-lg bg-info-soft p-3 text-sm">
            <p className="mb-0.5 font-medium text-info">Answer key</p>
            <p>
              <MathText text={answerKey(q)} />
            </p>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-sm font-medium">Student&apos;s answer</p>
          {q.type === "code" || q.type === "sql" ? (
            <CodeEditor
              value={typeof answer === "string" ? answer : ""}
              language={q.type === "sql" ? "sql" : q.language}
              readOnly
              minLines={4}
              label="Student's code"
            />
          ) : parts ? (
            <ol className="divide-y divide-border rounded-lg border border-border">
              {parts.map((p, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-5 text-muted tabular-nums">{i + 1}.</span>
                  <span className="min-w-0 flex-1">{p.given.trim() || <span className="text-muted">No answer</span>}</span>
                  {p.correct ? (
                    <Check className="size-4 text-success" aria-label="Matches the key" />
                  ) : (
                    <X className="size-4 text-danger" aria-label="Doesn't match the key" />
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <div
              className={clsx(
                "rounded-lg border border-border bg-surface-muted p-4 text-sm",
                q.type === "essay" && "leading-relaxed whitespace-pre-wrap",
              )}
            >
              {typeof answer === "string" && answer.trim() ? answer : <span className="text-muted">No answer</span>}
            </div>
          )}
        </div>

        {q.type === "sql" && <SqlChecks results={submission.codeResults?.[q.id]} />}

        {q.type === "code" && (
          <div>
            <p className="mb-1.5 text-sm font-medium">
              Test cases{" "}
              <span className="font-normal text-muted">
                {submission.codeResults?.[q.id]
                  ? `· passed ${submission.codeResults[q.id].filter((r) => r.passed).length} of ${q.tests.length}`
                  : "· not run yet: check the code against these by hand until the code runner is connected"}
              </span>
            </p>
            <CodeTests tests={q.tests} results={submission.codeResults?.[q.id]} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <div>
            <Field label={`Score (0–${q.points})`}>
              <input
                type="number"
                min={0}
                max={q.points}
                step={0.5}
                value={value.points}
                onChange={(e) => onPoints(e.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onPoints(String(q.points))}>
                Full points
              </Button>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onPoints("0")}>
                Zero
              </Button>
              {changed && (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onPoints(String(automatic))}>
                  Undo change
                </Button>
              )}
            </div>
          </div>
          <Field label="Feedback (optional)" hint="Students see this when results are released.">
            <textarea rows={2} value={value.feedback} onChange={(e) => onFeedback(e.target.value)} className={inputClass} />
          </Field>
        </div>
      </div>
    </Card>
  );
}

const checkLabel: Record<string, string> = { sample: "Sample data", hidden: "Hidden data", blank: "No answer" };

// Each automatic SQL check: the student's rows beside the rows the answer query returned.
function SqlChecks({ results }: { results?: CodeTestResult[] }) {
  if (!results) return <p className="text-sm text-muted">Not checked automatically (the question&apos;s setup or answer failed).</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        Automatic checks{" "}
        <span className="font-normal text-muted">
          · passed {results.filter((r) => r.passed).length} of {results.length}
        </span>
      </p>
      {results.map((r) => (
        <div key={r.testId} className="rounded-lg border border-border p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            {r.passed ? <Check className="size-4 text-success" aria-hidden /> : <X className="size-4 text-danger" aria-hidden />}
            {checkLabel[r.testId] ?? r.testId}
            <span className={clsx("ml-auto text-xs", r.passed ? "text-success" : "text-danger")}>
              {r.passed ? "Same rows" : r.error ? "Error" : "Different rows"}
            </span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-0.5 text-xs text-muted">Student&apos;s result</p>
              <pre className={clsx("max-h-48 overflow-auto rounded-md bg-surface-muted px-2.5 py-1.5 font-mono text-xs", r.error && "text-danger")}>
                {r.error ?? r.output}
              </pre>
            </div>
            {r.expected && (
              <div className="min-w-0">
                <p className="mb-0.5 text-xs text-muted">Expected</p>
                <pre className="max-h-48 overflow-auto rounded-md bg-surface-muted px-2.5 py-1.5 font-mono text-xs">
                  {r.expected}
                </pre>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// What the anti-cheating checks recorded, timed from when the student started.
function ActivityLog({ submission }: { submission: Submission }) {
  const start = Date.parse(submission.startedAt);
  const since = (at: string) => {
    const s = Math.max(0, Math.round((Date.parse(at) - start) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const away = awayCount(submission.integrityEvents);
  return (
    <Card>
      <details>
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-sm">
          <ShieldAlert className="size-4 text-warning" aria-hidden />
          <span className="flex-1 font-medium">Activity log</span>
          <span className="text-muted">
            {away > 0 && `Left ${away}× · `}
            {submission.integrityEvents.length} {submission.integrityEvents.length === 1 ? "event" : "events"}
          </span>
        </summary>
        <ol className="divide-y divide-border border-t border-border text-sm">
          {submission.integrityEvents.map((e, i) => (
            <li key={i} className="flex gap-4 px-5 py-2">
              <span className="w-24 shrink-0 text-muted tabular-nums" title={formatDateTime(e.at)}>
                +{since(e.at)}
              </span>
              <span className={clsx(isAway(e) || e.type === "auto_submitted" || e.type === "late_submit" ? "text-warning" : "")}>
                {integrityEventLabel[e.type]}
              </span>
            </li>
          ))}
        </ol>
        <p className="border-t border-border px-5 py-2 text-xs text-muted">
          Times are from when the student pressed Start. A flag isn&apos;t proof of cheating; a notification or a
          lost connection can cause one too.
        </p>
      </details>
    </Card>
  );
}

function TotalScore({ assessment, submission }: { assessment: Assessment; submission: Submission }) {
  const { score, max, ungraded } = submissionScore(assessment.questions, submission);
  return (
    <span className="text-muted">
      Total{" "}
      <span className="font-semibold text-foreground tabular-nums">
        {score} / {max}
      </span>
      {ungraded > 0 && " so far"}
    </span>
  );
}
