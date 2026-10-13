"use client";

import clsx from "clsx";
import { TriangleAlert } from "lucide-react";
import { inputBase } from "@/components/ui";
import { Select } from "@/components/select";
import { unitCount, unitPoints } from "@examinus/domain/scoring";
import type { Question } from "@examinus/domain/question";
import { modelOf } from "@/components/question-kinds/views/editor-model";
import { Check2 } from "@/components/question-kinds/shared/editor-fields";
import { pts, type Weighted } from "@/components/question-kinds/shared/editor-model";

// Points split, partial credit, and the Advanced section (game points).
export function ScoringSection({
  question: q,
  onChange,
  poolLocked,
}: {
  question: Question;
  onChange: (q: Question) => void;
  poolLocked?: boolean;
}) {
  const model = modelOf(q);
  // Types whose units have weights (blanks, pairs, items, tests) can split their points unevenly.
  const weighted = model.unit?.labels ? (q as Weighted) : null;
  const units = model.unit ? unitCount(q) : 1;
  const partial = model.partialCredit?.applies(q) ?? false;
  const noun = model.unit?.noun ?? "part";

  return (
    <div className="space-y-3 pt-1">
      {poolLocked && (
        <p className="text-xs text-muted">This question is in a pool, so its points are set by the part.</p>
      )}
      {weighted && units > 1 && <PointsSplit q={weighted} noun={noun} onChange={onChange} />}
      {partial && (
        <Check2
          checked={q.partialCredit}
          onChange={(partialCredit) => onChange({ ...q, partialCredit })}
          hint={
            q.partialCredit
              ? (model.partialCredit?.hint ?? `Each correct ${noun} earns its share of the points.`)
              : "All or nothing: the points only go to a fully correct answer."
          }
        >
          Partial credit
        </Check2>
      )}
      <details>
        <summary className="cursor-pointer py-1 text-sm font-medium">Live game points (advanced)</summary>
        <div className="pt-2">
          <label className="block max-w-64 text-sm">
            <span className="mb-1 block font-medium">Game points</span>
            <Select
              value={q.gamePoints}
              onChange={(gamePoints) => onChange({ ...q, gamePoints })}
              options={[
                { value: "standard", label: "Standard (1000)" },
                { value: "double", label: "Double (2000)" },
                { value: "none", label: "No points" },
              ]}
              className="w-full"
            />
            <span className="mt-1 block text-xs text-muted">
              Only used when this quiz runs as a live game. The grade still uses the question&apos;s points.
            </span>
          </label>
        </div>
      </details>
    </div>
  );
}

export function PointsSplit({ q, noun, onChange }: { q: Weighted; noun: string; onChange: (q: Question) => void }) {
  const n = unitCount(q);
  const labels = modelOf(q).unit?.labels?.(q) ?? [];
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
