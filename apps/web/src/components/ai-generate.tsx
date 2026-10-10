"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button, Field, inputClass } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { blankModeLabel, questionTypeLabel } from "@/lib/format";
import { generateQuestionsAction } from "@/lib/ai/actions";
import { aiDifficulties, aiLimits, aiProviderLabels, aiQuestionTypes } from "@examora/contract";
import type { AiDifficulty, AiOption, AiProvider, AiQuestionType, Question } from "@examora/contract";

const typeLabel = (type: AiQuestionType) => (type === "blank" ? blankModeLabel.fill : questionTypeLabel[type]);
const difficultyLabel: Record<AiDifficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

// Picking from the drafts before they are kept: `preview` shows one, `save` keeps the picked ones and returns an
// error message or null.
export type AiReview = { preview: (question: Question) => ReactNode; save: (questions: Question[]) => Promise<string | null>; saveLabel: string };

// "Generate with AI": drafts questions from the teacher's notes. `options` is what ai.status returned (null while
// loading, empty when no key is saved). Without `review` the drafts go straight to `onAdd` (the quiz editor, where
// they stay editable until the quiz is saved); with it the teacher picks which to keep first (the question bank).
export function AiGenerate({
  options,
  description,
  ...target
}: {
  options: readonly AiOption[] | null;
  description: string;
} & ({ onAdd: (questions: Question[]) => void; review?: undefined } | { review: AiReview; onAdd?: undefined })) {
  const [open, setOpen] = useState(false);
  const none = options !== null && options.length === 0;

  return (
    <>
      <Button
        variant="secondary"
        disabled={options === null || none}
        title={none ? "No AI key yet: add one in AI keys settings" : undefined}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4" aria-hidden /> Generate with AI
      </Button>
      {none && (
        <Link href="/teacher/settings/ai" className="self-center text-xs text-primary hover:underline">
          Add an AI key
        </Link>
      )}
      {options && options.length > 0 && (
        <GenerateDialog options={options} open={open} onClose={() => setOpen(false)} description={description} {...target} />
      )}
    </>
  );
}

function GenerateDialog({
  options,
  open,
  onClose,
  description,
  onAdd,
  review,
}: {
  options: readonly AiOption[];
  open: boolean;
  onClose: () => void;
  description: string;
  onAdd?: (questions: Question[]) => void;
  review?: AiReview;
}) {
  const [provider, setProvider] = useState<AiProvider>(options[0]!.provider);
  const [instructions, setInstructions] = useState("");
  const [count, setCount] = useState("5");
  const [types, setTypes] = useState<ReadonlySet<AiQuestionType>>(new Set(["multiple_choice"]));
  const [difficulty, setDifficulty] = useState<AiDifficulty>("medium");
  const [points, setPoints] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The drafts waiting to be picked (review only), and the indexes of the picked ones.
  const [drafts, setDrafts] = useState<Question[] | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const chosen = options.find((o) => o.provider === provider) ?? options[0]!;

  function toggle(type: AiQuestionType) {
    const next = new Set(types);
    if (!next.delete(type)) next.add(type);
    setTypes(next);
  }

  function close() {
    setDrafts(null);
    setError(null);
    onClose();
  }

  async function generate() {
    setError(null);
    setBusy(true);
    const result = await generateQuestionsAction({
      provider: chosen.provider,
      instructions: instructions.trim(),
      count: Number(count),
      types: aiQuestionTypes.filter((t) => types.has(t)),
      difficulty,
      points: Number(points),
    });
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    // Same as picking from the question bank: a fresh id for each, so nothing clashes with what is already there.
    const fresh = result.ok.map((q) => ({ ...structuredClone(q), id: crypto.randomUUID().slice(0, 8) }));
    if (review) {
      setDrafts(fresh);
      setPicked(new Set(fresh.map((_, i) => i)));
      return;
    }
    onAdd?.(fresh);
    close();
  }

  async function save() {
    if (!review || !drafts) return;
    setError(null);
    setBusy(true);
    const message = await review.save(drafts.filter((_, i) => picked.has(i)));
    setBusy(false);
    if (message) setError(message);
    else close();
  }

  function togglePicked(i: number) {
    const next = new Set(picked);
    if (!next.delete(i)) next.add(i);
    setPicked(next);
  }

  if (review && drafts) {
    return (
      <Dialog
        open={open}
        onClose={() => !busy && close()}
        title="Pick the questions to keep"
        description="Untick any you don't want. AI drafts can be wrong: check each answer."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDrafts(null)} disabled={busy}>
              Back
            </Button>
            <Button onClick={save} disabled={busy || picked.size === 0}>
              {busy ? "Saving…" : `${review.saveLabel} (${picked.size})`}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {drafts.map((q, i) => (
            <label key={q.id} className="flex cursor-pointer gap-3 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                checked={picked.has(i)}
                onChange={() => togglePicked(i)}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs text-muted">
                  {i + 1}. {questionTypeLabel[q.type]} · {q.points} {q.points === 1 ? "point" : "points"}
                </p>
                {review.preview(q)}
              </div>
            </label>
          ))}
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && close()}
      title="Generate questions with AI"
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={generate} disabled={busy}>
            {busy ? "Generating…" : "Generate"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Provider" hint={`Model: ${chosen.model} · ${chosen.scope === "own" ? "your own key" : "the school's key"}`}>
          <select value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)} className={inputClass}>
            {options.map((o) => (
              <option key={o.provider} value={o.provider}>
                {aiProviderLabels[o.provider]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What to cover" hint="A topic, your notes or the text the questions should come from.">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={aiLimits.maxInstructions}
            rows={6}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={`Questions (1–${aiLimits.maxQuestions})`}>
            <input
              type="number"
              min={1}
              max={aiLimits.maxQuestions}
              step={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Difficulty">
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as AiDifficulty)} className={inputClass}>
              {aiDifficulties.map((d) => (
                <option key={d} value={d}>
                  {difficultyLabel[d]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Points each">
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Question types</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {aiQuestionTypes.map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={types.has(t)} onChange={() => toggle(t)} className="size-4 accent-primary" />
                {typeLabel(t)}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
