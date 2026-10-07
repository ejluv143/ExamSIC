"use client";

import { useContext, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Check, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { CodeEditor } from "@/components/code-editor";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Badge, Button, inputBase, inputClass } from "@/components/ui";
import { laravelStarter, languageLabel, starterTemplates } from "@/lib/code";
import { blankModeLabel, clozeInputLabel, questionTypeLabel } from "@/lib/format";
import { parseNumber } from "@/lib/math";
import { sqlTemplate } from "@/lib/question-defaults";
import { blankAnswers, rubricTotal, unitCount, unitPoints, clozeInputs } from "@examora/contract";
import type {
  BlankMode,
  BlankQuestion,
  ClozeInput,
  CodeLanguage,
  CodeQuestion,
  EnumerationQuestion,
  MatchingQuestion,
  MultipleChoiceQuestion,
  Question,
  RubricRow,
  DrawingQuestion,
} from "@examora/contract";
import { ImageField, EditorAssetUrls, withImage, type PickedImage } from "./image-field";
import { Segmented } from "./segmented";
import { SqlQuestionEditor, SqlTablesField } from "./sql-question-editor";

const newId = () => crypto.randomUUID().slice(0, 8);

// The points a part is worth: whole or half points.
const validPoints = (n: number) => Number.isFinite(n) && n >= 0 && Number.isInteger(n * 2);

// Weights follow the units (blanks, pairs, items, tests): when the editor adds or removes one, so do they.
type Weighted = Extract<Question, { type: "blank" | "matching" | "enumeration" | "code" }>;
const weightsAdd = (q: Weighted) => (q.weights?.length ? { weights: [...q.weights, 1] } : {});
const weightsRemove = (q: Weighted, i: number) =>
  q.weights?.length ? { weights: q.weights.filter((_, j) => j !== i) } : {};

export function QuestionEditor({
  question,
  number,
  first,
  last,
  onChange,
  onMove,
  onRemove,
  headerExtra,
  poolLocked,
}: {
  question: Question;
  number: number;
  first: boolean;
  last: boolean;
  onChange: (q: Question) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  // Shown in the card header, e.g. "Move to part".
  headerExtra?: ReactNode;
  // The question is in a pool part: its points are set by the part and can't be edited here.
  poolLocked?: boolean;
}) {
  const q = question;
  const assetUrls = useContext(EditorAssetUrls);
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <span className="grid size-7 place-items-center rounded-md bg-surface-muted text-sm font-semibold tabular-nums">
          {number}
        </span>
        <Badge tone="primary">{questionTypeLabel[q.type]}</Badge>
        {q.type === "blank" && <Badge>{blankModeLabel[q.mode]}</Badge>}
        {headerExtra}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <label className="mr-1 flex items-center gap-1.5 text-sm text-muted">
            Points
            <PointsInput
              value={q.points}
              readOnly={poolLocked}
              onChange={(points) => onChange({ ...q, points })}
              label={`Points for question ${number}`}
            />
          </label>
          <Button variant="ghost" className="px-2" aria-label="Move up" disabled={first} onClick={() => onMove(-1)}>
            <ArrowUp className="size-4" />
          </Button>
          <Button variant="ghost" className="px-2" aria-label="Move down" disabled={last} onClick={() => onMove(1)}>
            <ArrowDown className="size-4" />
          </Button>
          <Button variant="danger" className="px-2" aria-label="Delete question" onClick={onRemove}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-3 sm:p-4">
        <MarkdownEditor
          value={q.prompt}
          onChange={(prompt) => onChange({ ...q, prompt })}
          label={`Question ${number} text`}
          rows={3}
          blanks={q.type === "blank" && q.mode !== "identification"}
          placeholder={promptPlaceholder(q)}
          assetUrls={assetUrls}
          images
        />
        <AnswerEditor question={q} onChange={onChange} />
        <ScoringSection question={q} onChange={onChange} poolLocked={poolLocked} />
        <details className="rounded-lg border border-border" open={!!q.explanation}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Explanation</summary>
          <div className="border-t border-border p-3">
            <MarkdownEditor
              value={q.explanation ?? ""}
              onChange={(explanation) => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { explanation: _previous, ...without } = q;
                onChange((explanation === "" ? without : { ...without, explanation }) as Question);
              }}
              label={`Question ${number} explanation`}
              rows={3}
              placeholder="Why the answer is right. Mastery students read it after each answer, and it is shown with the results."
              assetUrls={assetUrls}
              images
            />
          </div>
        </details>
      </div>
    </div>
  );
}

