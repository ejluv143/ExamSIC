"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { FileText, Flag, Keyboard, Lock, LockOpen, LogIn, Send, TriangleAlert, X } from "lucide-react";
import type { AnswerValue, AttemptDetail, Incident, LiveStudent, Question, Session } from "@examora/contract";
import { CodeEditor } from "@/components/code-editor";
import { AlertChip, IntegrityLevelBadge, alertStyle } from "@/components/integrity-chip";
import { Markdown } from "@/components/markdown";
import { TypingReplay } from "@/components/typing-replay";
import { Badge, Button, ButtonLink, inputClass } from "@/components/ui";
import { answerText } from "@/lib/answers";
import { incidentText } from "@/lib/incidents";
import { questionLabel } from "@/lib/format";
import { formatDuration, integrityEventLabel } from "@/lib/integrity";
import {
  addTimeAction,
  allowBackInAction,
  forceSubmitAction,
  liveAttemptAction,
  setLockedAction,
  warnStudentAction,
} from "@/lib/live/actions";
import { analyzeTyping, type TypingEdit } from "@/lib/typing";
import { AddTimeDialog, type Outcome } from "./add-time-dialog";
import { ApproveButton } from "./approve-button";
import { RetakeDialog } from "./retake-dialog";
import { RowStatusBadge, formatClock, isTaking, rowStatus } from "./live-shared";

type Loaded = { detail: AttemptDetail; incidents: readonly Incident[] };

const replayTypes: Partial<Record<Question["type"], true>> = { code: true, sql: true, essay: true };

