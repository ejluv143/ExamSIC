"use client";

import { useRef, useState } from "react";
import { Calculator, X } from "lucide-react";
import { Button, inputBase } from "@/components/ui";
import { questionTypeLabel } from "@/lib/format";
import { maxScore } from "@examora/contract/scoring";
import type { Question, QuestionType } from "@examora/contract";

// Points per question type, with a way to set every question of one type to the same points.
export function PointsDialog({
  questions,
  onSetPoints,
}: {
  questions: Question[];
  onSetPoints: (type: QuestionType, points: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Typed values not yet applied, keyed by type.
  const [drafts, setDrafts] = useState<Partial<Record<QuestionType, string>>>({});

  const rows = (Object.keys(questionTypeLabel) as QuestionType[])
    .map((type) => {
      const qs = questions.filter((q) => q.type === type);
      const values = [...new Set(qs.map((q) => q.points))];
      return { type, count: qs.length, each: values.length === 1 ? values[0] : null, subtotal: maxScore(qs) };
    })
    .filter((r) => r.count > 0);
  const total = maxScore(questions);

  function apply(type: QuestionType) {
    const value = Number(drafts[type]);
    if (drafts[type] === undefined || !(value > 0)) return;
    onSetPoints(type, value);
    setDrafts((d) => ({ ...d, [type]: undefined }));
  }

  return (
    <>
      <Button variant="secondary" className="w-full" onClick={() => dialog.current?.showModal()}>
        <Calculator className="size-4" aria-hidden /> Points per type
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="points-title"
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
        onClose={() => setDrafts({})}
        className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="points-title" className="font-semibold">
              Points per type
            </h2>
            <p className="mt-0.5 text-sm text-muted">Change “Each” to give every question of that type the same points.</p>
          </div>
          <Button variant="ghost" className="px-2" aria-label="Close" onClick={() => dialog.current?.close()}>
            <X className="size-4" />
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No questions yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs tracking-wide text-muted uppercase">
                <th className="px-5 py-2.5 font-medium">Type</th>
                <th className="px-2 py-2.5 text-right font-medium">Items</th>
                <th className="px-2 py-2.5 text-right font-medium">Each</th>
                <th className="px-5 py-2.5 text-right font-medium">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border border-y border-border">
              {rows.map((r) => (
                <tr key={r.type}>
                  <td className="px-5 py-2.5 font-medium">{questionTypeLabel[r.type]}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{r.count}</td>
                  <td className="px-2 py-2.5 text-right">
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      aria-label={`Points for each ${questionTypeLabel[r.type]} question`}
                      value={drafts[r.type] ?? r.each ?? ""}
                      placeholder="Mixed"
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.type]: e.target.value }))}
                      onBlur={() => apply(r.type)}
                      onKeyDown={(e) => e.key === "Enter" && apply(r.type)}
                      className={`${inputBase} w-20 py-1 text-right tabular-nums`}
                    />
                  </td>
                  <td className="px-5 py-2.5 text-right font-medium tabular-nums">{r.subtotal}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-5 py-3">Total</td>
                <td className="px-2 py-3 text-right tabular-nums">{questions.length}</td>
                <td />
                <td className="px-5 py-3 text-right text-lg tabular-nums">{total}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </dialog>
    </>
  );
}
