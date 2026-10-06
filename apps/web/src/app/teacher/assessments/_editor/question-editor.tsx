"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Check, Plus, Sigma, Trash2, X } from "lucide-react";
import { MathText } from "@/components/math-text";
import { Badge, Button, inputBase, inputClass } from "@/components/ui";
import { promptParts } from "@/lib/blanks";
import { hasMath, parseNumber } from "@/lib/math";
import { questionTypeLabel } from "@/lib/format";
import type { Question, QuestionType } from "@/lib/types";

const newId = () => crypto.randomUUID().slice(0, 8);

export function blankQuestion(type: QuestionType): Question {
  const base = { id: newId(), prompt: "", points: type === "essay" ? 10 : 1 };
  switch (type) {
    case "multiple_choice":
      return {
        ...base,
        type,
        choices: [
          { id: "a", text: "" },
          { id: "b", text: "" },
          { id: "c", text: "" },
          { id: "d", text: "" },
        ],
        correctChoiceId: "a",
      };
    case "true_false":
      return { ...base, type, answer: true };
    case "identification":
      return { ...base, type, acceptedAnswers: [""], caseSensitive: false };
    case "fill_in_the_blank":
      return { ...base, type, caseSensitive: false };
    case "enumeration":
      return { ...base, type, points: 3, items: ["", "", ""], orderMatters: false, caseSensitive: false };
    case "numeric":
      return { ...base, type, answer: 0, tolerance: 0, unit: "" };
    case "essay":
      return { ...base, type, rubric: "" };
  }
}

// Each button inserts LaTeX at the cursor; "#" marks where the cursor ends up.
const mathButtons: { label: string; tex: string; title: string }[] = [
  { label: "a⁄b", tex: "\\frac{#}{}", title: "Fraction" },
  { label: "x²", tex: "^{#}", title: "Power" },
  { label: "xₙ", tex: "_{#}", title: "Subscript" },
  { label: "√", tex: "\\sqrt{#}", title: "Square root" },
  { label: "ⁿ√", tex: "\\sqrt[#]{}", title: "nth root" },
  { label: "π", tex: "\\pi #", title: "Pi" },
  { label: "×", tex: "\\times #", title: "Times" },
  { label: "÷", tex: "\\div #", title: "Divide" },
  { label: "±", tex: "\\pm #", title: "Plus or minus" },
  { label: "≤", tex: "\\le #", title: "Less than or equal" },
  { label: "≥", tex: "\\ge #", title: "Greater than or equal" },
  { label: "≠", tex: "\\ne #", title: "Not equal" },
  { label: "≈", tex: "\\approx #", title: "Approximately" },
  { label: "°", tex: "^{\\circ}#", title: "Degrees" },
  { label: "θ", tex: "\\theta #", title: "Theta" },
  { label: "∞", tex: "\\infty #", title: "Infinity" },
  { label: "Σ", tex: "\\sum_{#}^{}", title: "Sum" },
  { label: "∫", tex: "\\int_{#}^{}", title: "Integral" },
  { label: "|x|", tex: "\\left| # \\right|", title: "Absolute value" },
];

// Puts text into a controlled input the way typing would, so React's onChange runs.
function insertInto(field: HTMLInputElement | HTMLTextAreaElement, snippet: string) {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  const before = field.value.slice(0, start);
  // Inside $…$ already? Then insert bare LaTeX; otherwise wrap it in $…$.
  const insideMath = (before.replace(/\\\$/g, "").match(/\$/g)?.length ?? 0) % 2 === 1;
  const text = insideMath ? snippet : `$${snippet}$`;
  const cursor = start + text.indexOf("#");
  const next = before + text.replace("#", "") + field.value.slice(end);
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, next);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus();
  field.setSelectionRange(cursor, cursor);
}

