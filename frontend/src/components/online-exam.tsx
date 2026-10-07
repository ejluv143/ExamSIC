"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import clsx from "clsx";
import { AlertTriangle, Check, Clock, Maximize, MonitorX, Play, RotateCcw, ShieldCheck, X } from "lucide-react";
import { promptParts } from "@/lib/blanks";
import { formatDateTime, questionTypeLabel } from "@/lib/format";
import { autoScore, maxScore } from "@/lib/scoring";
import { languageLabel, runsInBrowser } from "@/lib/code";
import { runJsTests } from "@/lib/run-js";
import type {
  AnswerValue,
  Assessment,
  Class,
  CodeQuestion,
  CodeTestResult,
  IntegrityEvent,
  Question,
  SqlQuestion,
} from "@/lib/types";
import { previewTables, runSqlInBrowser } from "@/lib/run-sql";
import { sameResult, type SqlResult } from "@/lib/sql";
import { answerKey } from "@/lib/answers";
import { parseNumber } from "@/lib/math";
import { CodeEditor } from "./code-editor";
import { CodeTests } from "./code-tests";
import { SqlTable } from "./sql-table";
import { clearClipboard, hasSecondScreen, useIntegrity, Watermark } from "./exam-integrity";
import { MathText } from "./math-text";
import { groupIntoParts, partSettings } from "./test-paper";
import { Badge, Button, Card, inputClass } from "./ui";

type Answers = Record<string, AnswerValue>;

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Applies the shuffle settings the way each student would get them.
function studentOrder(a: Assessment) {
  return groupIntoParts(a.questions).map((part) => ({
    ...part,
    questions: (a.settings.shuffleQuestions ? shuffled(part.questions) : part.questions).map((q) =>
      q.type === "multiple_choice" && a.settings.shuffleChoices ? { ...q, choices: shuffled(q.choices) } : q,
    ),
  }));
}

const releaseNote = {
  immediately: "Students see their score right after submitting.",
  after_close: "Students see their score after the exam closes.",
  manual: "Students see their score when you release it.",
};

function isAnswered(q: Question, v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return false;
  // Untouched starter code isn't an answer.
  if (q.type === "code" || q.type === "sql")
    return typeof v === "string" && v.trim() !== "" && v.trim() !== q.starterCode.trim();
  if (Array.isArray(v)) return v.some((x) => x.trim());
  return typeof v === "string" ? v.trim() !== "" : true;
}

// When a student takes it for real. Without this, the component is the teacher's preview.
export type TakeMode = {
  attemptsUsed: number;
  // Where the in-progress attempt is kept in this browser, so a refresh doesn't lose it.
  draftKey: string;
  // Returns an error message, or null when submitted (the page then moves on).
  onSubmit: (answers: Answers, startedAt: string, events: IntegrityEvent[]) => Promise<string | null>;
  // Records the start on the server and returns its time, which the timer then runs from.
  onStart: () => Promise<string | null>;
  // Student name and number for the watermark.
  watermark: string;
  // Runs a code answer's sample tests on the server (Python, Java, C, C++). Missing when no runner is set up.
  runCode?: (questionId: string, code: string) => Promise<{ results: CodeTestResult[] } | { error: string }>;
  // The element that goes full screen: just the exam, so the site header and links stay out of view.
  fullscreenRoot: RefObject<HTMLElement | null>;
};

type Draft = { parts: ReturnType<typeof studentOrder>; answers: Answers; startedAt: string; events: IntegrityEvent[] };

