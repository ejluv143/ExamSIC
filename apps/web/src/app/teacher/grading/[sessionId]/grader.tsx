"use client";

import { useRef, useState } from "react";
import { CodeEditor } from "@/components/code-editor";
import { CodeTests } from "@/components/code-tests";
import { TypingReplay } from "@/components/typing-replay";
import { analyzeTyping } from "@/lib/typing";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import clsx from "clsx";
import { Check, EyeOff, Keyboard, Pencil, ShieldAlert, X } from "lucide-react";
import { Badge, Button, ButtonLink, Card, EmptyState, Field, inputClass } from "@/components/ui";
import { answerKey, answerText } from "@/lib/answers";
import { formatDateTime, fullName, questionLabel } from "@/lib/format";
import { awayCount, integrityEventLabel, isAway } from "@/lib/integrity";
import { partResults, questionScore, reviewableTypes, rubricTotal, unitPoints } from "@examora/contract/scoring";
import type { Answer, AttemptDetail, CodeTestResult, Question, Stroke } from "@examora/contract";
import { encodeDrawingFeedback, paperVersion, parseDrawingFeedback } from "@examora/contract";
import { useAssetUrls } from "@/lib/use-asset-urls";
import { DrawingReview } from "./drawing-review";
import { gradeAnswerAction } from "../actions";
import { answerMap, questionsOf, scoreOf } from "@/lib/attempt-view";
import type { Student } from "@/lib/types";

type DraftRow = { points: string; feedback: string; marks: Stroke[] };
type Draft = Record<string, DraftRow>;
type Change = { q: Question; manualScore: number | null; feedback: string | null; scoreChanged: boolean };

// What the answer earned by itself, in points. null: nothing has checked it yet (essays, unrun code).
const autoPoints = (q: Question, answer: Answer | undefined) =>
  questionScore(q, { autoScore: answer?.autoScore ?? null, manualScore: null });

const reviewableOf = (all: readonly Question[], d: AttemptDetail) =>
  questionsOf(all, d).filter((q) => reviewableTypes.includes(q.type));

function draftFor(questions: Question[], d: AttemptDetail | undefined): Draft {
  const answers = d && answerMap(d);
  return Object.fromEntries(
    questions.map((q) => {
      const answer = answers?.get(q.id);
      // A drawing's feedback holds the comment and the marks drawn on the picture.
      const drawn = q.type === "drawing" ? parseDrawingFeedback(answer?.feedback) : null;
      return [
        q.id,
        {
          points: questionScore(q, answer)?.toString() ?? "",
          feedback: drawn ? drawn.text : (answer?.feedback ?? ""),
          marks: drawn ? [...drawn.marks] : [],
        },
      ];
    }),
  );
}

