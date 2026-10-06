"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, Check, Clock, RotateCcw, X } from "lucide-react";
import { promptParts, splitAlternatives } from "@/lib/blanks";
import { formatDateTime, questionTypeLabel } from "@/lib/format";
import { autoScore, maxScore } from "@/lib/scoring";
import type { AnswerValue, Assessment, Class, Question } from "@/lib/types";
import { parseNumber } from "@/lib/math";
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
  if (Array.isArray(v)) return v.some((x) => x.trim());
  return typeof v === "string" ? v.trim() !== "" : true;
}

// The exam as a student takes it online. A preview: answers stay in this component.
export function OnlineExam({ assessment: a, classes }: { assessment: Assessment; classes: Class[] }) {
  const [stage, setStage] = useState<"intro" | "taking" | "done">("intro");
  const [parts, setParts] = useState(() => studentOrder(a));
  const [answers, setAnswers] = useState<Answers>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const total = maxScore(a.questions);
  const answered = a.questions.filter((q) => isAnswered(q, answers[q.id])).length;
  const limit = a.settings.timeLimitMinutes;

  useEffect(() => {
    if (stage !== "taking" || limit === null) return;
    const started = Date.now();
    const timer = setInterval(() => {
      const left = Math.max(0, limit * 60 - Math.floor((Date.now() - started) / 1000));
      setSecondsLeft(left);
      if (left === 0) setStage("done");
    }, 1000);
    return () => clearInterval(timer);
  }, [stage, limit]);

  function start() {
    setParts(studentOrder(a));
    setAnswers({});
    setSecondsLeft(limit === null ? null : limit * 60);
    setStage("taking");
  }

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
          {a.kind === "exam" && a.settings.trackTabSwitches && (
            <p className="flex gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              Leaving this tab during the exam is recorded and reported to your teacher.
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
              Not counting {pending.length} {pending.length === 1 ? "essay" : "essays"} that you grade by hand.
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

      <div className="space-y-6">
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
                    <AnswerInput q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} />
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
        <Button onClick={() => setStage("done")}>Submit {a.kind}</Button>
      </div>
    </div>
  );
}

function answerKey(q: Question): string {
  switch (q.type) {
    case "multiple_choice":
      return q.choices.find((c) => c.id === q.correctChoiceId)?.text ?? "—";
    case "numeric":
      return `${q.answer}${q.tolerance ? ` ± ${q.tolerance}` : ""}${q.unit ? ` ${q.unit}` : ""}`;
    case "true_false":
      return q.answer ? "True" : "False";
    case "identification":
      return q.acceptedAnswers.join(" / ");
    case "fill_in_the_blank":
      return promptParts(q.prompt)
        .flatMap((p) => ("answers" in p ? [p.answers.join(" / ")] : []))
        .join("; ");
    case "enumeration":
      return q.items.map((x) => splitAlternatives(x).join(" / ")).join("; ") + (q.orderMatters ? " (in order)" : "");
    case "essay":
      return q.rubric || "Graded by hand";
  }
}

function AnswerInput({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
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
  }
}