// The panel for one student: what they have answered so far, how it was typed, what happened, and the
// teacher's controls for them. It reads the attempt on open and again (at most once a second) when an event
// for that attempt arrives.
export function StudentDrawer({
  student,
  name,
  questions,
  session,
  incidents,
  values,
  justChanged,
  pulse,
  now,
  waiting,
  reportHref,
  onClose,
}: {
  student: LiveStudent;
  name: string;
  questions: readonly Question[];
  session: Session;
  incidents: readonly Incident[];
  values: Readonly<Record<string, AnswerValue>> | undefined;
  justChanged: string | undefined;
  pulse: number;
  now: number;
  waiting: boolean;
  // The integrity report of this attempt (exam sessions' printable record); null before the student starts.
  reportHref: string | null;
  onClose: () => void;
}) {
  const attemptId = student.attemptId;
  const closeButton = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastFetch = useRef(0);

  const load = useCallback(async () => {
    if (!attemptId) return;
    lastFetch.current = Date.now();
    try {
      setLoaded(await liveAttemptAction(attemptId));
      setLoadError(null);
    } catch {
      setLoadError("The student's answers couldn't be loaded. They will be retried on the next change.");
    }
  }, [attemptId]);

  // A new mark for review changes only the row's count, so it reloads the answers too.
  const markedCount = student.marked;
  useEffect(() => {
    if (!attemptId) return;
    const timer = setTimeout(() => void load(), Math.max(0, 1000 - (Date.now() - lastFetch.current)));
    return () => clearTimeout(timer);
  }, [attemptId, pulse, load, markedCount]);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const status = rowStatus(student, now, waiting);
  const taking = isTaking(status);
  const detail = loaded?.detail;

  // The questions on this student's paper, in the order they saw them.
  const paper = useMemo(() => {
    const byId = new Map(questions.map((q) => [q.id, q]));
    const order = detail ? detail.questionOrder : questions.map((q) => q.id);
    return order.flatMap((id) => byId.get(id) ?? []);
  }, [questions, detail]);

  const answerValues = useMemo(() => {
    const out = new Map<string, AnswerValue>(detail?.answers.map((a) => [a.questionId, a.value]));
    for (const [id, value] of Object.entries(values ?? {})) out.set(id, value);
    return out;
  }, [detail, values]);

  const marked = useMemo(() => new Set(detail?.answers.filter((a) => a.markedForReview).map((a) => a.questionId)), [detail]);

  const timeline = useMemo(() => {
    const own = new Map<string, Incident>();
    for (const i of [...(loaded?.incidents ?? []), ...incidents]) if (i.attemptId === attemptId) own.set(i.id, i);
    const rows = [
      ...(detail?.integrityEvents ?? []).map((e) => ({ at: e.at, kind: "integrity" as const, event: e })),
      ...[...own.values()].map((i) => ({ at: i.at, kind: "incident" as const, incident: i })),
    ];
    return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [loaded, incidents, detail, attemptId]);

  return (
    <aside
      role="dialog"
      aria-label={`${name}, live view`}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-border bg-surface shadow-2xl"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <RowStatusBadge status={status} />
            <IntegrityLevelBadge level={student.level} />
            {student.locked && (
              <Badge tone="danger">
                <Lock className="mr-1 size-3" aria-hidden /> Locked
              </Badge>
            )}
            <span className="tabular-nums">
              {student.answered} / {student.questionCount} answered
            </span>
            {student.marked > 0 && (
              <span className="inline-flex items-center gap-1 tabular-nums text-warning">
                <Flag className="size-3.5" aria-hidden /> {student.marked} marked for review
              </span>
            )}
            <span className="tabular-nums">
              {student.score} / {student.max} pts so far
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {reportHref && (
            <ButtonLink href={reportHref} variant="ghost" className="gap-1.5 px-2.5 py-1.5">
              <FileText className="size-4" aria-hidden /> Report
            </ButtonLink>
          )}
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
        {attemptId === null ? (
          <p className="rounded-lg bg-surface-muted p-4 text-sm text-muted">{name} hasn&apos;t started yet.</p>
        ) : (
          <>
            {status === "waiting" && (
              <section
                role="alert"
                aria-label="Waiting for approval"
                className="space-y-2 rounded-lg border border-danger/40 bg-danger-soft p-3"
              >
                <p className="font-semibold text-danger">Waiting for approval</p>
                <p className="text-sm">
                  {name} opened the attempt on another device, or came back after a long absence. They can&apos;t continue
                  until you approve it.
                </p>
                <ApproveButton attemptId={attemptId} />
              </section>
            )}
            {session.status === "running" && (
              <Controls
                attemptId={attemptId}
                sessionId={session.id}
                name={name}
                locked={student.locked}
                extraSeconds={student.extraSeconds}
                backInOnly={!taking}
                submitted={student.submittedAt !== null}
                exam={session.mode === "exam"}
                canRetake={session.mode === "exam" && session.attemptsAllowed !== null && student.submittedAt !== null}
              />
            )}

            {loadError && (
              <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
                {loadError}
              </p>
            )}

            <section aria-labelledby="live-answers">
              <h3 id="live-answers" className="mb-2 font-semibold">
                Answers
              </h3>
              {paper.length === 0 ? (
                <p className="text-sm text-muted">No questions.</p>
              ) : (
                <ol className="space-y-3">
                  {paper.map((q, i) => (
                    <AnswerRow
                      key={q.id}
                      number={i + 1}
                      question={q}
                      value={answerValues.get(q.id)}
                      current={taking && q.id === student.currentQuestionId}
                      marked={marked.has(q.id)}
                      changed={q.id === justChanged}
                      edits={detail?.typing[q.id]}
                    />
                  ))}
                </ol>
              )}
            </section>

            <section aria-labelledby="live-timeline">
              <h3 id="live-timeline" className="mb-2 font-semibold">
                Timeline
              </h3>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted">Nothing unusual so far.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                  {timeline.map((row, i) => (
                    <li key={`${row.at}-${i}`} className="flex items-start gap-3 px-3 py-2">
                      <time dateTime={row.at} className="w-20 shrink-0 pt-0.5 text-xs tabular-nums text-muted">
                        {formatClock(row.at)}
                      </time>
                      {row.kind === "integrity" ? (
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                          <AlertChip type={row.event.type} />
                          <span className="min-w-0 text-muted" title={integrityEventLabel[row.event.type]}>
                            {row.event.durationMs ? formatDuration(row.event.durationMs) : alertStyle[row.event.type].label}
                          </span>
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1">
                          <Badge tone="primary">Teacher</Badge>{" "}
                          <span className="break-words">{incidentText(row.incident, name)}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}

// One question: its prompt, the answer as it stands, and the typing replay for code, SQL and essays.
function AnswerRow({
  number,
  question: q,
  value,
  current,
  marked,
  changed,
  edits,
}: {
  number: number;
  question: Question;
  value: AnswerValue | undefined;
  current: boolean;
  marked: boolean;
  changed: boolean;
  edits: readonly TypingEdit[] | undefined;
}) {
  const text = typeof value === "string" ? value : "";
  const shown = answerText(q, value);
  const initial = q.type === "code" || q.type === "sql" ? q.starterCode : "";
  const language = q.type === "code" ? q.language : "sql";

  return (
    <li
      className={clsx(
        "space-y-2 rounded-lg border p-3 transition-colors",
        changed ? "border-primary bg-primary-soft" : current ? "border-info bg-info-soft" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium tabular-nums">Q{number}</span>
        <span className="text-muted">{questionLabel(q)}</span>
        {current && <Badge tone="info">On this question</Badge>}
        {marked && (
          <Badge tone="warning">
            <Flag className="mr-1 size-3" aria-hidden /> Marked for review
          </Badge>
        )}
        {changed && <Badge tone="primary">Just changed</Badge>}
      </div>
      <div className="line-clamp-3 text-sm text-muted">
        <Markdown inline>{q.prompt}</Markdown>
      </div>
      {q.type === "code" || q.type === "sql" ? (
        <CodeEditor value={text} language={language} readOnly minLines={3} label={`Answer to question ${number}`} />
      ) : q.type === "drawing" ? (
        <p className="text-sm text-muted">{value ? "Drawing saved." : "No answer yet."}</p>
      ) : (
        <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
          {shown ? <Markdown>{shown}</Markdown> : <span className="text-muted">No answer yet</span>}
        </div>
      )}
      {replayTypes[q.type] && edits && edits.length > 0 && (
        <Replay initial={initial} edits={edits} final={text} language={language} />
      )}
    </li>
  );
}

// Collapsed by default; the summary already says whether anything looked unusual.
function Replay(props: Parameters<typeof TypingReplay>[0]) {
  const flags = analyzeTyping(props.initial, props.edits, props.final).flags;
  return (
    <details className="rounded-lg border border-border bg-surface">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
        <Keyboard className="size-4 text-muted" aria-hidden />
        <span className="flex-1 font-medium">Typing replay</span>
        {flags.length > 0 ? (
          <Badge tone="warning">
            {flags.length} {flags.length === 1 ? "warning" : "warnings"}
          </Badge>
        ) : (
          <Badge tone="success">Normal typing</Badge>
        )}
      </summary>
      <div className="border-t border-border p-3">
        <TypingReplay {...props} />
      </div>
    </details>
  );
}

// Warn, lock, add time, submit and let back in, for this student. A student who isn't taking the exam any
// more (submitted, or never started) can only be let back in.
function Controls({
  attemptId,
  sessionId,
  name,
  locked,
  extraSeconds,
  backInOnly,
  submitted,
  exam,
  canRetake,
}: {
  attemptId: string;
  sessionId: string;
  name: string;
  locked: boolean;
  extraSeconds: number;
  backInOnly: boolean;
  // A submitted attempt can't be resumed, so there is no one to let back in.
  submitted: boolean;
  exam: boolean;
  canRetake: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  function run(action: () => Promise<Outcome>, done?: () => void) {
    start(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError(null);
      done?.();
    });
  }

  return (
    <section aria-label="Controls" className="space-y-3 rounded-lg bg-surface-muted p-3">
      {!backInOnly && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!message.trim()) return;
              run(
                () => warnStudentAction(attemptId, message.trim()),
                () => {
                  setMessage("");
                  setSent(true);
                },
              );
            }}
            className="flex flex-wrap gap-2"
          >
            <input
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setSent(false);
              }}
              maxLength={500}
              placeholder="Warning shown on the student's screen"
              aria-label="Warning to the student"
              className={clsx(inputClass, "min-w-0 flex-1")}
            />
            <Button type="submit" variant="secondary" disabled={pending || !message.trim()}>
              <TriangleAlert className="size-4" aria-hidden /> Warn
            </Button>
          </form>
          {sent && (
            <p role="status" className="text-sm text-success">
              Warning sent.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => run(() => setLockedAction(attemptId, !locked))}>
              {locked ? <LockOpen className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
              {locked ? "Unlock" : "Lock"}
            </Button>
            <AddTimeDialog
              title="Add time for this student"
              description="Only this student's clock gets the extra minutes."
              onAdd={(seconds) => addTimeAction(sessionId, seconds, attemptId)}
            />
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Submit this student's attempt now? They can't keep answering."))
                  run(() => forceSubmitAction(attemptId));
              }}
            >
              <Send className="size-4" aria-hidden /> Force submit
            </Button>
          </div>
          {extraSeconds > 0 && (
            <p className="text-xs text-muted">Extra time given so far: {Math.round(extraSeconds / 60)} min.</p>
          )}
        </>
      )}
      {!submitted && (
        <div className="space-y-1">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              const question = exam
                ? "Approve this student's device switch? They continue the exam on the new device."
                : "Let this student back in? They can continue from another browser.";
              if (window.confirm(question)) run(() => allowBackInAction(attemptId));
            }}
          >
            <LogIn className="size-4" aria-hidden /> {exam ? "Approve device switch" : "Allow back in"}
          </Button>
          <p className="text-xs text-muted">
            {exam
              ? "Lets the student continue this attempt on another device, or after being away too long."
              : "Lets the student resume this attempt from another browser, for example after a crash."}
          </p>
        </div>
      )}
      {canRetake && (
        <div className="space-y-1">
          <RetakeDialog attemptId={attemptId} name={name} />
          <p className="text-xs text-muted">Gives only {name} one more attempt at this exam.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