function readDraft(key: string | undefined): Draft | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function secondsRemaining(limitMinutes: number | null, startedAt: string | null) {
  if (limitMinutes === null || !startedAt) return null;
  return Math.max(0, limitMinutes * 60 - Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
}

// The exam as a student takes it online. As a preview, answers stay in this component.
function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

// In take mode, render only in the browser: the saved draft is read while setting up state.
export function OnlineExam({
  assessment: a,
  classes,
  take,
}: {
  assessment: Assessment;
  classes: Class[];
  take?: TakeMode;
}) {
  const [draft] = useState(() => readDraft(take?.draftKey));
  const [stage, setStage] = useState<"intro" | "taking" | "done">(draft ? "taking" : "intro");
  const [parts, setParts] = useState(() => draft?.parts ?? studentOrder(a));
  const [answers, setAnswers] = useState<Answers>(draft?.answers ?? {});
  const [startedAt, setStartedAt] = useState<string | null>(draft?.startedAt ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const limit = a.settings.timeLimitMinutes;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() => secondsRemaining(limit, draft?.startedAt ?? null));
  const total = maxScore(a.questions);
  const answered = a.questions.filter((q) => isAnswered(q, answers[q.id])).length;
  const rules = a.settings.integrity;
  const guard = useIntegrity({
    active: !!take && stage === "taking",
    settings: rules,
    initial: draft?.events ?? [],
    onLimit: (events) => submit(true, events),
  });

  // Students take it in full screen. Browsers without it (iPhone Safari) or that refuse it just carry on.
  const canFullscreen =
    !!take && rules.requireFullscreen && typeof document !== "undefined" && document.fullscreenEnabled;
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => !!document.fullscreenElement,
    () => false,
  );
  const [fullscreenRefused, setFullscreenRefused] = useState(false);
  // Must run inside a click: browsers only allow full screen in response to the user.
  function enterFullscreen() {
    const root = take?.fullscreenRoot.current;
    if (!canFullscreen || !root || document.fullscreenElement) return;
    root.requestFullscreen().catch(() => setFullscreenRefused(true));
  }
  // Leave full screen once the attempt is over (submitting moves on to the result page).
  const taking = !!take;
  useEffect(() => {
    if (!taking) return;
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [taking]);

  // `forced`: time ran out or too many warnings, so no confirmation.
  async function submit(forced = false, events = guard.events) {
    if (!take) {
      setStage("done");
      return;
    }
    if (!forced && answered < a.questions.length) {
      const left = a.questions.length - answered;
      const message = `${left} ${left === 1 ? "question is" : "questions are"} unanswered. Submit anyway?`;
      if (!guard.withoutTracking(() => window.confirm(message))) return;
    }
    setSubmitting(true);
    setSubmitError(null);
    // Drop the saved draft first: a successful submit redirects and never returns here, and a draft
    // left behind would be restored (and submitted again) if the student came back to this page.
    try {
      localStorage.removeItem(take.draftKey);
    } catch {}
    const draftNow: Draft = { parts, answers, startedAt: startedAt ?? new Date().toISOString(), events };
    const error = await take.onSubmit(answers, draftNow.startedAt, events);
    if (error) {
      try {
        localStorage.setItem(take.draftKey, JSON.stringify(draftNow));
      } catch {}
      setSubmitError(error);
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (stage !== "taking" || limit === null || !startedAt) return;
    const timer = setInterval(() => {
      const left = secondsRemaining(limit, startedAt) ?? 0;
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timer);
        submit(true);
      }
    }, 1000);
    return () => clearInterval(timer);
    // submit reads the latest answers through its closure, re-created each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, limit, startedAt, answers]);

  // Keep the attempt in this browser until it's submitted.
  useEffect(() => {
    if (!take || stage !== "taking" || !startedAt) return;
    try {
      const events = guard.events;
      localStorage.setItem(take.draftKey, JSON.stringify({ parts, answers, startedAt, events } satisfies Draft));
    } catch {}
  }, [take, stage, parts, answers, startedAt, guard.events]);

  function start() {
    if (take && rules.blockSecondScreen && hasSecondScreen()) {
      setStartError("Disconnect your second monitor (or set your display to show on one screen only), then try again.");
      return;
    }
    setStartError(null);
    enterFullscreen();
    if (take && rules.blockCopyPaste) clearClipboard();
    const now = new Date().toISOString();
    setParts(studentOrder(a));
    setAnswers({});
    setStartedAt(now);
    setSecondsLeft(secondsRemaining(limit, now));
    setStage("taking");
    // The server's start time wins; it's earlier if this attempt was already started elsewhere.
    take?.onStart().then((serverStart) => {
      if (!serverStart) return;
      setStartedAt(serverStart);
      setSecondsLeft(secondsRemaining(limit, serverStart));
    });
  }

  const ruleList = [
    rules.requireFullscreen && `It opens in full screen. Stay in full screen until you submit.`,
    rules.trackFocus &&
      "Switching tabs or apps (including Alt+Tab) and moving the mouse off the exam are recorded and reported to your teacher.",
    rules.blockSecondScreen && "Use one screen only. A second monitor must be disconnected.",
    rules.blockCopyPaste &&
      "Copying, pasting, dragging text, right-click and printing are turned off. Your clipboard is cleared when you start.",
    rules.watermark && "Your name is shown faintly across the screen.",
    rules.autoSubmitAfter !== null &&
      `After ${rules.autoSubmitAfter} ${rules.autoSubmitAfter === 1 ? "warning" : "warnings"} for leaving, your ${a.kind} is submitted automatically.`,
  ].filter((x): x is string => !!x);

  const set = (id: string, v: AnswerValue) => setAnswers((prev) => ({ ...prev, [id]: v }));
  const course = classes.map((c) => `${c.courseCode} · ${c.section}`).join(", ");

  if (stage === "intro") {
    return (
      <Card className="mx-auto max-w-2xl overflow-hidden">
        <div className="border-b border-border bg-primary-soft px-6 py-5">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            {a.header.school} · {course || "No class assigned"}
          </p>
          <h1 className="mt-1 text-xl font-semibold">{a.title || "Untitled"}</h1>
        </div>
        <div className="space-y-5 p-6">
          <dl className="grid grid-cols-2 gap-3 text-sm @lg:grid-cols-4">
            {[
              ["Questions", a.questions.length],
              ["Points", total],
              ["Time limit", limit ? `${limit} min` : "None"],
              ["Attempts", a.settings.attemptsAllowed],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-lg bg-surface-muted px-3 py-2">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {a.settings.closesAt && (
            <p className="text-sm text-muted">Closes {formatDateTime(a.settings.closesAt)}.</p>
          )}
          {a.description && <p className="text-sm">{a.description}</p>}
          {a.paper.generalInstructions.some((x) => x.trim()) && (
            <ul className="space-y-1.5 text-sm">
              {a.paper.generalInstructions
                .filter((x) => x.trim())
                .map((line) => {
                  const [first, ...rest] = line.trim().split(" ");
                  return (
                    <li key={line} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      <span>
                        <span className="font-semibold">{first}</span> {rest.join(" ")}
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
          {ruleList.length > 0 && (
            <div className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
              <p className="flex items-center gap-2 font-medium">
                <ShieldCheck className="size-4 shrink-0" aria-hidden /> Exam rules
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
                {ruleList.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {take && (
            <p className="text-sm text-muted">
              This is attempt {take.attemptsUsed + 1} of {a.settings.attemptsAllowed}.
              {limit !== null && " The timer starts when you press Start and keeps running if you leave the page."}
            </p>
          )}
          {startError && (
            <p role="alert" className="flex gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
              <MonitorX className="mt-0.5 size-4 shrink-0" aria-hidden />
              {startError}
            </p>
          )}
          <Button className="w-full" onClick={start} disabled={a.questions.length === 0}>
            {a.questions.length === 0 ? "No questions yet" : `Start ${a.kind}`}
          </Button>
        </div>
      </Card>
    );
  }

  if (stage === "done") {
    const results = a.questions.map((q) => ({ q, score: autoScore(q, answers[q.id] ?? null) }));
    const scored = results.reduce((n, r) => n + (r.score ?? 0), 0);
    const pending = results.filter((r) => r.score === null);
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Card className="p-6 text-center">
          <p className="text-sm text-muted">{secondsLeft === 0 ? "Time's up. Answers were submitted." : "Submitted"}</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums">
            {Math.round(scored * 100) / 100} <span className="text-xl text-muted">/ {total}</span>
          </p>
          {pending.length > 0 && (
            <p className="mt-1 text-sm text-muted">
              Not counting {pending.length} {pending.length === 1 ? "answer" : "answers"} (essays and code) that you grade by hand.
            </p>
          )}
          <p className="mt-3 text-xs text-muted">
            Preview only, nothing is saved. {releaseNote[a.settings.resultsRelease]}
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => setStage("intro")}>
            <RotateCcw className="size-4" aria-hidden /> Try again
          </Button>
        </Card>
        <Card>
          <p className="border-b border-border px-5 py-3 text-sm font-medium">Answer check (teacher only)</p>
          <ul className="divide-y divide-border">
            {results.map(({ q, score }, i) => (
              <li key={q.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                <span
                  className={clsx(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                    score === null
                      ? "bg-surface-muted text-muted"
                      : score === q.points
                        ? "bg-success-soft text-success"
                        : score > 0
                          ? "bg-warning-soft text-warning"
                          : "bg-danger-soft text-danger",
                  )}
                >
                  {score === null ? "–" : score === q.points ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2">
                    {i + 1}.{" "}
                    <MathText
                      text={
                        q.type === "fill_in_the_blank"
                          ? promptParts(q.prompt)
                              .map((p) => ("text" in p ? p.text : "___"))
                              .join("")
                          : q.prompt
                      }
                    />
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Correct: <MathText text={answerKey(q)} />
                  </p>
                </div>
                <span className="shrink-0 tabular-nums text-muted">
                  {score === null ? "to grade" : `${score} / ${q.points}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  const numbers = new Map(parts.flatMap((part) => part.questions).map((q, i) => [q.id, i + 1]));
  return (
    <div className="mx-auto max-w-2xl">
      {guard.secondScreen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background p-4">
          <Card role="alertdialog" aria-labelledby="screen-title" className="max-w-sm space-y-3 p-6 text-center">
            <MonitorX className="mx-auto size-8 text-danger" aria-hidden />
            <h2 id="screen-title" className="font-semibold">
              Disconnect the second screen
            </h2>
            <p className="text-sm text-muted">
              This {a.kind} allows one screen only. It was recorded and your teacher will see it. The questions come
              back once the extra monitor is disconnected
              {secondsLeft !== null && "; the timer is still running"}.
            </p>
          </Card>
        </div>
      )}

      {!guard.secondScreen && canFullscreen && !isFullscreen && !fullscreenRefused && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-4 backdrop-blur">
          <Card role="alertdialog" aria-labelledby="fullscreen-title" className="max-w-sm space-y-4 p-6 text-center">
            <Maximize className="mx-auto size-8 text-primary" aria-hidden />
            <div>
              <h2 id="fullscreen-title" className="font-semibold">
                Return to full screen
              </h2>
              <p className="mt-1 text-sm text-muted">
                This {a.kind} is taken in full screen. Your answers are saved
                {secondsLeft !== null && ", and the timer is still running"}.
              </p>
            </div>
            <Button className="w-full" onClick={enterFullscreen}>
              <Maximize className="size-4" aria-hidden /> Continue in full screen
            </Button>
          </Card>
        </div>
      )}

      <div className="sticky top-0 z-10 -mx-3 mb-4 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur @lg:mx-0 @lg:rounded-xl @lg:border">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate font-semibold">{a.title || "Untitled"}</p>
          {secondsLeft !== null && (
            <span
              className={clsx(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium tabular-nums",
                secondsLeft < 300 ? "bg-danger-soft text-danger" : "bg-surface-muted",
              )}
            >
              <Clock className="size-4" aria-hidden />
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted">
          <div className="h-1.5 flex-1 rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${(answered / Math.max(1, a.questions.length)) * 100}%` }}
            />
          </div>
          <span className="tabular-nums">
            {answered} / {a.questions.length} answered
          </span>
        </div>
      </div>

      {take && rules.watermark && <Watermark text={take.watermark} />}

      {guard.notice && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="flex-1">
            {guard.notice.message} This was recorded and your teacher will see it.
            {guard.notice.kind === "away" && (
              <>
                {" "}
                Warning {guard.timesAway}
                {rules.autoSubmitAfter !== null && ` of ${rules.autoSubmitAfter}`}.
                {rules.autoSubmitAfter !== null &&
                  guard.timesAway < rules.autoSubmitAfter &&
                  ` At ${rules.autoSubmitAfter}, your ${a.kind} is submitted automatically.`}
              </>
            )}
          </span>
          <button type="button" onClick={guard.dismissNotice} aria-label="Dismiss" className="hover:opacity-70">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Question text can't be selected when copying is blocked; answer boxes still work. */}
      <div
        className={clsx(
          "space-y-6",
          take &&
            rules.blockCopyPaste &&
            "select-none [&_.cm-content]:select-text [&_input]:select-text [&_textarea]:select-text",
        )}
      >
        {parts.map((part, p) => {
          const { title, instructions } = partSettings(a, part.type);
          return (
            <section key={part.type} className="space-y-3">
              <div>
                <h2 className="font-semibold">
                  Part {p + 1}: {title}
                </h2>
                <p className="text-sm text-muted">{instructions}</p>
              </div>
              {part.questions.map((q) => {
                const number = numbers.get(q.id);
                return (
                  <Card key={q.id} className="p-4 @lg:p-5">
                    <div className="mb-3 flex items-start gap-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-muted text-sm font-semibold tabular-nums">
                        {number}
                      </span>
                      <div className="min-w-0 flex-1">
                        {q.type !== "fill_in_the_blank" && (
                          <p className="font-medium">
                            <MathText text={q.prompt} />
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-muted">
                          {questionTypeLabel[q.type]} · {q.points} {q.points === 1 ? "pt" : "pts"}
                        </p>
                      </div>
                    </div>
                    <AnswerInput
                      q={q}
                      value={answers[q.id]}
                      onChange={(v) => set(q.id, v)}
                      runOnServer={take?.runCode}
                    />
                  </Card>
                );
              })}
            </section>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {answered < a.questions.length && (
          <span className="text-sm text-muted">{a.questions.length - answered} unanswered</span>
        )}
        <Button onClick={() => submit()} disabled={submitting}>
          {submitting ? "Submitting…" : `Submit ${a.kind}`}
        </Button>
      </div>
      {submitError && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-right text-sm text-danger">
          {submitError}
        </p>
      )}
    </div>
  );
}


function AnswerInput({
  q,
  value,
  onChange,
  runOnServer,
}: {
  q: Question;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  runOnServer?: TakeMode["runCode"];
}) {
  switch (q.type) {
    case "multiple_choice":
      return (
        <div className="space-y-2" role="radiogroup">
          {q.choices.map((c, i) => {
            const checked = value === c.id;
            return (
              <label
                key={c.id}
                className={clsx(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
                  checked ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  name={q.id}
                  checked={checked}
                  onChange={() => onChange(c.id)}
                  className="size-4 accent-primary"
                />
                <span className="font-medium text-muted">{String.fromCharCode(65 + i)}.</span>
                <span>
                  <MathText text={c.text} />
                </span>
              </label>
            );
          })}
        </div>
      );
    case "true_false":
      return (
        <div className="grid grid-cols-2 gap-2">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={value === v}
              onClick={() => onChange(v)}
              className={clsx(
                "rounded-lg border px-4 py-2.5 text-sm font-medium",
                value === v ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-surface-muted",
              )}
            >
              {v ? "True" : "False"}
            </button>
          ))}
        </div>
      );
    case "identification":
      return (
        <input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your answer"
          className={inputClass}
        />
      );
    case "fill_in_the_blank": {
      const given = Array.isArray(value) ? value : [];
      const parts = promptParts(q.prompt);
      return (
        <p className="leading-10">
          {parts.map((p, i) => {
            if ("text" in p) return <MathText key={i} text={p.text} />;
            const b = parts.slice(0, i).filter((x) => "answers" in x).length;
            return (
              <input
                key={i}
                value={given[b] ?? ""}
                onChange={(e) => {
                  const next = [...given];
                  next[b] = e.target.value;
                  onChange(next);
                }}
                aria-label={`Blank ${b + 1}`}
                className="mx-1 w-36 border-0 border-b-2 border-border bg-transparent px-1 py-0.5 text-center focus:border-primary focus:outline-none"
              />
            );
          })}
        </p>
      );
    }
    case "enumeration": {
      const given = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-2">
          {q.items.map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-right text-sm text-muted">{i + 1}.</span>
              <input
                value={given[i] ?? ""}
                onChange={(e) => {
                  const next = [...given];
                  next[i] = e.target.value;
                  onChange(next);
                }}
                aria-label={`Item ${i + 1}`}
                className={inputClass}
              />
            </div>
          ))}
          {q.orderMatters && <Badge>Order matters</Badge>}
        </div>
      );
    }
    case "numeric": {
      const text = typeof value === "string" ? value : "";
      const n = parseNumber(text);
      return (
        <div>
          <div className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => onChange(e.target.value)}
              inputMode="decimal"
              placeholder="Your answer"
              aria-label="Your answer"
              className={`${inputClass} max-w-48`}
            />
            {q.unit && <span className="text-sm text-muted">{q.unit}</span>}
          </div>
          <p className="mt-1 text-xs text-muted">
            {text.trim() && n === null
              ? "Type a number, like 12, -3.5, 3/4 or 1 1/2."
              : "Numbers only. Fractions like 3/4 are fine."}
          </p>
        </div>
      );
    }
    case "essay":
      return (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          placeholder="Write your answer…"
          className={inputClass}
        />
      );
    case "code":
      return (
        <CodeAnswer
          q={q}
          value={typeof value === "string" ? value : q.starterCode}
          onChange={onChange}
          runOnServer={runOnServer}
        />
      );
    case "sql":
      return <SqlAnswer q={q} value={typeof value === "string" ? value : q.starterCode} onChange={onChange} />;
  }
}

function SqlAnswer({ q, value, onChange }: { q: SqlQuestion; value: string; onChange: (v: string) => void }) {
  const [tables, setTables] = useState<{ name: string; result: SqlResult }[] | { error: string } | null>(null);
  const [expected, setExpected] = useState<SqlResult | null>(q.sampleResult ?? null);
  const [run, setRun] = useState<{ result?: SqlResult; error?: string } | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let live = true;
    previewTables(q.setupSql).then((t) => live && setTables(t));
    // The teacher's preview has the answer query but no precomputed sample result.
    if (!q.sampleResult && q.answerSql.trim())
      runSqlInBrowser(q.setupSql, q.answerSql).then((r) => live && r.result && setExpected(r.result));
    return () => {
      live = false;
    };
  }, [q.setupSql, q.answerSql, q.sampleResult]);

  // sql.js reports no columns for an empty result, so two empty results count as the same.
  const matches =
    run?.result && expected
      ? (run.result.rows.length === 0 && expected.rows.length === 0) || sameResult(run.result, expected, q.orderMatters)
      : null;

  return (
    <div className="space-y-3">
      <details open>
        <summary className="cursor-pointer text-sm font-medium">Tables</summary>
        <div className="mt-2 grid gap-3 @lg:grid-cols-2">
          {tables === null ? (
            <p className="text-sm text-muted">Loading tables…</p>
          ) : "error" in tables ? (
            <pre className="overflow-auto rounded-md bg-surface-muted p-3 font-mono text-xs">{q.setupSql}</pre>
          ) : (
            tables.map((t) => <SqlTable key={t.name} result={t.result} caption={t.name} />)
          )}
        </div>
      </details>
      {expected && (
        <SqlTable
          result={expected}
          caption={`Expected result on this data${q.orderMatters ? " (in this order)" : " (any order)"}`}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge>SQLite</Badge>
        <span className="flex-1" />
        <Button
          variant="ghost"
          className="px-2.5 py-1.5 text-xs"
          disabled={value === q.starterCode}
          onClick={() => {
            if (window.confirm("Replace your query with the starter query?")) {
              onChange(q.starterCode);
              setRun(null);
            }
          }}
        >
          <RotateCcw className="size-3.5" aria-hidden /> Reset
        </Button>
        <Button
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          disabled={running}
          onClick={async () => {
            setRunning(true);
            setRun(await runSqlInBrowser(q.setupSql, value));
            setRunning(false);
          }}
        >
          <Play className="size-3.5" aria-hidden /> {running ? "Running…" : "Run query"}
        </Button>
      </div>
      <CodeEditor value={value} onChange={onChange} language="sql" minLines={5} label="Your query" />
      {run?.error && (
        <p role="status" className="rounded-md bg-danger-soft px-3 py-2 font-mono text-xs text-danger">
          {run.error}
        </p>
      )}
      {run?.result && (
        <div role="status" className="space-y-1.5">
          {matches !== null && (
            <p className={clsx("text-sm font-medium", matches ? "text-success" : "text-warning")}>
              {matches
                ? "Matches the expected result on this data. It's also checked on data you can't see."
                : "Doesn't match the expected result yet."}
            </p>
          )}
          <SqlTable result={run.result} caption="Your result" />
        </div>
      )}
    </div>
  );
}

function CodeAnswer({
  q,
  value,
  onChange,
  runOnServer,
}: {
  q: CodeQuestion;
  value: string;
  onChange: (v: string) => void;
  runOnServer?: TakeMode["runCode"];
}) {
  const [results, setResults] = useState<CodeTestResult[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  // JavaScript runs right here; other languages go to the code runner when there is one.
  const inBrowser = runsInBrowser(q.language);
  const canRun = q.tests.length > 0 && (inBrowser || !!runOnServer);
  const passed = results?.filter((r) => r.passed).length ?? 0;

  async function run() {
    setRunning(true);
    setRunError(null);
    if (inBrowser) setResults(await runJsTests(value, q.tests));
    else {
      const reply = await runOnServer!(q.id, value);
      if ("error" in reply) setRunError(reply.error);
      else setResults(reply.results);
    }
    setRunning(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{languageLabel[q.language]}</Badge>
        <span className="flex-1" />
        <Button
          variant="ghost"
          className="px-2.5 py-1.5 text-xs"
          disabled={value === q.starterCode}
          onClick={() => {
            if (window.confirm("Replace your code with the starter code?")) {
              onChange(q.starterCode);
              setResults(null);
            }
          }}
        >
          <RotateCcw className="size-3.5" aria-hidden /> Reset
        </Button>
        {canRun && (
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={run} disabled={running}>
            <Play className="size-3.5" aria-hidden /> {running ? (inBrowser ? "Running…" : "Compiling and running…") : "Run sample tests"}
          </Button>
        )}
      </div>
      <CodeEditor value={value} onChange={onChange} language={q.language} label="Your code" />
      {runError && (
        <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          {runError}
        </p>
      )}
      {results && (
        <p
          role="status"
          className={clsx("text-sm font-medium", passed === results.length ? "text-success" : "text-warning")}
        >
          Passed {passed} of {results.length} sample {results.length === 1 ? "test" : "tests"}. Your teacher&apos;s
          hidden tests are checked after you submit.
        </p>
      )}
      {q.tests.length > 0 && (
        <details open={!!results}>
          <summary className="cursor-pointer text-sm text-muted">
            Sample {q.tests.length === 1 ? "test" : "tests"} ({q.tests.length})
          </summary>
          <div className="mt-2">
            <CodeTests tests={q.tests} results={results ?? undefined} />
          </div>
        </details>
      )}
      {!canRun && (
        <p className="text-xs text-muted">
          {languageLabel[q.language]} can&apos;t run in the browser yet. Check your logic against the samples; your
          code is tested after you submit.
        </p>
      )}
    </div>
  );
}