function promptPlaceholder(q: Question): string {
  if (q.type === "blank") {
    if (q.mode === "identification") return "e.g. What do we call a column that uniquely identifies each row?";
    return "e.g. A {{primary key|PK}} uniquely identifies each {{row|record}} in a table.";
  }
  if (q.type === "enumeration") return "e.g. Give the three anomalies that normalization prevents.";
  if (q.type === "matching") return "e.g. Match each term to its definition.";
  return "Type the question…";
}

// Whole or half points. Keeps what was typed until it is valid, so "1." or an empty box isn't thrown away.
function PointsInput({
  value,
  onChange,
  readOnly,
  label,
  className = "w-20",
}: {
  value: number;
  onChange: (points: number) => void;
  readOnly?: boolean;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);
  const invalid = draft !== null && !validPoints(draft.trim() === "" ? NaN : Number(draft));
  return (
    <span className="inline-flex flex-col">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.5}
        value={text}
        readOnly={readOnly}
        aria-label={label}
        aria-invalid={invalid}
        title={readOnly ? "Set by the pool" : "Whole or half points"}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = e.target.value.trim() === "" ? NaN : Number(e.target.value);
          if (validPoints(n)) onChange(n);
        }}
        onBlur={() => setDraft(null)}
        className={clsx(inputBase, className, "py-1", invalid && "border-danger", readOnly && "bg-surface-muted")}
      />
      {invalid && <span className="text-xs text-danger">Whole or half points only.</span>}
    </span>
  );
}

