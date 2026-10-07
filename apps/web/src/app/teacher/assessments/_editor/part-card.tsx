"use client";

import { useState, type DragEventHandler, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button, Card, inputBase, inputClass } from "@/components/ui";
import { MarkdownEditor } from "@/components/markdown-editor";
import { partTotals, poolPoints, withPoolPoints, type EditorPart } from "@/lib/quiz-editor";
import { validPoints } from "./points-dialog";

export type DeleteMode = "move" | "remove";

// One part of the quiz: its title, instructions, shuffle and pool settings, live totals, and the questions in it.
export function PartCard({
  part,
  index,
  count,
  moveTarget,
  dropActive,
  onDragOver,
  onDragLeave,
  onDrop,
  onChange,
  onMove,
  onDelete,
  children,
  footer,
}: {
  part: EditorPart;
  index: number;
  count: number;
  // The title of the part its questions move to when it is deleted; undefined if there is no other part.
  moveTarget: string | undefined;
  dropActive: boolean;
  onDragOver: DragEventHandler<HTMLElement>;
  onDragLeave: DragEventHandler<HTMLElement>;
  onDrop: DragEventHandler<HTMLElement>;
  onChange: (part: EditorPart) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: (mode: DeleteMode) => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pointsDraft, setPointsDraft] = useState<string>();
  const totals = partTotals(part);
  const pool = part.poolSize !== null;
  const n = part.questions.length;
  const label = part.title.trim() || `Part ${index + 1}`;
  const unequal = pool && new Set(part.questions.map((q) => q.points)).size > 1;

  function setPool(on: boolean) {
    onChange(on ? withPoolPoints({ ...part, poolSize: Math.max(1, n) }) : { ...part, poolSize: null });
  }

  function setPoolPoints(raw: string) {
    setPointsDraft(raw);
    const value = Number(raw);
    if (raw !== "" && validPoints(value)) onChange(withPoolPoints(part, value));
  }

  return (
    <Card
      className={clsx(dropActive && "ring-2 ring-primary")}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="space-y-4 border-b border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-48 flex-1">
            <input
              value={part.title}
              onChange={(e) => onChange({ ...part, title: e.target.value })}
              aria-label={`Title of part ${index + 1}`}
              placeholder="Part title, e.g. Multiple choice"
              className={clsx(inputClass, "font-semibold")}
            />
            <p className="mt-1.5 text-sm text-muted tabular-nums" aria-live="polite">
              {label} – {totals.totalPoints} {totals.totalPoints === 1 ? "pt" : "pts"} · {totals.questionCount}{" "}
              {totals.questionCount === 1 ? "question" : "questions"}
              {pool && ` (draws ${totals.questionCount} of ${n})`}
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              variant="secondary"
              onClick={() => onMove(-1)}
              disabled={index === 0}
              aria-label={`Move ${label} up`}
            >
              <ArrowUp className="size-4" aria-hidden />
            </Button>
            <Button
              variant="secondary"
              onClick={() => onMove(1)}
              disabled={index === count - 1}
              aria-label={`Move ${label} down`}
            >
              <ArrowDown className="size-4" aria-hidden />
            </Button>
            <Button
              variant="secondary"
              onClick={() => (n === 0 ? onDelete("remove") : setConfirming(true))}
              disabled={count === 1}
              title={count === 1 ? "A quiz needs at least one part" : undefined}
              aria-label={`Delete ${label}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        {confirming && (
          <div role="alertdialog" aria-label={`Delete ${label}`} className="space-y-3 rounded-lg bg-danger-soft p-3 text-sm">
            <p className="text-danger">
              {label} has {n} {n === 1 ? "question" : "questions"}. What should happen to them?
            </p>
            <div className="flex flex-wrap gap-2">
              {moveTarget !== undefined && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setConfirming(false);
                    onDelete("move");
                  }}
                >
                  Move them to {moveTarget.trim() || "the neighbouring part"}
                </Button>
              )}
              <Button
                variant="danger"
                onClick={() => {
                  setConfirming(false);
                  onDelete("remove");
                }}
              >
                Delete part and its questions
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-sm font-medium">Instructions</p>
          <MarkdownEditor
            value={part.instructions}
            onChange={(instructions) => onChange({ ...part, instructions })}
            label={`Instructions of ${label}`}
            rows={3}
            placeholder="e.g. Choose the letter of the best answer."
          />
          <p className="mt-1 text-xs text-muted">
            Printed under the part title and shown to students before its questions.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
            Shuffle questions in this part
            <input
              type="checkbox"
              role="switch"
              checked={part.shuffleQuestions}
              onChange={(e) => onChange({ ...part, shuffleQuestions: e.target.checked })}
              className="size-4 accent-primary"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
            Pool: draw some of the questions
            <input
              type="checkbox"
              role="switch"
              checked={pool}
              onChange={(e) => setPool(e.target.checked)}
              className="size-4 accent-primary"
            />
          </label>
        </div>

        {pool && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                Draw
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={part.poolSize ?? 1}
                  onChange={(e) =>
                    onChange({ ...part, poolSize: e.target.value === "" ? 1 : Math.max(1, Math.trunc(Number(e.target.value))) })
                  }
                  aria-label={`Questions drawn from ${label}`}
                  className={clsx(inputBase, "w-20 py-1 text-right tabular-nums")}
                />
                of {n}
              </label>
              <label className="flex items-center gap-2">
                Points per question
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={pointsDraft ?? poolPoints(part)}
                  onChange={(e) => setPoolPoints(e.target.value)}
                  onBlur={() => setPointsDraft(undefined)}
                  aria-label={`Points per question in ${label}`}
                  className={clsx(inputBase, "w-20 py-1 text-right tabular-nums")}
                />
              </label>
            </div>
            <p className="text-xs text-muted">
              Each student gets a random {part.poolSize} of these {n} questions, all worth the same points.
            </p>
            {part.poolSize !== null && part.poolSize > n && (
              <p role="alert" className="text-xs text-danger">
                The pool draws more questions than the part has. Add questions or lower the number.
              </p>
            )}
            {unequal && (
              <p role="alert" className="text-xs text-danger">
                Questions in a pool need equal points. Set “Points per question” to fix it.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        {n === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
            No questions in this part. Add one below, or drop a question here.
          </p>
        )}
        {children}
        {footer}
      </div>
    </Card>
  );
}
