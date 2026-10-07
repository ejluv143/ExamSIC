"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import clsx from "clsx";
import { AlertTriangle, Clock, Maximize, MonitorX, Play, RotateCcw, ShieldCheck, X } from "lucide-react";
import { promptParts } from "@/lib/blanks";
import { formatDateTime, questionTypeLabel } from "@/lib/format";
import { attemptLabel } from "@/lib/attempts";
import { languageLabel, runsInBrowser } from "@/lib/code";
import { runJsTests } from "@/lib/run-js";
import { preloadPython, runPythonTests } from "@/lib/run-python";
import { maxEdits, type TypingEdit } from "@/lib/typing";
import { modeLabel } from "@/lib/sessions";
import type {
  AnswerValue,
  CodeTestResult,
  IntegrityEvent,
  Paper,
  StudentCodeQuestion,
  StudentQuestion,
  StudentSqlQuestion,
  TypingEdits,
} from "@examora/contract";
import type { Class } from "@/lib/types";
import { previewTables, runSqlInBrowser } from "@/lib/run-sql";
import { sameResult, type SqlResult } from "@/lib/sql";
import { parseNumber } from "@/lib/math";
import { CodeEditor } from "./code-editor";
import { CodeTests } from "./code-tests";
import { SqlTable } from "./sql-table";
import { clearClipboard, hasSecondScreen, useIntegrity, Watermark } from "./exam-integrity";
import { MathText } from "./math-text";
import { Badge, Button, Card, inputClass } from "./ui";

type Answers = Record<string, AnswerValue>;
type Typing = Record<string, TypingEdit[]>;

function isAnswered(q: StudentQuestion, v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return false;
  // Untouched starter code isn't an answer.
  if (q.type === "code" || q.type === "sql")
    return typeof v === "string" && v.trim() !== "" && v.trim() !== q.starterCode.trim();
  if (Array.isArray(v)) return v.some((x) => x.trim());
  return typeof v === "string" ? v.trim() !== "" : true;
}

// The Run button for languages the browser can't run. `ok` is null when there is no code runner.
export type RunCode = (questionId: string, code: string) => Promise<{ ok: readonly CodeTestResult[] | null } | { error: string }>;

// When a student takes it for real. Every callback returns an error message, or null on success.
// Without this, the component is the teacher's read-only preview.
export type TakeMode = {
  // Records the start on the server; the page then re-reads the paper, which now has the attempt and questions.
  onStart: () => Promise<string | null>;
  // Saves one answer (with the typing history for code and SQL). Rejects when the server can't be reached.
  onSave: (questionId: string, value: AnswerValue, typing?: TypingEdits) => Promise<string | null>;
  onEvents: (events: IntegrityEvent[]) => Promise<string | null>;
  // Sends the answers and the events not yet recorded; the page moves on to the result when it works.
  onSubmit: (answers: Answers, events: IntegrityEvent[], typing: Typing) => Promise<string | null>;
  // Student name and number for the watermark.
  watermark: string;
  // Missing when no code runner is set up.
  runCode?: RunCode;
  // The element that goes full screen: just the exam, so the site header and links stay out of view.
  fullscreenRoot: RefObject<HTMLElement | null>;
};

const saveDelayMs = 800;
const eventsFlushMs = 15_000;
const retrySaveMs = 5000;

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