// Worth a look: every essay, any answer the key didn't fully accept, and anything already re-scored.
function needsLook(q: Question, answer: Answer | undefined) {
  if (q.type === "essay" || q.type === "drawing" || answer?.manualScore != null) return true;
  return (autoPoints(q, answer) ?? 0) < q.points;
}

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
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const reasonDialog = useRef<HTMLDialogElement>(null);

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
    const answers = answerMap(selected);
    const changes: Change[] = [];
    for (const q of reviewable) {
      const raw = draft[q.id].points.trim();
      const points = Number(raw);
      if (raw === "" || Number.isNaN(points) || points < 0 || points > q.points) {
        setError(`Question ${questions.indexOf(q) + 1}: enter a score from 0 to ${q.points}.`);
        return;
      }
      const answer = answers.get(q.id);
      // Only keep scores that differ from the automatic one, so a later key fix still applies.
      const manualScore = q.type === "essay" || q.type === "drawing" || points !== autoPoints(q, answer) ? points : null;
      // A drawing's feedback is its comment and marks in one string; plain text saved earlier counts as a comment.
      const feedback =
        q.type === "drawing"
          ? encodeDrawingFeedback({ text: draft[q.id].feedback.trim(), marks: draft[q.id].marks })
          : draft[q.id].feedback.trim() || null;
      const before =
        q.type === "drawing"
          ? encodeDrawingFeedback(parseDrawingFeedback(answer?.feedback))
          : (answer?.feedback ?? null);
      if (manualScore !== (answer?.manualScore ?? null) || feedback !== before) {
        // The score the student sees changes only when the points do, not when a manual score just repeats the automatic one.
        const scoreChanged =
          questionScore(q, { autoScore: answer?.autoScore ?? null, manualScore }) !== questionScore(q, answer);
        changes.push({ q, manualScore, feedback, scoreChanged });
      }
    }

    // After the results are released, changing a score needs a reason that is kept in the record.
    if (reasonRequired && changes.some((c) => c.scoreChanged)) {
      setPending(changes);
      setReason("");
      setReasonError(null);
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
          This quiz only has questions that are scored automatically: multiple choice, true or false, matching and numeric.
        </EmptyState>
      </Card>
    );
  }

  const waiting = attempts.filter((d) => d.attempt.status === "needs_grading").length;
  const selectedAnswers = selected && answerMap(selected);
  const shown = reviewable.filter((q) => !onlyToCheck || needsLook(q, selectedAnswers?.get(q.id)));

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
          {attempts.map((d, i) => (
            <li key={d.attempt.id}>
              <button
                type="button"
                onClick={() => select(d.attempt.id)}
                aria-current={d.attempt.id === selectedId}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                  d.attempt.id === selectedId ? "bg-primary-soft text-primary" : "hover:bg-surface-muted",
                )}
              >
                <span className="flex-1 truncate">
                  {label(d, i)}
                  {!blind && attemptsOf(d) > 1 && (
                    <span className="ml-1.5 text-xs text-muted">{formatDateTime(d.attempt.submittedAt)}</span>
                  )}
                  {examMode && (
                    <span className="ml-1.5 font-mono text-xs text-muted">{paperVersion(d.attempt.seed)}</span>
                  )}
                </span>
                {d.attempt.status === "graded" ? (
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

      <dialog
        ref={reasonDialog}
        aria-labelledby="reason-title"
        onClose={() => setPending(null)}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pending || !reason.trim() || saving) return;
            const failure = await commit(pending, reason.trim());
            if (failure) setReasonError(failure);
            else reasonDialog.current?.close();
          }}
          className="space-y-4 p-5"
        >
          <div>
            <h2 id="reason-title" className="font-semibold">
              Why does the score change?
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              The results of this exam are already released. The reason is kept with the old and new score in the exam record.
            </p>
          </div>
          <Field label="Reason">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              required
              className={inputClass}
            />
          </Field>
          {reasonError && (
            <p role="alert" className="text-sm text-danger">
              {reasonError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => reasonDialog.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !reason.trim()}>
              Save score change
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function ReviewCard({
  number,
  question: q,
  attempt,
  value,
  onPoints,
  onFeedback,
  onMarks,
  assetUrls,
}: {
  number: number;
  question: Question;
  attempt: AttemptDetail;
  value: DraftRow;
  onPoints: (points: string) => void;
  onFeedback: (feedback: string) => void;
  onMarks: (marks: Stroke[]) => void;
  assetUrls: Record<string, string>;
}) {
  const row = attempt.answers.find((a) => a.questionId === q.id);
  const answer = row?.value ?? null;
  const automatic = autoPoints(q, row);
  const parts = partResults(q, answer);
  const unit = unitPoints(q);
  const codeResults = attempt.codeResults[q.id];
  const typing = attempt.typing[q.id];
  const changed = automatic !== null && value.points.trim() !== "" && Number(value.points) !== automatic;
  const rubric = q.type === "essay" || q.type === "drawing" ? q.rubric : [];
  // Rubric rows ticked as quick scoring; the score is their sum until the teacher types another.
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());

  function setScore(points: string) {
    setTicked(new Set());
    onPoints(points);
  }

  function toggleRow(id: string) {
    const next = new Set(ticked);
    if (!next.delete(id)) next.add(id);
    setTicked(next);
    onPoints(String(Math.min(q.points, rubricTotal(rubric.filter((r) => next.has(r.id))))));
  }

  return (
    <Card>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              Question {number} · {questionLabel(q)} · {q.points} pts
            </p>
            <Markdown className="mt-1 font-medium" assetUrls={assetUrls}>{q.prompt}</Markdown>
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
            {q.rubric && <Markdown assetUrls={assetUrls}>{q.rubric}</Markdown>}
          </div>
        ) : q.type === "code" ? (
          q.rubric && (
            <div className="rounded-lg bg-info-soft p-3 text-sm">
              <p className="mb-0.5 font-medium text-info">Rubric</p>
              <Markdown assetUrls={assetUrls}>{q.rubric}</Markdown>
            </div>
          )
        ) : q.type === "essay" || q.type === "drawing" ? (
          rubric.length > 0 && (
            <div className="rounded-lg bg-info-soft p-3 text-sm">
              <p className="mb-1.5 font-medium text-info">Rubric: tick what the answer earns</p>
              <ul className="space-y-1.5">
                {rubric.map((r) => (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={ticked.has(r.id)}
                        onChange={() => toggleRow(r.id)}
                        className="mt-0.5 size-4 accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <Markdown inline assetUrls={assetUrls}>{r.criterion}</Markdown>
                      </span>
                      <span className="tabular-nums text-muted">{r.points} pts</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : (
          <div className="rounded-lg bg-info-soft p-3 text-sm">
            <p className="mb-0.5 font-medium text-info">Answer key</p>
            <Markdown assetUrls={assetUrls}>{answerKey(q)}</Markdown>
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
          ) : q.type === "drawing" ? (
            <DrawingReview q={q} answer={answer} marks={value.marks} onMarks={onMarks} urls={assetUrls} />
          ) : parts ? (
            <ol className="divide-y divide-border rounded-lg border border-border">
              {parts.map((p, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-5 text-muted tabular-nums">{i + 1}.</span>
                  <span className="min-w-0 flex-1">
                    {p.given.trim() ? (
                      q.type === "matching" ? (
                        <>
                          <Markdown inline assetUrls={assetUrls}>{q.left[i]?.text ?? ""}</Markdown> → <Markdown inline assetUrls={assetUrls}>{p.given}</Markdown>
                        </>
                      ) : (
                        p.given
                      )
                    ) : (
                      <span className="text-muted">No answer</span>
                    )}
                  </span>
                  <span className="text-xs text-muted tabular-nums">
                    {p.correct ? unit[i] : 0} / {unit[i]}
                  </span>
                  {p.correct ? (
                    <Check className="size-4 text-success" aria-label="Matches the key" />
                  ) : (
                    <X className="size-4 text-danger" aria-label="Doesn't match the key" />
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <div className="rounded-lg border border-border bg-surface-muted p-4 text-sm">
              {answerText(q, row?.value) ? (
                <Markdown assetUrls={assetUrls}>{answerText(q, row?.value)}</Markdown>
              ) : (
                <span className="text-muted">No answer</span>
              )}
            </div>
          )}
        </div>

        {q.type === "sql" && <SqlChecks results={codeResults} />}

        {(q.type === "code" || q.type === "sql") && typing && (
          <ReplaySection
            initial={q.starterCode}
            edits={typing}
            final={typeof answer === "string" ? answer : ""}
            language={q.type === "sql" ? "sql" : q.language}
          />
        )}

        {q.type === "code" && (
          <div>
            <p className="mb-1.5 text-sm font-medium">
              Test cases{" "}
              <span className="font-normal text-muted">
                {codeResults
                  ? `· passed ${codeResults.filter((r) => r.passed).length} of ${q.tests.length}`
                  : "· not run yet: check the code against these by hand until the code runner is connected"}
              </span>
            </p>
            <CodeTests tests={q.tests} results={codeResults} />
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
                onChange={(e) => setScore(e.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setScore(String(q.points))}>
                Full points
              </Button>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setScore("0")}>
                Zero
              </Button>
              {changed && (
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setScore(String(automatic))}>
                  Undo change
                </Button>
              )}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Feedback (optional)</p>
            <MarkdownEditor label="Feedback" rows={3} value={value.feedback} onChange={onFeedback} />
            <p className="mt-1 text-xs text-muted">Students see this when results are released.</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

// Collapsed by default; the summary already says whether anything looked unusual.
function ReplaySection(props: Parameters<typeof TypingReplay>[0]) {
  const flags = analyzeTyping(props.initial, props.edits, props.final).flags;
  return (
    <details className="rounded-lg border border-border">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm">
        <Keyboard className="size-4 text-muted" aria-hidden />
        <span className="flex-1 font-medium">Typing replay</span>
        {flags.length > 0 ? (
          <Badge tone="warning">
            {flags.length} {flags.length === 1 ? "warning" : "warnings"}
          </Badge>
        ) : (
          <span className="text-xs text-muted">Typed normally</span>
        )}
      </summary>
      <div className="border-t border-border p-3">
        <TypingReplay {...props} />
      </div>
    </details>
  );
}

const checkLabel: Record<string, string> = { sample: "Sample data", hidden: "Hidden data", blank: "No answer" };

// Each automatic SQL check: the student's rows beside the rows the answer query returned.
function SqlChecks({ results }: { results?: readonly CodeTestResult[] }) {
  if (!results) return <p className="text-sm text-muted">Not checked automatically. Compare the query with the answer above.</p>;
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
function ActivityLog({ attempt }: { attempt: AttemptDetail }) {
  const events = attempt.integrityEvents;
  const start = Date.parse(attempt.attempt.startedAt);
  const since = (at: string) => {
    const s = Math.max(0, Math.round((Date.parse(at) - start) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const away = awayCount(events);
  return (
    <Card>
      <details>
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-sm">
          <ShieldAlert className="size-4 text-warning" aria-hidden />
          <span className="flex-1 font-medium">Activity log</span>
          <span className="text-muted">
            {away > 0 && `Left ${away}× · `}
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>
        </summary>
        <ol className="divide-y divide-border border-t border-border text-sm">
          {events.map((e, i) => (
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

function TotalScore({ questions, attempt }: { questions: readonly Question[]; attempt: AttemptDetail }) {
  const { score, max, ungraded } = scoreOf(questions, attempt);
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
