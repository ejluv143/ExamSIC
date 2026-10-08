"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, PartyPopper, XCircle } from "lucide-react";
import type { AnswerValue, IntegrityEvent, MasteryFeedback, MasteryState, Paper } from "@examora/contract";
import { answerKey } from "@/lib/answers";
import { getDeviceId } from "@/lib/device";
import { questionTypeLabel } from "@/lib/format";
import { useAssetUrls } from "@/lib/use-asset-urls";
import { answerMastery, examHeartbeat, getMasteryState, recordExamEvents } from "@/app/student/actions";
import { AnswerInput } from "./online-exam";
import { useIntegrity } from "./exam-integrity";
import { Markdown } from "./markdown";
import { Button, ButtonLink, Card } from "./ui";
import type { DrawingFinalizer } from "./answer-inputs";

const heartbeatMs = 15_000;
const eventsFlushMs = 1000;

type Graded = { feedback: MasteryFeedback; next: MasteryState };

// Mastery mode as a student takes it: one question at a time, each graded the moment it is answered. A wrong
// answer comes back later; the server keeps the queue, so a reload carries on where the student was.
export function MasteryPlayer({ paper }: { paper: Paper }) {
  const { session, quiz } = paper;
  const attemptId = paper.attempt!.id;
  const [state, setState] = useState<MasteryState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [value, setValue] = useState<AnswerValue | undefined>(undefined);
  const latest = useRef<AnswerValue | undefined>(undefined);
  const [graded, setGraded] = useState<Graded | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When the question on screen appeared (set when it does), for the time spent.
  const shownAt = useRef<number | null>(null);
  const finalizers = useRef(new Map<string, DrawingFinalizer>());
  const registerDrawing = useCallback((id: string, finalize: DrawingFinalizer | null) => {
    if (finalize) finalizers.current.set(id, finalize);
    else finalizers.current.delete(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getMasteryState(attemptId, getDeviceId()).then((r) => {
      if (cancelled) return;
      if ("error" in r) setLoadError(r.error);
      else setState(r.ok);
    });
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const [noEvents] = useState<IntegrityEvent[]>([]);
  const finished = state?.finished ?? false;
  const guard = useIntegrity({
    active: state !== null && !finished,
    settings: session.integrity,
    needsFullscreen: false,
    initial: noEvents,
    onLimit: () => {},
  });
  // Tells the server what the integrity checks noticed (the teacher's live view shows it), and that we're here.
  const sent = useRef(0);
  useEffect(() => {
    if (state === null || finished) return;
    const flush = setInterval(() => {
      const { events, end } = guard.pending(sent.current);
      if (events.length === 0) return;
      void recordExamEvents(attemptId, getDeviceId(), events).then((r) => {
        if (!r || !("error" in r)) sent.current = end;
      });
    }, eventsFlushMs);
    const beat = setInterval(() => void examHeartbeat(attemptId, getDeviceId()), heartbeatMs);
    return () => {
      clearInterval(flush);
      clearInterval(beat);
    };
  }, [attemptId, state === null, finished, guard]); // eslint-disable-line react-hooks/exhaustive-deps

  const question = graded ? null : (state?.question ?? null);
  const shownId = question ? `${question.id}:${state?.triesUsed ?? 0}` : null;
  useEffect(() => {
    shownAt.current = shownId === null ? null : Date.now();
  }, [shownId]);
  const { urls: assetUrls, add } = useAssetUrls(paper.assetUrls);
  useEffect(() => {
    const more = { ...state?.assetUrls, ...graded?.feedback.assetUrls };
    if (Object.keys(more).length) add(more);
  }, [state, graded, add]);

  function change(v: AnswerValue) {
    latest.current = v;
    setValue(v);
  }

  // Code and SQL boxes start with the question's starter code, so that counts as the answer until it is edited.
  const effective = (): AnswerValue | undefined =>
    latest.current ?? (question?.type === "code" || question?.type === "sql" ? question.starterCode : undefined);

  async function check() {
    if (!question || !state) return;
    setError(null);
    setChecking(true);
    let failure: string | null = null;
    await Promise.all(
      [...finalizers.current.values()].map((finalize) =>
        finalize().catch((e: unknown) => {
          failure = `Your drawing couldn't be uploaded: ${e instanceof Error ? e.message : "try again"}.`;
        }),
      ),
    );
    if (failure) {
      setChecking(false);
      setError(failure);
      return;
    }
    const answer = effective();
    if (answer === undefined) {
      setChecking(false);
      setError("Answer the question first.");
      return;
    }
    try {
      const result = await answerMastery(attemptId, getDeviceId(), question.id, answer, Date.now() - (shownAt.current ?? Date.now()));
      if ("error" in result) setError(result.error);
      else setGraded({ feedback: result.ok.feedback, next: result.ok.state });
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setChecking(false);
  }

  function next() {
    if (!graded) return;
    latest.current = undefined;
    setValue(undefined);
    setState(graded.next);
    setGraded(null);
  }

  if (loadError)
    return (
      <Card role="alert" className="mx-auto max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-8 text-danger" aria-hidden />
        <p className="mt-3 text-sm text-muted">{loadError}</p>
      </Card>
    );
  if (!state) return <div className="mx-auto h-72 max-w-2xl animate-pulse rounded-xl bg-surface-muted" />;

  const shown = graded ? graded.next : state;
  // The bar fills as questions are mastered; one that is done without being mastered isn't "left" either.
  const done = shown.mastered + shown.missed + shown.pending;
  const copyBlocked = session.integrity.blockCopy;

  if (shown.finished && !graded)
    return <Finished state={shown} resultHref={`/student/assessments/${session.id}/result`} title={quiz.title} />;

  return (
    <div className={clsx("mx-auto max-w-2xl space-y-4", copyBlocked && "select-none [&_.cm-content]:select-text [&_input]:select-text [&_textarea]:select-text")}>
      <div>
        <div className="mb-1 flex items-baseline justify-between text-sm">
          <h1 className="font-semibold">{quiz.title}</h1>
          <span className="text-muted tabular-nums" data-testid="mastery-progress">
            {shown.mastered} of {shown.total} mastered · {shown.remaining} to go
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={shown.total}
          aria-valuenow={done}
          aria-label="Questions mastered"
          className="h-2 overflow-hidden rounded-full bg-surface-muted"
        >
          <div className="h-full bg-success transition-all" style={{ width: `${shown.total === 0 ? 0 : (shown.mastered / shown.total) * 100}%` }} />
        </div>
      </div>

      {guard.notice && (
        <div role="alert" className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="flex-1">{guard.notice.message} This was recorded and your teacher will see it.</span>
          <button type="button" onClick={guard.dismissNotice} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {question && (
        <Card key={`${question.id}:${state.triesUsed}`} data-question-id={question.id} className="@container p-4 @lg:p-5">
          <div className="mb-3">
            {question.type !== "blank" && (
              <Markdown className="font-medium" assetUrls={assetUrls}>
                {question.prompt}
              </Markdown>
            )}
            <p className="mt-0.5 text-xs text-muted">
              {questionTypeLabel[question.type]}
              {state.triesUsed > 0 && ` · try ${state.triesUsed + 1} of ${state.retryLimit}`}
            </p>
          </div>
          <AnswerInput
            q={question}
            value={value}
            onChange={change}
            assetUrls={assetUrls}
            uploads
            registerDrawing={registerDrawing}
          />
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <Button onClick={() => void check()} disabled={checking}>
              {checking ? "Checking…" : "Check answer"}
            </Button>
          </div>
        </Card>
      )}

      {graded && <FeedbackCard graded={graded} assetUrls={assetUrls} onNext={next} />}
    </div>
  );
}

function FeedbackCard({
  graded: { feedback: f, next },
  assetUrls,
  onNext,
}: {
  graded: Graded;
  assetUrls: Record<string, string>;
  onNext: () => void;
}) {
  const tone = f.correct === null ? "pending" : f.correct ? "right" : "wrong";
  return (
    <Card
      role="status"
      data-testid="mastery-feedback"
      data-result={tone}
      className={clsx(
        "space-y-3 p-4 @lg:p-5",
        tone === "right" && "border-success",
        tone === "wrong" && "border-danger",
      )}
    >
      <div className="flex items-center gap-2 font-semibold">
        {tone === "right" ? (
          <CheckCircle2 className="size-5 text-success" aria-hidden />
        ) : tone === "wrong" ? (
          <XCircle className="size-5 text-danger" aria-hidden />
        ) : (
          <Clock className="size-5 text-muted" aria-hidden />
        )}
        {tone === "right" && (f.triesUsed === 1 ? "Correct!" : `Correct, on try ${f.triesUsed}.`)}
        {tone === "pending" && "Answer received. Your teacher will grade it."}
        {tone === "wrong" && (f.final ? "Not quite, and you're out of tries for this one." : "Not quite.")}
      </div>
      {tone === "wrong" && !f.final && (
        <p className="text-sm text-muted">
          {f.triesLeft} {f.triesLeft === 1 ? "try" : "tries"} left. This question will come back
          {next.remaining > 1 ? " after a few others" : " next"}.
        </p>
      )}
      {f.reveal && (
        <div className="text-sm">
          <span className="text-muted">Correct answer: </span>
          <Markdown inline assetUrls={{ ...assetUrls, ...f.assetUrls }}>
            {answerKey(f.reveal)}
          </Markdown>
        </div>
      )}
      {f.explanation && (
        <Markdown className="rounded-md bg-surface-muted p-3 text-sm" assetUrls={assetUrls}>
          {f.explanation}
        </Markdown>
      )}
      <div className="flex justify-end">
        <Button onClick={onNext}>
          {next.finished ? "See how you did" : "Next question"} <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </Card>
  );
}

function Finished({ state, resultHref, title }: { state: MasteryState; resultHref: string; title: string }) {
  const { mastered, total, missed, pending } = state;
  return (
    <Card className="mx-auto max-w-lg space-y-3 p-8 text-center" data-testid="mastery-finished">
      <PartyPopper className="mx-auto size-8 text-primary" aria-hidden />
      <h1 className="text-lg font-semibold">{title}: done</h1>
      <p className="text-4xl font-semibold tabular-nums">
        {mastered} <span className="text-xl text-muted">/ {total} mastered</span>
      </p>
      <p className="text-sm text-muted">
        {missed > 0 && `${missed} ${missed === 1 ? "question" : "questions"} not mastered. `}
        {pending > 0 && `${pending} waiting for your teacher. `}
        {missed === 0 && pending === 0 && "Every question mastered."}
      </p>
      <ButtonLink href={resultHref}>See my results</ButtonLink>
    </Card>
  );
}