function Check2({
  checked,
  onChange,
  children,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span>
        {children}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function CaseToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <Check2 checked={checked} onChange={onChange}>Case-sensitive</Check2>;
}

// A short markdown text: one line to type, and a preview below it when it uses markdown or math.
function InlineField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={inputClass}
      />
      {/[*_`$\\[<~|]/.test(value) && (
        <p className="mt-1 px-1 text-sm text-muted">
          <Markdown inline>{value}</Markdown>
        </p>
      )}
    </div>
  );
}

// A list of short texts (accepted answers, wrong options, extra words) with add and remove buttons.
function StringList({
  values,
  onChange,
  placeholder,
  addLabel,
  label,
  min = 0,
}: {
  values: readonly string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  addLabel: string;
  label: string;
  min?: number;
}) {
  return (
    <div className="space-y-2">
      {values.map((value, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
            placeholder={placeholder}
            aria-label={`${label} ${i + 1}`}
            className={inputClass}
          />
          <Button
            variant="ghost"
            className="px-2"
            aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
            disabled={values.length <= min}
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" className="text-primary" onClick={() => onChange([...values, ""])}>
        <Plus className="size-4" /> {addLabel}
      </Button>
    </div>
  );
}

function AnswerEditor({ question: q, onChange }: { question: Question; onChange: (q: Question) => void }) {
  switch (q.type) {
    case "multiple_choice":
      return <ChoicesEditor q={q} onChange={onChange} />;

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

    case "blank":
      return <BlankEditor q={q} onChange={onChange} />;

    case "matching":
      return <MatchingEditor q={q} onChange={onChange} />;

    case "enumeration":
      return <EnumerationEditor q={q} onChange={onChange} />;

    case "numeric":
      return <NumericEditor q={q} onChange={onChange} />;

    case "code":
      return <CodeQuestionEditor q={q} onChange={onChange} />;

    case "sql":
      return <SqlQuestionEditor q={q} onChange={onChange} />;

    case "essay":
      return <RubricEditor q={q} onChange={onChange} />;

    case "drawing":
      return <DrawingEditor q={q} onChange={onChange} />;
  }
}

function ChoicesEditor({ q, onChange }: { q: MultipleChoiceQuestion; onChange: (q: Question) => void }) {
  const multi = q.multipleCorrect;
  // With pictures the choices sit in a grid, as they do on the paper.
  const hasImages = q.choices.some((c) => c.imageId !== undefined);
  return (
    <div className="space-y-2">
      <Check2
        checked={multi}
        onChange={(multipleCorrect) =>
          onChange({
            ...q,
            multipleCorrect,
            correctChoiceIds: multipleCorrect ? q.correctChoiceIds : q.correctChoiceIds.slice(0, 1),
          })
        }
        hint="Students tick every correct choice."
      >
        More than one correct answer
      </Check2>
      <p className="text-xs text-muted">
        {multi ? "Tap the boxes to mark every correct choice." : "Tap the circle to mark the correct choice."}
      </p>
      <div className={clsx(hasImages ? "grid gap-2 sm:grid-cols-2" : "space-y-2")}>
      {q.choices.map((choice, i) => {
        const correct = q.correctChoiceIds.includes(choice.id);
        return (
          <div key={choice.id} className="flex items-start gap-2">
            <button
              type="button"
              aria-label={`Mark choice ${i + 1} correct`}
              aria-pressed={correct}
              onClick={() =>
                onChange({
                  ...q,
                  correctChoiceIds: multi
                    ? correct
                      ? q.correctChoiceIds.filter((id) => id !== choice.id)
                      : [...q.correctChoiceIds, choice.id]
                    : [choice.id],
                })
              }
              className={clsx(
                "mt-1.5 grid size-6 shrink-0 place-items-center border-2",
                multi ? "rounded-md" : "rounded-full",
                correct ? "border-success bg-success text-white" : "border-border hover:border-success",
              )}
            >
              {correct && <Check className="size-3.5" strokeWidth={3} />}
            </button>
            <div className="min-w-0 flex-1 space-y-1.5">
              <InlineField
                value={choice.text}
                onChange={(text) => onChange({ ...q, choices: q.choices.map((c) => (c.id === choice.id ? { ...c, text } : c)) })}
                placeholder={`Choice ${String.fromCharCode(65 + i)}`}
                label={`Choice ${String.fromCharCode(65 + i)}`}
              />
              <ImageField
                imageId={choice.imageId}
                alt={choice.alt}
                label={`choice ${String.fromCharCode(65 + i)}`}
                onChange={(picked) => onChange({ ...q, choices: q.choices.map((c) => (c.id === choice.id ? withImage(c, picked) : c)) })}
              />
            </div>
            <Button
              variant="ghost"
              className="px-2"
              aria-label={`Remove choice ${i + 1}`}
              disabled={q.choices.length <= 2}
              onClick={() => {
                const choices = q.choices.filter((c) => c.id !== choice.id);
                const remaining = q.correctChoiceIds.filter((id) => id !== choice.id);
                onChange({
                  ...q,
                  choices,
                  correctChoiceIds: remaining.length === 0 && !multi ? [choices[0]!.id] : remaining,
                });
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        );
      })}
      </div>
      {q.choices.length < 8 && (
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
}

function BlankEditor({ q, onChange }: { q: BlankQuestion; onChange: (q: Question) => void }) {
  // Weights belong to a blank count, so a new mode starts with equal shares.
  const setMode = (mode: BlankMode) => {
    const rest = { ...q };
    delete rest.weights;
    onChange({
      ...rest,
      mode,
      acceptedAnswers: mode === "identification" && q.acceptedAnswers.length === 0 ? [""] : q.acceptedAnswers,
    });
  };
  const blanks = q.mode === "identification" ? [] : blankAnswers(q.prompt);
  const setWrong = (i: number, list: string[]) =>
    onChange({
      ...q,
      wrongOptions: Array.from({ length: Math.max(blanks.length, q.wrongOptions.length) }, (_, j) =>
        j === i ? list : (q.wrongOptions[j] ?? []),
      ),
    });
  const bankWords = [...new Set(blanks.map((a) => a[0]).filter((w): w is string => !!w))];

  return (
    <div className="space-y-3">
      <Segmented
        label="Blank type"
        value={q.mode}
        options={(Object.keys(blankModeLabel) as BlankMode[]).map((m) => [m, blankModeLabel[m]])}
        onChange={setMode}
      />

      {q.mode === "identification" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">Students type one answer. Any of these answers is marked correct.</p>
          <StringList
            values={q.acceptedAnswers}
            onChange={(acceptedAnswers) => onChange({ ...q, acceptedAnswers })}
            placeholder="Accepted answer"
            addLabel="Add accepted answer"
            label="Accepted answer"
            min={1}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Use <b>Insert blank</b> in the toolbar, or write <code>{"{{answer}}"}</code> in the question. Separate other
            accepted answers with <code>|</code>, e.g. <code>{"{{primary key|PK}}"}</code>.
          </p>
          {blanks.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
              <TriangleAlert className="size-4 shrink-0" aria-hidden /> No blanks yet.
            </p>
          ) : (
            <ol className="space-y-1 rounded-lg bg-surface-muted p-3 text-sm" aria-label="Blanks">
              {blanks.map((answers, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-14 shrink-0 text-muted">Blank {i + 1}</span>
                  <span className={clsx("min-w-0 break-words font-medium", answers.length === 0 && "text-danger")}>
                    {answers.join(" / ") || "(empty)"}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {q.mode === "cloze" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">Students</span>
                <Segmented
                  label="How students fill the blanks"
                  value={q.clozeInput}
                  options={clozeInputs.map((c): [ClozeInput, string] => [c, clozeInputLabel[c]])}
                  onChange={(clozeInput) => onChange({ ...q, clozeInput })}
                />
              </div>
              {q.clozeInput === "dropdown" &&
                blanks.map((answers, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <p className="mb-2 text-sm font-medium">
                      Blank {i + 1}: wrong options{" "}
                      <span className="font-normal text-muted">(the right answer is {answers[0] || "?"})</span>
                    </p>
                    <StringList
                      values={q.wrongOptions[i] ?? []}
                      onChange={(list) => setWrong(i, list)}
                      placeholder="Wrong option"
                      addLabel="Add wrong option"
                      label={`Blank ${i + 1} wrong option`}
                    />
                  </div>
                ))}
              {q.clozeInput === "bank" && (
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-1 text-sm font-medium">Word bank</p>
                  <p className="mb-2 text-xs text-muted">
                    Students pick from one shared list: the answer of every blank plus the extra words below.
                  </p>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {bankWords.map((w) => (
                      <Badge key={w} tone="primary">
                        {w}
                      </Badge>
                    ))}
                    {q.extraWords.filter((w) => w.trim()).map((w, i) => (
                      <Badge key={`extra-${i}`}>{w} (extra)</Badge>
                    ))}
                  </div>
                  <StringList
                    values={q.extraWords}
                    onChange={(extraWords) => onChange({ ...q, extraWords })}
                    placeholder="Extra word"
                    addLabel="Add extra word"
                    label="Extra word"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <CaseToggle checked={q.caseSensitive} onChange={(caseSensitive) => onChange({ ...q, caseSensitive })} />
    </div>
  );
}

function MatchingEditor({ q, onChange }: { q: MatchingQuestion; onChange: (q: Question) => void }) {
  const used = new Set(q.left.map((l) => l.rightId));
  const rightLabel = (i: number) => q.right[i]!.text.trim() || (q.right[i]!.imageId ? `Item ${i + 1} (image)` : `Item ${i + 1}`);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Each item on the left goes with one item on the right. Right items that no left item uses are extra wrong
        options.
      </p>
      <div className="space-y-2">
        <p className="text-sm font-medium">Left items</p>
        {q.left.map((l, i) => (
          <div key={l.id} className="space-y-2 rounded-lg border border-border p-2 sm:flex sm:items-start sm:gap-2 sm:space-y-0">
            <div className="min-w-0 flex-1 space-y-1.5">
              <InlineField
                value={l.text}
                onChange={(text) => onChange({ ...q, left: q.left.map((x) => (x.id === l.id ? { ...x, text } : x)) })}
                placeholder={`Left item ${i + 1}`}
                label={`Left item ${i + 1}`}
              />
              <ImageField
                imageId={l.imageId}
                alt={l.alt}
                label={`left item ${i + 1}`}
                onChange={(picked) => onChange({ ...q, left: q.left.map((x) => (x.id === l.id ? withImage(x, picked) : x)) })}
              />
            </div>
            <div className="flex items-center gap-2 sm:w-64 sm:shrink-0">
              <select
                value={l.rightId}
                aria-label={`Match for left item ${i + 1}`}
                onChange={(e) =>
                  onChange({ ...q, left: q.left.map((x) => (x.id === l.id ? { ...x, rightId: e.target.value } : x)) })
                }
                className={clsx(inputClass, !q.right.some((r) => r.id === l.rightId) && "border-danger")}
              >
                <option value="">Choose the match…</option>
                {q.right.map((r, j) => (
                  <option key={r.id} value={r.id}>
                    {rightLabel(j)}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                className="px-2"
                aria-label={`Remove left item ${i + 1}`}
                disabled={q.left.length <= 1}
                onClick={() => onChange({ ...q, left: q.left.filter((x) => x.id !== l.id), ...weightsRemove(q, i) })}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Right items</p>
        {q.right.map((r, i) => (
          <div key={r.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <InlineField
                value={r.text}
                onChange={(text) => onChange({ ...q, right: q.right.map((x) => (x.id === r.id ? { ...x, text } : x)) })}
                placeholder={`Right item ${i + 1}`}
                label={`Right item ${i + 1}`}
              />
              <ImageField
                imageId={r.imageId}
                alt={r.alt}
                label={`right item ${i + 1}`}
                onChange={(picked) => onChange({ ...q, right: q.right.map((x) => (x.id === r.id ? withImage(x, picked) : x)) })}
              />
            </div>
            {!used.has(r.id) && (
              <span className="mt-2">
                <Badge tone="warning">extra</Badge>
              </span>
            )}
            <Button
              variant="ghost"
              className="px-2"
              aria-label={`Remove right item ${i + 1}`}
              disabled={q.right.length <= 1}
              onClick={() =>
                onChange({
                  ...q,
                  right: q.right.filter((x) => x.id !== r.id),
                  left: q.left.map((l) => (l.rightId === r.id ? { ...l, rightId: "" } : l)),
                })
              }
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4">
        <Button
          variant="ghost"
          className="text-primary"
          onClick={() => {
            const rightId = newId();
            onChange({
              ...q,
              left: [...q.left, { id: newId(), text: "", rightId }],
              right: [...q.right, { id: rightId, text: "" }],
              ...weightsAdd(q),
            });
          }}
        >
          <Plus className="size-4" /> Add pair
        </Button>
        <Button
          variant="ghost"
          className="text-primary"
          onClick={() => onChange({ ...q, right: [...q.right, { id: newId(), text: "" }] })}
        >
          <Plus className="size-4" /> Add extra right item
        </Button>
      </div>
    </div>
  );
}

function EnumerationEditor({ q, onChange }: { q: EnumerationQuestion; onChange: (q: Question) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Students give {q.items.length} {q.items.length === 1 ? "answer" : "answers"}. Separate other accepted wordings
        with <code>|</code>, e.g. <code>1NF|First Normal Form</code>.
      </p>
      {q.items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 shrink-0 text-right text-sm text-muted tabular-nums">{i + 1}.</span>
          <input
            value={item}
            onChange={(e) => onChange({ ...q, items: q.items.map((x, j) => (j === i ? e.target.value : x)) })}
            placeholder="Expected item"
            aria-label={`Expected item ${i + 1}`}
            className={inputClass}
          />
          <Button
            variant="ghost"
            className="px-2"
            aria-label={`Remove item ${i + 1}`}
            disabled={q.items.length <= 1}
            onClick={() => onChange({ ...q, items: q.items.filter((_, j) => j !== i), ...weightsRemove(q, i) })}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Button
          variant="ghost"
          className="text-primary"
          onClick={() => onChange({ ...q, items: [...q.items, ""], ...weightsAdd(q) })}
        >
          <Plus className="size-4" /> Add item
        </Button>
        <Check2 checked={q.orderMatters} onChange={(orderMatters) => onChange({ ...q, orderMatters })}>
          Order matters
        </Check2>
        <CaseToggle checked={q.caseSensitive} onChange={(caseSensitive) => onChange({ ...q, caseSensitive })} />
      </div>
    </div>
  );
}

// Essay and drawing rubric: rows with points that add up to the question's points. No rows: graded as a whole.
function RubricEditor({ q, onChange }: { q: Extract<Question, { type: "essay" | "drawing" }>; onChange: (q: Question) => void }) {
  const total = rubricTotal(q.rubric);
  const setRows = (rubric: RubricRow[]) => onChange({ ...q, rubric });
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        {q.type === "drawing" ? "Drawings" : "Essays"} are graded by hand. Rubric rows are shown to you while grading, not to students, and their points add up
        to the question&apos;s points. Leave them out to give one score.
      </p>
      {q.rubric.map((row, i) => (
        <div key={row.id} className="flex items-start gap-2">
          <input
            value={row.criterion}
            onChange={(e) => setRows(q.rubric.map((r) => (r.id === row.id ? { ...r, criterion: e.target.value } : r)))}
            placeholder="Criterion, e.g. Clear thesis"
            aria-label={`Rubric criterion ${i + 1}`}
            className={inputClass}
          />
          <PointsInput
            value={row.points}
            label={`Points for rubric row ${i + 1}`}
            className="w-20"
            onChange={(points) => setRows(q.rubric.map((r) => (r.id === row.id ? { ...r, points } : r)))}
          />
          <Button
            variant="ghost"
            className="px-2"
            aria-label={`Remove rubric row ${i + 1}`}
            onClick={() => setRows(q.rubric.filter((r) => r.id !== row.id))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-4">
        <Button
          variant="ghost"
          className="text-primary"
          onClick={() =>
            setRows([...q.rubric, { id: newId(), criterion: "", points: Math.max(0, q.points - total) }])
          }
        >
          <Plus className="size-4" /> Add rubric row
        </Button>
        {q.rubric.length > 0 && (
          <span className={clsx("text-sm tabular-nums", total === q.points ? "text-muted" : "text-warning")}>
            Rubric total {total} of {q.points} {q.points === 1 ? "point" : "points"}
          </span>
        )}
      </div>
      {q.rubric.length > 0 && total !== q.points && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <span>The rows must add up to the question&apos;s points.</span>
          <Button variant="secondary" className="py-1" onClick={() => setRows(matchRubric(q.rubric, q.points))}>
            Match question points
          </Button>
        </div>
      )}
    </div>
  );
}

const canvasPresets = [
  [800, 600],
  [1000, 700],
  [600, 600],
] as const;
const canvasMin = 200;
const canvasMax = 2000;

// A canvas side in pixels. Keeps what was typed until it is a whole number from 200 to 2000.
function SizeInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const n = draft === null || draft.trim() === "" ? NaN : Number(draft);
  const invalid = draft !== null && !(Number.isInteger(n) && n >= canvasMin && n <= canvasMax);
  return (
    <span className="inline-flex flex-col">
      <input
        type="number"
        inputMode="numeric"
        min={canvasMin}
        max={canvasMax}
        step={1}
        value={draft ?? String(value)}
        aria-label={label}
        aria-invalid={invalid}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = e.target.value.trim() === "" ? NaN : Number(e.target.value);
          if (Number.isInteger(next) && next >= canvasMin && next <= canvasMax) onChange(next);
        }}
        onBlur={() => setDraft(null)}
        className={clsx(inputBase, "w-24 py-1", invalid && "border-danger")}
      />
      {invalid && <span className="text-xs text-danger">{canvasMin} to {canvasMax}.</span>}
    </span>
  );
}

// A drawing question: an optional picture to draw on, how students may answer, the canvas size and the rubric.
function DrawingEditor({ q, onChange }: { q: DrawingQuestion; onChange: (q: Question) => void }) {
  // At least one way to answer stays on.
  const setDraw = (allowDraw: boolean) => onChange({ ...q, allowDraw, ...(allowDraw ? {} : { allowUpload: true }) });
  const setUpload = (allowUpload: boolean) =>
    onChange({ ...q, allowUpload, ...(allowUpload ? {} : { allowDraw: true, cameraOnly: false }) });
  const setBackground = ({ imageId, alt }: PickedImage) => {
    const next = Object.fromEntries(
      Object.entries(q).filter(([key]) => key !== "backgroundImageId" && key !== "backgroundAlt"),
    ) as unknown as DrawingQuestion; // only the two optional background keys were dropped
    onChange(imageId === undefined ? next : { ...next, backgroundImageId: imageId, backgroundAlt: alt ?? "" });
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Background image (optional)</p>
        <p className="text-xs text-muted">Students draw on top of it, e.g. a diagram to label or a grid to plot on.</p>
        <ImageField imageId={q.backgroundImageId} alt={q.backgroundAlt} onChange={setBackground} label="the background image" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">How students answer</p>
        <Check2 checked={q.allowDraw} onChange={setDraw}>
          Students can draw
        </Check2>
        <Check2 checked={q.allowUpload} onChange={setUpload}>
          Students can upload or take photos
        </Check2>
        {q.allowUpload && (
          <div className="ml-6">
            <Check2
              checked={q.cameraOnly}
              onChange={(cameraOnly) => onChange({ ...q, cameraOnly })}
              hint="Students must take the photo with the camera, not pick one from their gallery."
            >
              Camera only
            </Check2>
          </div>
        )}
      </div>
      {q.allowDraw && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Canvas size (pixels)</p>
          <div className="flex flex-wrap items-start gap-2">
            {canvasPresets.map(([w, h]) => (
              <Button
                key={`${w}x${h}`}
                variant={q.canvasWidth === w && q.canvasHeight === h ? "primary" : "secondary"}
                className="py-1 text-xs"
                onClick={() => onChange({ ...q, canvasWidth: w, canvasHeight: h })}
              >
                {w} × {h}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-start gap-2 text-sm">
            <SizeInput value={q.canvasWidth} label="Canvas width" onChange={(canvasWidth) => onChange({ ...q, canvasWidth })} />
            <span className="pt-1.5 text-muted">×</span>
            <SizeInput value={q.canvasHeight} label="Canvas height" onChange={(canvasHeight) => onChange({ ...q, canvasHeight })} />
          </div>
        </div>
      )}
      <RubricEditor q={q} onChange={onChange} />
    </div>
  );
}

// Rescales the rows in proportion so they add up to `target`, in half points.
function matchRubric(rows: readonly RubricRow[], target: number): RubricRow[] {
  const total = rubricTotal(rows);
  const next = rows.map((r, i) => ({
    ...r,
    points: total > 0 ? Math.round((r.points / total) * target * 2) / 2 : i === 0 ? target : 0,
  }));
  const biggest = next.reduce((best, r, i) => (r.points > next[best]!.points ? i : best), 0);
  const rest = target - rubricTotal(next);
  next[biggest]!.points = Math.max(0, next[biggest]!.points + rest);
  return next;
}

const unitNoun: Partial<Record<Question["type"], string>> = {
  blank: "blank",
  matching: "pair",
  enumeration: "item",
  code: "test",
};

// What each unit (blank, pair, item, test) is called in the weights list.
function unitLabels(q: Weighted): string[] {
  switch (q.type) {
    case "blank":
      return blankAnswers(q.prompt).map((a) => a[0] || "(empty)");
    case "matching":
      return q.left.map((l, i) => l.text.trim() || `Item ${i + 1}`);
    case "enumeration":
      return q.items.map((x, i) => x.split("|")[0]!.trim() || `Item ${i + 1}`);
    case "code":
      return q.tests.map((_, i) => `Test ${i + 1}`);
  }
}

const pts = (n: number) => `${n} ${n === 1 ? "pt" : "pts"}`;

// Points split, partial credit, and the Advanced section (game points).
function ScoringSection({
  question: q,
  onChange,
  poolLocked,
}: {
  question: Question;
  onChange: (q: Question) => void;
  poolLocked?: boolean;
}) {
  const units = q.type === "blank" || q.type === "matching" || q.type === "enumeration" || q.type === "code" ? unitCount(q) : 1;
  const split = (q.type === "blank" || q.type === "matching" || q.type === "enumeration" || q.type === "code") && units > 1;
  const partial = (q.type === "multiple_choice" && q.multipleCorrect) || split || q.type === "sql";
  const noun = unitNoun[q.type] ?? "part";

  return (
    <div className="space-y-3 border-t border-border pt-3">
      {poolLocked && (
        <p className="text-xs text-muted">This question is in a pool, so its points are set by the part.</p>
      )}
      {(q.type === "blank" || q.type === "matching" || q.type === "enumeration" || q.type === "code") && split && (
        <PointsSplit q={q} noun={noun} onChange={onChange} />
      )}
      {partial && (
        <Check2
          checked={q.partialCredit}
          onChange={(partialCredit) => onChange({ ...q, partialCredit })}
          hint={
            q.partialCredit
              ? q.type === "sql"
                ? "Each check earns its share."
                : q.type === "multiple_choice"
                  ? "Right ticks earn a share; wrong ticks take one back."
                  : `Each correct ${noun} earns its share of the points.`
              : "All or nothing: the points only go to a fully correct answer."
          }
        >
          Partial credit
        </Check2>
      )}
      <details className="rounded-lg border border-border">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Advanced</summary>
        <div className="border-t border-border p-3">
          <label className="block max-w-64 text-sm">
            <span className="mb-1 block font-medium">Game points</span>
            <select
              value={q.gamePoints}
              onChange={(e) => onChange({ ...q, gamePoints: e.target.value as Question["gamePoints"] })}
              className={inputClass}
            >
              <option value="standard">Standard (1000)</option>
              <option value="double">Double (2000)</option>
              <option value="none">No points</option>
            </select>
            <span className="mt-1 block text-xs text-muted">
              Only used when this quiz runs as a live game. The grade still uses the question&apos;s points.
            </span>
          </label>
        </div>
      </details>
    </div>
  );
}

function PointsSplit({ q, noun, onChange }: { q: Weighted; noun: string; onChange: (q: Question) => void }) {
  const n = unitCount(q);
  const labels = unitLabels(q);
  const custom = !!q.weights && q.weights.length > 0;
  const shares = unitPoints(q);
  // Weights from before the number of parts changed show as 1 for the new parts; editing any weight saves them all.
  const weights = Array.from({ length: n }, (_, i) => q.weights?.[i] ?? 1);
  const stale = custom && q.weights!.length !== n;
  const setWeight = (i: number, value: number) =>
    onChange({ ...q, weights: weights.map((w, j) => (j === i ? Math.max(0, value || 0) : w)) });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm">
          {custom ? "Points per " + noun : `Each ${noun} is worth ${pts(Math.round((q.points / n) * 100) / 100)}`}
        </p>
        <Check2
          checked={custom}
          onChange={(on) => {
            if (on) onChange({ ...q, weights: weights.map(() => 1) });
            else {
              const rest = { ...q };
              delete rest.weights;
              onChange(rest);
            }
          }}
        >
          Custom weights
        </Check2>
      </div>
      {custom && (
        <>
          {stale && (
            <p className="flex items-center gap-2 text-xs text-warning">
              <TriangleAlert className="size-4 shrink-0" aria-hidden /> The number of {noun}s changed. Check the weights
              and edit one to save them; until then the points are split equally.
            </p>
          )}
          <ul className="space-y-1.5">
            {weights.map((w, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate" title={labels[i]}>
                  {i + 1}. {labels[i]}
                </span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={w}
                  aria-label={`Weight for ${noun} ${i + 1}`}
                  onChange={(e) => setWeight(i, Number(e.target.value))}
                  className={clsx(inputBase, "w-20 py-1")}
                />
                <span className="w-16 shrink-0 text-right text-muted tabular-nums">{pts(shares[i] ?? 0)}</span>
              </li>
            ))}
          </ul>
          {weights.every((w) => w === 0) && (
            <p className="text-xs text-danger">At least one weight must be above 0.</p>
          )}
        </>
      )}
    </div>
  );
}

const mono = `${inputClass} font-mono text-xs`;

function CodeQuestionEditor({ q, onChange }: { q: CodeQuestion; onChange: (q: Question) => void }) {
  const setTest = (id: string, patch: Partial<CodeQuestion["tests"][number]>) =>
    onChange({ ...q, tests: q.tests.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Students write a program that reads the test input and prints the expected output. Each passing test earns an
        equal share of the points, or the weight you set below. Trailing spaces and blank lines at the end don&apos;t
        count.
      </p>
      <label className="block max-w-56 text-sm">
        <span className="mb-1 block font-medium">Language</span>
        <select
          value={q.language}
          onChange={(e) => {
            const language = e.target.value as CodeLanguage;
            // Swap in the new language's template unless the teacher wrote their own starter code.
            const untouched =
              !q.starterCode.trim() || q.starterCode === starterTemplates[q.language] || q.starterCode === laravelStarter;
            onChange({
              ...q,
              language,
              starterCode: untouched ? starterTemplates[language] : q.starterCode,
              // Tables are a PHP (Laravel) feature.
              database: language === "php" ? q.database : undefined,
            });
          }}
          className={inputClass}
        >
          {Object.entries(languageLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {q.language === "php" && (
        <div className="rounded-lg border border-border p-3">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={q.database !== undefined}
              onChange={(e) => {
                const untouched = !q.starterCode.trim() || q.starterCode === starterTemplates.php || q.starterCode === laravelStarter;
                onChange({
                  ...q,
                  database: e.target.checked ? sqlTemplate : undefined,
                  starterCode: untouched ? (e.target.checked ? laravelStarter : starterTemplates.php) : q.starterCode,
                });
              }}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              <span className="font-medium">Give students a database (Laravel)</span>
              <span className="mt-0.5 block text-muted">
                Each test starts with these tables in a fresh database. Students can use Laravel&apos;s{" "}
                <code>DB</code> facade, query builder and Eloquent models, as in a Laravel app.
              </span>
            </span>
          </label>
          {q.database !== undefined && (
            <div className="mt-3">
              <SqlTablesField value={q.database} onChange={(database) => onChange({ ...q, database })} />
            </div>
          )}
        </div>
      )}
      <div>
        <p className="mb-1 text-sm font-medium">Starter code</p>
        <p className="mb-1.5 text-xs text-muted">What students see in the editor when they start. Can be empty.</p>
        <CodeEditor
          value={q.starterCode}
          onChange={(starterCode) => onChange({ ...q, starterCode })}
          language={q.language}
          minLines={6}
          label="Starter code"
        />
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Test cases</p>
        <p className="mb-2 text-xs text-muted">
          Hidden tests are checked but never shown to students, so they can&apos;t write code that only fits the
          examples.
        </p>
        <ol className="space-y-3">
          {q.tests.map((t, i) => (
            <li key={t.id} className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center gap-3">
                <span className="text-sm font-medium">Test {i + 1}</span>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={t.hidden}
                    onChange={(e) => setTest(t.id, { hidden: e.target.checked })}
                    className="size-4 accent-primary"
                  />
                  Hidden
                </label>
                <Button
                  variant="ghost"
                  className="ml-auto px-2"
                  aria-label={`Remove test ${i + 1}`}
                  disabled={q.tests.length <= 1}
                  onClick={() => onChange({ ...q, tests: q.tests.filter((x) => x.id !== t.id), ...weightsRemove(q, i) })}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs text-muted">
                  Input
                  <textarea
                    value={t.input}
                    onChange={(e) => setTest(t.id, { input: e.target.value })}
                    rows={3}
                    spellCheck={false}
                    placeholder="(none)"
                    className={`${mono} mt-1 text-foreground`}
                  />
                </label>
                <label className="block text-xs text-muted">
                  Expected output
                  <textarea
                    value={t.expectedOutput}
                    onChange={(e) => setTest(t.id, { expectedOutput: e.target.value })}
                    rows={3}
                    spellCheck={false}
                    className={`${mono} mt-1 text-foreground`}
                  />
                </label>
              </div>
            </li>
          ))}
        </ol>
        <Button
          variant="ghost"
          className="mt-1 text-primary"
          onClick={() =>
            onChange({
              ...q,
              tests: [...q.tests, { id: newId(), input: "", expectedOutput: "", hidden: true }],
              ...weightsAdd(q),
            })
          }
        >
          <Plus className="size-4" /> Add test case
        </Button>
      </div>
      <textarea
        value={q.rubric}
        onChange={(e) => onChange({ ...q, rubric: e.target.value })}
        placeholder="Review notes (optional), e.g. must use a loop, readable names. Shown to you while grading."
        rows={2}
        className={inputClass}
      />
    </div>
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