function MathToolbar({ target }: { target: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null> }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Insert math">
      {mathButtons.map((b) => (
        <button
          key={b.title}
          type="button"
          title={`${b.title} (inserts ${b.tex.replace("#", "")})`}
          aria-label={`Insert ${b.title.toLowerCase()}`}
          // Keep focus in the text field being edited.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => target.current && insertInto(target.current, b.tex)}
          className="min-w-8 rounded-md border border-border bg-surface px-1.5 py-1 font-serif text-sm hover:bg-surface-muted"
        >
          {b.label}
        </button>
      ))}
      <span className="ml-1 text-xs text-muted">
        Or type LaTeX between <code>$…$</code>.
      </span>
    </div>
  );
}

function MathPreview({ q }: { q: Question }) {
  const texts = [q.prompt, ...(q.type === "multiple_choice" ? q.choices.map((c) => c.text) : [])];
  if (!texts.some(hasMath)) return null;
  return (
    <div className="rounded-lg bg-surface-muted p-3 text-sm">
      <p className="mb-1 text-xs font-medium text-muted">Students see:</p>
      <p>
        <MathText text={q.type === "fill_in_the_blank" ? q.prompt.replace(/\[[^\]]*\]/g, "_____") : q.prompt} />
      </p>
      {q.type === "multiple_choice" && (
        <ol className="mt-1 space-y-0.5">
          {q.choices.map((c, i) => (
            <li key={c.id}>
              {String.fromCharCode(65 + i)}. <MathText text={c.text} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const promptPlaceholder: Partial<Record<QuestionType, string>> = {
  fill_in_the_blank: "e.g. A [primary key|PK] uniquely identifies each [row|record] in a table.",
  enumeration: "e.g. Give the three anomalies that normalization prevents.",
};

export function QuestionEditor({
  question,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  question: Question;
  index: number;
  total: number;
  onChange: (q: Question) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  // The text field last focused in this question, for the math toolbar to insert into.
  const lastField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [mathOpen, setMathOpen] = useState(() => hasMath(question.prompt));
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="grid size-7 place-items-center rounded-md bg-surface-muted text-sm font-semibold tabular-nums">
          {index + 1}
        </span>
        <Badge tone="primary">{questionTypeLabel[question.type]}</Badge>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-muted">
          Points
          <input
            type="number"
            min={0}
            step={0.5}
            value={question.points}
            onChange={(e) => onChange({ ...question, points: Number(e.target.value) })}
            className={clsx(inputBase, "w-20 py-1")}
          />
        </label>
        <Button variant="ghost" className="px-2" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          className="px-2"
          aria-label="Move down"
          disabled={index === total - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown className="size-4" />
        </Button>
        <Button variant="danger" className="px-2" aria-label="Delete question" onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div
        className="space-y-4 p-4"
        onFocus={(e) => {
          const el = e.target;
          if ((el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === "text")) && !el.readOnly)
            lastField.current = el;
        }}
      >
        <div className="flex justify-end">
          <Button
            variant="ghost"
            className="-my-1 px-2 py-1 text-xs"
            aria-expanded={mathOpen}
            onClick={() => setMathOpen((o) => !o)}
          >
            <Sigma className="size-3.5" aria-hidden /> Math
          </Button>
        </div>
        {mathOpen && <MathToolbar target={lastField} />}
        <textarea
          value={question.prompt}
          onChange={(e) => onChange({ ...question, prompt: e.target.value })}
          placeholder={promptPlaceholder[question.type] ?? "Type the question…"}
          rows={2}
          className={inputClass}
          aria-label={`Question ${index + 1}`}
        />
        <AnswerEditor question={question} onChange={onChange} />
        <MathPreview q={question} />
      </div>
    </div>
  );
}

function AnswerEditor({
  question: q,
  onChange,
}: {
  question: Question;
  onChange: (q: Question) => void;
}) {
  switch (q.type) {
    case "multiple_choice":
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted">Click the circle to mark the correct answer.</p>
          {q.choices.map((choice, i) => {
            const correct = q.correctChoiceId === choice.id;
            return (
              <div key={choice.id} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Mark choice ${i + 1} correct`}
                  aria-pressed={correct}
                  onClick={() => onChange({ ...q, correctChoiceId: choice.id })}
                  className={clsx(
                    "grid size-6 shrink-0 place-items-center rounded-full border-2",
                    correct ? "border-success bg-success text-white" : "border-border hover:border-success",
                  )}
                >
                  {correct && <Check className="size-3.5" strokeWidth={3} />}
                </button>
                <input
                  value={choice.text}
                  onChange={(e) =>
                    onChange({
                      ...q,
                      choices: q.choices.map((c) => (c.id === choice.id ? { ...c, text: e.target.value } : c)),
                    })
                  }
                  placeholder={`Choice ${String.fromCharCode(65 + i)}`}
                  className={inputClass}
                />
                <Button
                  variant="ghost"
                  className="px-2"
                  aria-label="Remove choice"
                  disabled={q.choices.length <= 2}
                  onClick={() => {
                    const choices = q.choices.filter((c) => c.id !== choice.id);
                    onChange({
                      ...q,
                      choices,
                      correctChoiceId: correct ? choices[0].id : q.correctChoiceId,
                    });
                  }}
                >
                  <X className="size-4" />
                </Button>
              </div>
            );
          })}
          {q.choices.length < 6 && (
            <Button
              variant="ghost"
              className="text-primary"
              onClick={() => onChange({ ...q, choices: [...q.choices, { id: newId(), text: "" }] })}
            >
              <Plus className="size-4" /> Add choice
            </Button>
          )}
        </div>
      );

    case "true_false":
      return (
        <div className="flex gap-2">
          {[true, false].map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={q.answer === value}
              onClick={() => onChange({ ...q, answer: value })}
              className={clsx(
                "rounded-lg border px-4 py-2 text-sm font-medium",
                q.answer === value
                  ? "border-success bg-success-soft text-success"
                  : "border-border hover:bg-surface-muted",
              )}
            >
              {value ? "True" : "False"}
            </button>
          ))}
        </div>
      );

    case "identification":
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted">Any of these answers is marked correct.</p>
          {q.acceptedAnswers.map((answer, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={answer}
                onChange={(e) =>
                  onChange({
                    ...q,
                    acceptedAnswers: q.acceptedAnswers.map((a, j) => (j === i ? e.target.value : a)),
                  })
                }
                placeholder="Accepted answer"
                className={inputClass}
              />
              <Button
                variant="ghost"
                className="px-2"
                aria-label="Remove answer"
                disabled={q.acceptedAnswers.length <= 1}
                onClick={() => onChange({ ...q, acceptedAnswers: q.acceptedAnswers.filter((_, j) => j !== i) })}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant="ghost"
              className="text-primary"
              onClick={() => onChange({ ...q, acceptedAnswers: [...q.acceptedAnswers, ""] })}
            >
              <Plus className="size-4" /> Add accepted answer
            </Button>
            <CaseToggle checked={q.caseSensitive} onChange={(caseSensitive) => onChange({ ...q, caseSensitive })} />
          </div>
        </div>
      );

    case "fill_in_the_blank": {
      const parts = promptParts(q.prompt);
      const blanks = parts.filter((p) => "answers" in p).length;
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Put each answer in square brackets inside the question, e.g. <code>[answer]</code>. Separate other
            accepted answers with <code>|</code>, e.g. <code>[primary key|PK]</code>. Each blank is worth an equal
            share of the points.
          </p>
          {blanks > 0 ? (
            <div className="rounded-lg bg-surface-muted p-3 text-sm leading-8">
              <p className="mb-1 text-xs font-medium text-muted">
                Students see ({blanks} {blanks === 1 ? "blank" : "blanks"}):
              </p>
              {parts.map((p, i) =>
                "text" in p ? (
                  <span key={i}>{p.text}</span>
                ) : (
                  <span
                    key={i}
                    className="mx-0.5 inline-block min-w-20 border-b-2 border-success px-1 text-center font-medium text-success"
                    title="Accepted answers"
                  >
                    {p.answers.join(" / ") || "?"}
                  </span>
                ),
              )}
            </div>
          ) : (
            <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
              No blanks yet. Wrap an answer in [square brackets] to make a blank.
            </p>
          )}
          <CaseToggle checked={q.caseSensitive} onChange={(caseSensitive) => onChange({ ...q, caseSensitive })} />
        </div>
      );
    }

    case "enumeration":
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            Students give {q.items.length} {q.items.length === 1 ? "answer" : "answers"}. Each correct item is worth
            an equal share of the points. Separate other accepted wordings with <code>|</code>, e.g.{" "}
            <code>1NF|First Normal Form</code>.
          </p>
          {q.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-right text-sm text-muted tabular-nums">{i + 1}.</span>
              <input
                value={item}
                onChange={(e) => onChange({ ...q, items: q.items.map((x, j) => (j === i ? e.target.value : x)) })}
                placeholder="Expected item"
                className={inputClass}
              />
              <Button
                variant="ghost"
                className="px-2"
                aria-label="Remove item"
                disabled={q.items.length <= 1}
                onClick={() => onChange({ ...q, items: q.items.filter((_, j) => j !== i) })}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="ghost" className="text-primary" onClick={() => onChange({ ...q, items: [...q.items, ""] })}>
              <Plus className="size-4" /> Add item
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={q.orderMatters}
                onChange={(e) => onChange({ ...q, orderMatters: e.target.checked })}
                className="size-4 accent-primary"
              />
              Order matters
            </label>
            <CaseToggle checked={q.caseSensitive} onChange={(caseSensitive) => onChange({ ...q, caseSensitive })} />
          </div>
        </div>
      );

    case "numeric":
      return <NumericEditor q={q} onChange={onChange} />;

    case "essay":
      return (
        <div>
          <p className="mb-1.5 text-xs text-muted">
            Essays are graded by hand. The rubric is shown to you while grading, not to students.
          </p>
          <textarea
            value={q.rubric}
            onChange={(e) => onChange({ ...q, rubric: e.target.value })}
            placeholder="Rubric / what a full-credit answer includes"
            rows={3}
            className={inputClass}
          />
        </div>
      );
  }
}

function CaseToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary"
      />
      Case-sensitive
    </label>
  );
}

// Hides floating-point noise like 50.230000000000004.
const tidy = (n: number) => Number(n.toPrecision(12));

function NumericEditor({
  q,
  onChange,
}: {
  q: Extract<Question, { type: "numeric" }>;
  onChange: (q: Question) => void;
}) {
  // Kept as typed so "3/" or "-" mid-typing isn't thrown away.
  const [answerText, setAnswerText] = useState(String(q.answer));
  const parsed = parseNumber(answerText);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Students type a number. Decimals, fractions (3/4) and mixed numbers (1 1/2) are all read as numbers, so
        0.75 and 3/4 both match.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Correct answer</span>
          <input
            value={answerText}
            onChange={(e) => {
              setAnswerText(e.target.value);
              const n = parseNumber(e.target.value);
              if (n !== null) onChange({ ...q, answer: n });
            }}
            inputMode="decimal"
            aria-invalid={parsed === null}
            className={clsx(inputClass, parsed === null && "border-danger")}
          />
          {parsed === null && <span className="mt-1 block text-xs text-danger">Not a number.</span>}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Allowed error (±)</span>
          <input
            type="number"
            min={0}
            step="any"
            value={q.tolerance}
            onChange={(e) => onChange({ ...q, tolerance: Math.max(0, Number(e.target.value)) })}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Unit (optional)</span>
          <input
            value={q.unit}
            onChange={(e) => onChange({ ...q, unit: e.target.value })}
            placeholder="e.g. cm"
            className={inputClass}
          />
        </label>
      </div>
      <p className="text-xs text-muted">
        Accepts {q.tolerance > 0 ? `${tidy(q.answer - q.tolerance)} to ${tidy(q.answer + q.tolerance)}` : `exactly ${q.answer}`}
        {q.unit && ` ${q.unit}`}.
      </p>
    </div>
  );
}
