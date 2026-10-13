"use client";

import { useRef, useState } from "react";
import { Badge, Button, ButtonLink, Card, EmptyState } from "@/components/ui";
import { fullName } from "@/lib/format";
import type { AttemptDetail } from "@examinus/contract/session";
import { paperVersion } from "@examinus/domain/exam";
import type { Question } from "@examinus/domain/question";
import { reviewableTypes } from "@examinus/domain/scoring";
import { useAssetUrls } from "@/features/assets/use-asset-urls";
import { gradeAnswerAction } from "../actions";
import { answerMap } from "@/features/session/attempt-view";
import type { Student } from "@/features/classes/types";
import { ActivityLog, TotalScore } from "./attempt-summary";
import { AttemptList } from "./attempt-list";
import { changesOf, draftFor, needsLook, reviewableOf, type Change } from "./draft";
import { ReasonDialog } from "./reason-dialog";
import { ReviewCard } from "./review-card";
import { useAiDrafts } from "./use-ai-drafts";

export function Grader({
  questions,
  attempts: initialAttempts,
  students,
  assetUrls: initialUrls,
  initialAttemptId,
  examMode,
  reportBase,
  reasonRequired,
}: {
  questions: Question[];
  attempts: AttemptDetail[];
  students: Student[];
  assetUrls: Record<string, string>;
  initialAttemptId?: string;
  // Exam sessions show each student's paper version.
  examMode: boolean;
  // Where the integrity report of an attempt lives (exam sessions), without the attempt id.
  reportBase: string | null;
  // Exam results are released: changing a score needs a reason.
  reasonRequired: boolean;
}) {
  // The links expire after ten minutes, and a grading session can run longer.
  const { urls: assetUrls } = useAssetUrls(initialUrls);
  const studentById = new Map(students.map((s) => [s.id, s]));
  const nameOf = (d: AttemptDetail) => {
    const st = studentById.get(d.studentId);
    return st ? fullName(st) : "Unknown student";
  };

  // Waiting attempts first, then graded, each alphabetical.
  const [attempts, setAttempts] = useState(() =>
    [...initialAttempts].sort(
      (x, y) =>
        Number(x.attempt.status === "graded") - Number(y.attempt.status === "graded") ||
        nameOf(x).localeCompare(nameOf(y)),
    ),
  );
  const [selectedId, setSelectedId] = useState(
    initialAttemptId ?? attempts.find((d) => d.attempt.status === "needs_grading")?.attempt.id ?? attempts[0]?.attempt.id,
  );
  const [blind, setBlind] = useState(false);
  const [onlyToCheck, setOnlyToCheck] = useState(true);

  const selected = attempts.find((d) => d.attempt.id === selectedId);
  const reviewable = selected ? reviewableOf(questions, selected) : [];
  const [draft, setDraft] = useState(() => draftFor(reviewable, selected));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // Changes waiting for the reason the teacher gives in the dialog (exam results already released).
  const [pending, setPending] = useState<readonly Change[] | null>(null);
  const reasonDialog = useRef<HTMLDialogElement>(null);
  const ai = useAiDrafts(questions, attempts);

  function select(id: string) {
    const d = attempts.find((x) => x.attempt.id === id);
    setSelectedId(id);
    setDraft(draftFor(d ? reviewableOf(questions, d) : [], d));
    setError(null);
    setSaved(false);
  }

  const setPoints = (id: string, points: string) => setDraft((d) => ({ ...d, [id]: { ...d[id], points } }));

  const label = (d: AttemptDetail, i: number) => (blind ? `Student ${i + 1}` : nameOf(d));
  const attemptsOf = (d: AttemptDetail) => attempts.filter((x) => x.studentId === d.studentId).length;

  async function saveAndNext() {
    if (!selected) return;
    const found = changesOf(reviewable, questions, selected, draft);
    if ("error" in found) {
      setError(found.error);
      return;
    }
    const { changes } = found;

    // After the results are released, changing a score needs a reason that is kept in the record.
    if (reasonRequired && changes.some((c) => c.scoreChanged)) {
      setPending(changes);
      setError(null);
      reasonDialog.current?.showModal();
      return;
    }
    const failure = await commit(changes);
    if (failure) setError(failure);
  }

  // Saves the changes one by one and moves to the next student. Returns the API's message when it refuses.
  async function commit(changes: readonly Change[], reason?: string): Promise<string | null> {
    if (!selected) return null;
    const answers = answerMap(selected);
    setSaving(true);
    let status = selected.attempt.status;
    for (const c of changes) {
      const result = await gradeAnswerAction(
        selected.attempt.id,
        c.q.id,
        c.manualScore,
        c.feedback,
        c.scoreChanged ? reason : undefined,
      );
      if ("error" in result) {
        setSaving(false);
        return result.error;
      }
      status = result.ok.status;
    }
    setSaving(false);

    const rows = new Map(answers);
    for (const c of changes) {
      const old = rows.get(c.q.id);
      rows.set(c.q.id, {
        attemptId: selected.attempt.id,
        questionId: c.q.id,
        value: null,
        correct: null,
        autoScore: null,
        markedForReview: false,
        answeredAt: new Date().toISOString(),
        ...old,
        manualScore: c.manualScore,
        feedback: c.feedback,
      });
    }
    const updated = attempts.map((d) =>
      d.attempt.id === selected.attempt.id ? { ...d, answers: [...rows.values()], attempt: { ...d.attempt, status } } : d,
    );
    setAttempts(updated);
    setError(null);
    const next = updated.find((d) => d.attempt.status === "needs_grading");
    if (next) {
      setSelectedId(next.attempt.id);
      setDraft(draftFor(reviewableOf(questions, next), next));
      setSaved(false);
    } else {
      setSaved(true);
    }
    return null;
  }

  if (!questions.some((q) => reviewableTypes.includes(q.type))) {
    return (
      <Card>
        <EmptyState title="Nothing to review">
          This quiz only has questions that are scored automatically, such as multiple choice, matching, categorization, re-ordering and hotspot.
        </EmptyState>
      </Card>
    );
  }

  const waiting = attempts.filter((d) => d.attempt.status === "needs_grading").length;
  const selectedAnswers = selected && answerMap(selected);
  const shown = reviewable.filter((q) => !onlyToCheck || needsLook(q, selectedAnswers?.get(q.id)));

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <AttemptList
        attempts={attempts}
        selectedId={selectedId}
        onSelect={select}
        blind={blind}
        onBlind={() => setBlind((b) => !b)}
        label={label}
        attemptsOf={attemptsOf}
        examMode={examMode}
        waiting={waiting}
        ai={ai}
        hasEssays={questions.some((q) => q.type === "essay")}
      />

      {selected ? (
        <div className="min-w-0 space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="font-semibold">{label(selected, attempts.indexOf(selected))}</p>
              {!blind && (
                <p className="font-mono text-xs text-muted">{studentById.get(selected.studentId)?.studentNumber}</p>
              )}
              {examMode && (
                <p className="text-xs text-muted">
                  Paper version <span className="font-mono font-medium text-foreground">{paperVersion(selected.attempt.seed)}</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {reportBase && (
                <ButtonLink href={`${reportBase}/${selected.attempt.id}`} variant="secondary" className="px-2.5 py-1.5">
                  Integrity report
                </ButtonLink>
              )}
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
              <TotalScore questions={questions} attempt={selected} />
            </div>
          </Card>

          {selected.integrityEvents.length > 0 && <ActivityLog attempt={selected} />}

          {shown.length === 0 && (
            <Card>
              <EmptyState title="Every typed answer matched the key">
                Clear &quot;Only answers to check&quot; to look through them anyway.
              </EmptyState>
            </Card>
          )}

          {shown.map((q) => (
            <ReviewCard
              key={`${selected.attempt.id}:${q.id}`}
              number={questions.indexOf(q) + 1}
              question={q}
              attempt={selected}
              value={draft[q.id]}
              onPoints={(points) => setPoints(q.id, points)}
              onFeedback={(feedback) => setDraft((d) => ({ ...d, [q.id]: { ...d[q.id], feedback } }))}
              onMarks={(marks) => setDraft((d) => ({ ...d, [q.id]: { ...d[q.id], marks } }))}
              assetUrls={assetUrls}
              ai={ai.controlsFor(selected.attempt.id)}
            />
          ))}

          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success">
              Saved. Everything is graded.
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={saveAndNext} disabled={saving}>{waiting > 1 ? "Save & next" : "Save"}</Button>
          </div>
        </div>
      ) : (
        <Card>
          <EmptyState title="No submissions yet" />
        </Card>
      )}

      <ReasonDialog dialogRef={reasonDialog} pending={pending} saving={saving} commit={commit} onClose={() => setPending(null)} />
    </div>
  );
}
