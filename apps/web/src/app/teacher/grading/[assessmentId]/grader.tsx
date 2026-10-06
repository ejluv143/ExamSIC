"use client";

import { useState } from "react";
import { MathText } from "@/components/math-text";
import clsx from "clsx";
import { Check, EyeOff } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, inputClass } from "@/components/ui";
import { fullName } from "@/lib/format";
import { submissionScore } from "@/lib/scoring";
import type { Assessment, EssayQuestion, Student, Submission } from "@/lib/types";

function draftFor(essays: EssayQuestion[], sub: Submission | undefined) {
  return Object.fromEntries(
    essays.map((q) => [
      q.id,
      {
        points: sub?.manualScores[q.id]?.toString() ?? "",
        feedback: sub?.feedback[q.id] ?? "",
      },
    ]),
  );
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
  const essays = assessment.questions.filter((q): q is EssayQuestion => q.type === "essay");
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

  const selected = submissions.find((s) => s.id === selectedId);
  const [draft, setDraft] = useState(() => draftFor(essays, selected));
  const [error, setError] = useState<string | null>(null);

  function select(id: string) {
    setSelectedId(id);
    setDraft(draftFor(essays, submissions.find((s) => s.id === id)));
    setError(null);
  }

  const label = (sub: Submission, i: number) =>
    blind ? `Student ${i + 1}` : fullName(studentById.get(sub.studentId)!);

  function saveAndNext() {
    if (!selected) return;
    const manualScores: Record<string, number> = {};
    const feedback: Record<string, string> = {};
    for (const q of essays) {
      const raw = draft[q.id].points.trim();
      const points = Number(raw);
      if (raw === "" || Number.isNaN(points) || points < 0 || points > q.points) {
        setError(`Enter a score from 0 to ${q.points} for every essay.`);
        return;
      }
      manualScores[q.id] = points;
      if (draft[q.id].feedback.trim()) feedback[q.id] = draft[q.id].feedback.trim();
    }
    // TODO: PUT the grades to the API once apps/api exists.
    const updated = submissions.map((s) =>
      s.id === selected.id ? { ...s, manualScores, feedback, status: "graded" as const } : s,
    );
    setSubmissions(updated);
    const next = updated.find((s) => s.status === "needs_grading");
    if (next) {
      setSelectedId(next.id);
      setDraft(draftFor(essays, next));
    }
    setError(null);
  }

  if (essays.length === 0) {
    return (
      <Card>
        <EmptyState title="This assessment has no essay questions">Everything is graded automatically.</EmptyState>
      </Card>
    );
  }

  const waiting = submissions.filter((s) => s.status === "needs_grading").length;

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <Card className="self-start lg:sticky lg:top-6">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">
            {waiting === 0 ? "All graded" : `${waiting} waiting`}
          </span>
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
                <p className="font-mono text-xs text-muted">
                  {studentById.get(selected.studentId)?.studentNumber}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              {selected.tabSwitches > 0 && <Badge tone="warning">Left the tab {selected.tabSwitches}×</Badge>}
              <AutoScore assessment={assessment} submission={selected} />
            </div>
          </Card>

          {essays.map((q) => {
            const answer = selected.answers[q.id];
            return (
              <Card key={q.id}>
                <div className="space-y-4 p-5">
                  <div>
                    <p className="text-xs font-medium tracking-wide text-muted uppercase">
                      Question {assessment.questions.indexOf(q) + 1} · {q.points} pts
                    </p>
                    <p className="mt-1 font-medium">
                      <MathText text={q.prompt} />
                    </p>
                  </div>
                  {q.rubric && (
                    <div className="rounded-lg bg-info-soft p-3 text-sm">
                      <p className="mb-0.5 font-medium text-info">Rubric</p>
                      <p>{q.rubric}</p>
                    </div>
                  )}
                  <div className="rounded-lg border border-border bg-surface-muted p-4 text-sm leading-relaxed whitespace-pre-wrap">
                    {typeof answer === "string" && answer.trim() ? answer : <span className="text-muted">No answer</span>}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                    <Field label={`Score (0–${q.points})`}>
                      <input
                        type="number"
                        min={0}
                        max={q.points}
                        step={0.5}
                        value={draft[q.id].points}
                        onChange={(e) =>
                          setDraft({ ...draft, [q.id]: { ...draft[q.id], points: e.target.value } })
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Feedback (optional)" hint="Students see this when results are released.">
                      <textarea
                        rows={2}
                        value={draft[q.id].feedback}
                        onChange={(e) =>
                          setDraft({ ...draft, [q.id]: { ...draft[q.id], feedback: e.target.value } })
                        }
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </div>
              </Card>
            );
          })}

          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={saveAndNext}>{waiting > 1 || selected.status === "graded" ? "Save & next" : "Save"}</Button>
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

function AutoScore({ assessment, submission }: { assessment: Assessment; submission: Submission }) {
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
