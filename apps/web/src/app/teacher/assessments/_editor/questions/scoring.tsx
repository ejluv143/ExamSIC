"use client";

import clsx from "clsx";
import { TriangleAlert } from "lucide-react";
import { inputBase, inputClass } from "@/components/ui";
import { blankAnswers, unitCount, unitPoints } from "@examora/contract";
import type { Question } from "@examora/contract";
import { Weighted, Check2, pts } from "./shared";

export const unitNoun: Partial<Record<Question["type"], string>> = {
  blank: "blank",
  matching: "pair",
  enumeration: "item",
  code: "test",
  categorization: "item",
  ordering: "position",
  hotspot: "area",
};

// What each unit (blank, pair, item, test) is called in the weights list.
export function unitLabels(q: Weighted): string[] {
  switch (q.type) {
    case "blank":
      return blankAnswers(q.prompt).map((a) => a[0] || "(empty)");
    case "matching":
      return q.left.map((l, i) => l.text.trim() || `Item ${i + 1}`);
    case "categorization":
      return q.items.map((x, i) => x.text.trim() || x.alt?.trim() || `Item ${i + 1}`);
    case "enumeration":
      return q.items.map((x, i) => x.split("|")[0]!.trim() || `Item ${i + 1}`);
    case "code":
      return q.tests.map((_, i) => `Test ${i + 1}`);
  }
}

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
  const weighted =
    q.type === "blank" || q.type === "matching" || q.type === "enumeration" || q.type === "code" || q.type === "categorization" ? q : null;
  const placed = q.type === "ordering" || q.type === "hotspot";
  const units = weighted || placed ? unitCount(q) : 1;
  const split = weighted !== null && units > 1;
  const partial = (q.type === "multiple_choice" && q.multipleCorrect) || split || q.type === "sql" || (placed && units > 1);
  const noun = unitNoun[q.type] ?? "part";

  return (
    <div className="space-y-3 pt-1">
      {poolLocked && (
        <p className="text-xs text-muted">This question is in a pool, so its points are set by the part.</p>
      )}
      {weighted && split && <PointsSplit q={weighted} noun={noun} onChange={onChange} />}
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
      <details>
        <summary className="cursor-pointer py-1 text-sm font-medium">Live game points (advanced)</summary>
        <div className="pt-2">
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

export function PointsSplit({ q, noun, onChange }: { q: Weighted; noun: string; onChange: (q: Question) => void }) {
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