// The exam as a student takes it online (with `take`), or as a read-only preview where answers stay here.
export function OnlineExam({ paper, classes, take }: { paper: Paper; classes: Class[]; take?: TakeMode }) {
  const { session, quiz, attempt } = paper;
  const rules = session.integrity;
  const kind = modeLabel(session.mode).toLowerCase();
  const questions = paper.parts.flatMap((part) => part.questions);
  const limit = session.timeLimitMinutes;

  const [previewStage, setPreviewStage] = useState<"intro" | "taking" | "done">("intro");
  const stage = take ? (attempt ? "taking" : "intro") : previewStage;
  // Edits to code and SQL answers, timed from the start, for the teacher's typing replay.
  const typing = useRef<Typing>(Object.fromEntries(Object.entries(paper.typing).map(([id, edits]) => [id, [...edits]])));
  const [answers, setAnswers] = useState<Answers>(() => ({ ...paper.answers }));
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [now, setNow] = useState(() => Date.now());
  const deadline = paper.deadline ? Date.parse(paper.deadline) : null;
  const secondsLeft = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const answered = questions.filter((q) => isAnswered(q, answers[q.id])).length;

  // Students take it in full screen. Browsers without it (iPhone Safari) or that refuse it just carry on.
  const canFullscreen =
    !!take && rules.requireFullscreen && typeof document !== "undefined" && document.fullscreenEnabled;
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => !!document.fullscreenElement,
    () => false,
  );
  const [fullscreenRefused, setFullscreenRefused] = useState(false);
  const [noEvents] = useState<IntegrityEvent[]>([]);
  const guard = useIntegrity({
    active: !!take && stage === "taking",
    settings: rules,
    needsFullscreen: canFullscreen && !fullscreenRefused,
    initial: noEvents,
    onLimit: (events) => submitRef.current(true, events),
  });
  // How many more times the student may leave and come back before the exam submits itself.
  const chancesLeft = rules.autoSubmitAfter === null ? null : Math.max(0, rules.autoSubmitAfter - guard.timesAway);
  const chancesText =
    chancesLeft === null
      ? ""
      : chancesLeft === 0
        ? ` If you leave again, your ${kind} is submitted automatically.`
        : ` You can leave and come back ${chancesLeft} more ${chancesLeft === 1 ? "time" : "times"}; after that, leaving submits your ${kind}.`;
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

  // The latest callbacks and events, for timers that outlive a render.
  const takeRef = useRef(take);
  const submitRef = useRef<(forced?: boolean, events?: IntegrityEvent[]) => Promise<void>>(async () => {});
  const eventsRef = useRef(guard.events);
  useEffect(() => {
    takeRef.current = take;
    eventsRef.current = guard.events;
  });
  // How many of the events the server already has, and whether the submit is under way.
  const sentEvents = useRef(0);
  const finalizing = useRef(false);

  // Answers are saved as they change, one question at a time.
  const pending = useRef(new Map<string, AnswerValue>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inflight = useRef(0);

  async function flush(id: string) {
    timers.current.delete(id);
    const value = pending.current.get(id);
    const current = takeRef.current;
    if (value === undefined || !current) return;
    pending.current.delete(id);
    inflight.current++;
    let error: string | null = null;
    let offline = false;
    try {
      error = await current.onSave(id, value, typing.current[id]);
    } catch {
      offline = true;
    }
    inflight.current--;
    if (offline) {
      setSaveState("error");
      // Keep trying, unless a newer answer is already waiting.
      if (!pending.current.has(id) && !finalizing.current) {
        pending.current.set(id, value);
        timers.current.set(id, setTimeout(() => void flush(id), retrySaveMs));
      }
    } else if (error) {
      // The server stopped taking answers (time is up): hand in what we have.
      setSaveState("error");
      if (!finalizing.current) void submitRef.current(true);
    } else if (inflight.current === 0 && timers.current.size === 0) setSaveState("saved");
  }

  function set(id: string, v: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [id]: v }));
    if (!take) return;
    pending.current.set(id, v);
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => void flush(id), saveDelayMs));
    setSaveState("saving");
  }

  useEffect(() => {
    const waiting = timers.current;
    return () => {
      for (const t of waiting.values()) clearTimeout(t);
    };
  }, []);

  // `forced`: time ran out or too many warnings, so no confirmation.
  async function submit(forced = false, events = guard.events) {
    if (!take) {
      setPreviewStage("done");
      return;
    }
    if (!forced && answered < questions.length) {
      const left = questions.length - answered;
      const message = `${left} ${left === 1 ? "question is" : "questions are"} unanswered. Submit anyway?`;
      if (!guard.withoutTracking(() => window.confirm(message))) return;
    }
    finalizing.current = true;
    for (const t of timers.current.values()) clearTimeout(t);
    timers.current.clear();
    pending.current.clear();
    setSubmitting(true);
    setSubmitError(null);
    let error: string | null;
    try {
      error = await take.onSubmit(answers, events.slice(sentEvents.current), typing.current);
    } catch {
      error = "Couldn't reach the server. Check your connection and submit again.";
    }
    if (error) {
      finalizing.current = false;
      setSubmitError(error);
      setSubmitting(false);
    }
  }

  useEffect(() => {
    submitRef.current = submit;
  });

  // The countdown runs to the server's deadline; at zero the answers are handed in.
  useEffect(() => {
    if (!take || stage !== "taking" || deadline === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [take, stage, deadline]);
  useEffect(() => {
    if (take && stage === "taking" && secondsLeft === 0 && !finalizing.current) void submitRef.current(true);
  }, [take, stage, secondsLeft]);

  // Tell the server about new integrity events every so often, so they survive a closed browser.
  useEffect(() => {
    if (!taking || stage !== "taking") return;
    const timer = setInterval(async () => {
      const events = eventsRef.current;
      const from = sentEvents.current;
      if (events.length <= from || finalizing.current) return;
      sentEvents.current = events.length;
      const failed = await takeRef.current?.onEvents(events.slice(from)).then((e) => !!e, () => true);
      if (failed && !finalizing.current) sentEvents.current = Math.min(sentEvents.current, from);
    }, eventsFlushMs);
    return () => clearInterval(timer);
  }, [taking, stage]);

  async function start() {
    if (!take) {
      setPreviewStage("taking");
      return;
    }
    if (rules.blockSecondScreen && hasSecondScreen()) {
      setStartError("Disconnect your second monitor (or set your display to show on one screen only), then try again.");
      return;
    }
    setStartError(null);
    enterFullscreen();
    if (rules.blockCopyPaste) clearClipboard();
    setStarting(true);
    let error: string | null;
    try {
      error = await take.onStart();
    } catch {
      error = "Couldn't reach the server. Check your connection and try again.";
    }
    if (error) {
      setStarting(false);
      setStartError(error);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
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
      `You can leave (switch away or exit full screen) and come back ${rules.autoSubmitAfter} ${rules.autoSubmitAfter === 1 ? "time" : "times"}. Leaving once more submits your ${kind} automatically.`,
  ].filter((x): x is string => !!x);

  const course = classes.map((c) => `${c.courseCode} · ${c.section}`).join(", ");
  const retakes = session.attemptsAllowed === null ? "Unlimited" : session.attemptsAllowed - 1 || "None";

  if (stage === "intro") {
    return (
      <Card className="mx-auto max-w-2xl overflow-hidden">
        <div className="border-b border-border bg-primary-soft px-6 py-5">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            {quiz.header.school} · {course || "No class assigned"}
          </p>
          <h1 className="mt-1 text-xl font-semibold">{quiz.title || "Untitled"}</h1>
        </div>
        <div className="space-y-5 p-6">
          <dl className="grid grid-cols-2 gap-3 text-sm @lg:grid-cols-4">
            {[
              ...(questions.length > 0
                ? [
                    ["Questions", questions.length],
                    ["Points", Math.round(questions.reduce((n, q) => n + q.points, 0) * 100) / 100],
                  ]
                : []),
              ["Time limit", limit ? `${limit} min` : "None"],
              ["Retakes", retakes],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-lg bg-surface-muted px-3 py-2">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {session.closesAt && <p className="text-sm text-muted">Closes {formatDateTime(session.closesAt)}.</p>}
          {quiz.description && <p className="text-sm">{quiz.description}</p>}
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
              {session.attemptsAllowed === 1
                ? `You can take this ${kind} once; there are no retakes.`
                : `This is ${attemptLabel(paper.attemptsUsed + 1, session.attemptsAllowed)}.`}
              {limit !== null && " The timer starts when you press Start and keeps running if you leave the page."}
            </p>
          )}
          {startError && (
            <p role="alert" className="flex gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
              <MonitorX className="mt-0.5 size-4 shrink-0" aria-hidden />
              {startError}
            </p>
          )}
          <Button
            className="w-full"
            onClick={start}
            disabled={starting || (!take && questions.length === 0)}
          >
            {!take && questions.length === 0 ? "No questions yet" : starting ? "Starting…" : `Start ${kind}`}
          </Button>
        </div>
      </Card>
    );
  }

  if (stage === "done") {
    return (
      <Card className="mx-auto max-w-2xl p-6 text-center">
        <p className="font-medium">End of the preview</p>
        <p className="mt-1 text-sm text-muted">Nothing was saved or sent.</p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => {
            setAnswers({});
            setPreviewStage("intro");
          }}
        >
          <RotateCcw className="size-4" aria-hidden /> Try again
        </Button>
      </Card>
    );
  }

  const numbers = new Map(questions.map((q, i) => [q.id, i + 1]));
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
              This {kind} allows one screen only. It was recorded and your teacher will see it. The questions come
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
                This {kind} is taken in full screen. Your answers are saved
                {secondsLeft !== null && ", and the timer is still running"}.{chancesText}
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
          <p className="min-w-0 flex-1 truncate font-semibold">{quiz.title || "Untitled"}</p>
          {take && saveState !== "idle" && (
            <span
              aria-live="polite"
              className={clsx("text-xs", saveState === "error" ? "text-danger" : "text-muted")}
            >
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Not saved, check your connection"}
            </span>
          )}
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
              style={{ width: `${(answered / Math.max(1, questions.length)) * 100}%` }}
            />
          </div>
          <span className="tabular-nums">
            {answered} / {questions.length} answered
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
                {rules.autoSubmitAfter !== null && guard.timesAway > rules.autoSubmitAfter
                  ? `No chances left: your ${kind} is being submitted.`
                  : `Warning ${guard.timesAway}${rules.autoSubmitAfter !== null ? ` of ${rules.autoSubmitAfter}` : ""}.${chancesText}`}
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
        {paper.parts
          .filter((part) => part.questions.length > 0)
          .map((part, p) => (
            <section key={part.id} className="space-y-3">
              <div>
                <h2 className="font-semibold">
                  Part {p + 1}: {part.title}
                </h2>
                {part.instructions && <p className="text-sm text-muted">{part.instructions}</p>}
              </div>
              {part.questions.map((q) => (
                <Card key={q.id} className="p-4 @lg:p-5">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-muted text-sm font-semibold tabular-nums">
                      {numbers.get(q.id)}
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
                    onEdit={
                      take && attempt ? (edits) => logEdits(typing.current, q.id, attempt.startedAt, edits) : undefined
                    }
                  />
                </Card>
              ))}
            </section>
          ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {answered < questions.length && <span className="text-sm text-muted">{questions.length - answered} unanswered</span>}
        <Button onClick={() => submit()} disabled={submitting}>
          {submitting ? "Submitting…" : take ? `Submit ${kind}` : "Finish preview"}
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
  onEdit,
}: {
  q: StudentQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  runOnServer?: RunCode;
  onEdit?: EditHandler;
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
          {Array.from({ length: q.itemCount }, (_, i) => (
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
          onEdit={onEdit}
        />
      );
    case "sql":
      return (
        <SqlAnswer
          q={q}
          value={typeof value === "string" ? value : q.starterCode}
          onChange={onChange}
          onEdit={onEdit}
        />
      );
  }
}

// The question's tables with their rows, built in the browser from its setup SQL.
function TablesPreview({ setup }: { setup: string }) {
  const [tables, setTables] = useState<{ name: string; result: SqlResult }[] | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    previewTables(setup).then((t) => live && setTables(t));
    return () => {
      live = false;
    };
  }, [setup]);
  return (
    <details open>
      <summary className="cursor-pointer text-sm font-medium">Tables</summary>
      <div className="mt-2 grid gap-3 @lg:grid-cols-2">
        {tables === null ? (
          <p className="text-sm text-muted">Loading tables…</p>
        ) : "error" in tables ? (
          <pre className="overflow-auto rounded-md bg-surface-muted p-3 font-mono text-xs">{setup}</pre>
        ) : (
          tables.map((t) => <SqlTable key={t.name} result={t.result} caption={t.name} />)
        )}
      </div>
    </details>
  );
}

type EditHandler = (edits: { from: number; to: number; insert: string }[]) => void;

function logEdits(typing: Typing, questionId: string, startedAt: string, edits: Parameters<EditHandler>[0]) {
  const t = Math.max(0, Date.now() - Date.parse(startedAt));
  const log = (typing[questionId] ??= []);
  for (const e of edits) if (log.length < maxEdits) log.push([t, e.from, e.to, e.insert]);
}

function SqlAnswer({
  q,
  value,
  onChange,
  onEdit,
}: {
  q: StudentSqlQuestion;
  value: string;
  onChange: (v: string) => void;
  onEdit?: EditHandler;
}) {
  const sample = q.sampleResult;
  const expected: SqlResult | null = sample ? { columns: [...sample.columns], rows: sample.rows.map((r) => [...r]) } : null;
  const [run, setRun] = useState<{ result?: SqlResult; error?: string } | null>(null);
  const [running, setRunning] = useState(false);

  // sql.js reports no columns for an empty result, so two empty results count as the same.
  const matches =
    run?.result && expected
      ? (run.result.rows.length === 0 && expected.rows.length === 0) || sameResult(run.result, expected, q.orderMatters)
      : null;

  return (
    <div className="space-y-3">
      <TablesPreview setup={q.setupSql} />
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
      <CodeEditor value={value} onChange={onChange} onEdit={onEdit} language="sql" minLines={5} label="Your query" />
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
  onEdit,
}: {
  q: StudentCodeQuestion;
  value: string;
  onChange: (v: string) => void;
  runOnServer?: RunCode;
  onEdit?: EditHandler;
}) {
  const [results, setResults] = useState<readonly CodeTestResult[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  // JavaScript runs right here; other languages go to the code runner when there is one.
  const inBrowser = runsInBrowser(q.language);
  const canRun = q.tests.length > 0 && (inBrowser || !!runOnServer);
  const passed = results?.filter((r) => r.passed).length ?? 0;

  // Python takes a few seconds to load the first time, so start as soon as the question is on screen.
  useEffect(() => {
    if (q.language === "python") preloadPython();
  }, [q.language]);

  async function run() {
    setRunning(true);
    setRunError(null);
    if (q.language === "python") {
      const reply = await runPythonTests(value, q.tests);
      if ("error" in reply) setRunError(reply.error);
      else setResults(reply);
    } else if (inBrowser) setResults(await runJsTests(value, q.tests));
    else {
      const reply = await runOnServer!(q.id, value);
      if ("error" in reply) setRunError(reply.error);
      else if (reply.ok === null) setRunError("Code runner not available");
      else setResults(reply.ok);
    }
    setRunning(false);
  }

  return (
    <div className="space-y-3">
      {q.database && (
        <>
          <TablesPreview setup={q.database} />
          <p className="text-xs text-muted">
            Your code can query these tables with Laravel: <code>DB::table(...)</code>, <code>DB::select(...)</code>{" "}
            or Eloquent models (<code>use Illuminate\Database\Eloquent\Model;</code>). Each test starts from this data.
          </p>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{languageLabel[q.language]}</Badge>
        {q.database && <Badge tone="info">Laravel database</Badge>}
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
            <Play className="size-3.5" aria-hidden />{" "}
            {running
              ? q.language === "python"
                ? "Running (Python loads the first time)…"
                : inBrowser
                  ? "Running…"
                  : "Compiling and running…"
              : "Run sample tests"}
          </Button>
        )}
      </div>
      <CodeEditor value={value} onChange={onChange} onEdit={onEdit} language={q.language} label="Your code" />
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
