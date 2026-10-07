"use client";

import { useRef, useState } from "react";
import { Calculator, X } from "lucide-react";
import { Button, inputBase } from "@/components/ui";
import { questionTypeLabel } from "@/lib/format";
import { partTotals, quizPaperTotals, type EditorPart } from "@/lib/quiz-editor";
import { maxScore } from "@examora/contract/scoring";
import type { QuestionType } from "@examora/contract";

// Whole or half points above 0.
export const validPoints = (value: number) => value > 0 && Number.isInteger(value * 2);

// Sets points in bulk: for every question of a part, or for every question of one type.
// Questions in a pool part are set from their part, so the type rows leave them out.
export function PointsDialog({
  parts,
  onSetPartPoints,
  onSetTypePoints,
}: {
  parts: EditorPart[];
  onSetPartPoints: (partId: string, points: number) => void;
  onSetTypePoints: (type: QuestionType, points: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Typed values not yet applied, keyed by "part:<id>" or "type:<type>".
  const [drafts, setDrafts] = useState<Record<string, string | undefined>>({});

  const partRows = parts
    .filter((p) => p.questions.length > 0)
    .map((p) => {
      const values = [...new Set(p.questions.map((q) => q.points))];
      return { part: p, each: values.length === 1 ? values[0]! : null, totals: partTotals(p) };
    });
  const loose = parts.filter((p) => p.poolSize === null).flatMap((p) => p.questions);
  const typeRows = (Object.keys(questionTypeLabel) as QuestionType[])
    .map((type) => {
      const qs = loose.filter((q) => q.type === type);
      const values = [...new Set(qs.map((q) => q.points))];
      return { type, count: qs.length, each: values.length === 1 ? values[0]! : null, subtotal: maxScore(qs) };
    })
    .filter((r) => r.count > 0);
  const totals = quizPaperTotals({ parts });

  function apply(key: string, set: (points: number) => void) {
    const raw = drafts[key];
    if (raw === undefined) return;
    const value = Number(raw);
    if (validPoints(value)) set(value);
    setDrafts((d) => ({ ...d, [key]: undefined }));
  }

  const pointsInput = (key: string, each: number | null, label: string, set: (points: number) => void) => (
    <input
      type="number"
      min={0.5}
      step={0.5}
      aria-label={label}
      value={drafts[key] ?? each ?? ""}
      placeholder="Mixed"
      onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
      onBlur={() => apply(key, set)}
      onKeyDown={(e) => e.key === "Enter" && apply(key, set)}
      className={`${inputBase} w-20 py-1 text-right tabular-nums`}
    />
  );

  return (
    <>
      <Button variant="text" onClick={() => dialog.current?.showModal()}>
        <Calculator className="size-4" aria-hidden /> Set points in bulk
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="points-title"
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
        onClose={() => setDrafts({})}
        className="m-auto max-h-[90vh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="points-title" className="font-semibold">
              Set points in bulk
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Type whole or half points (0.5, 1, 1.5…) and press Enter. It applies to every question in the row.
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="rounded-md p-1 text-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {partRows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No questions yet.</p>
        ) : (
          <>
            <table className="w-full text-left text-sm">
              <caption className="px-5 pt-4 pb-2 text-left text-xs font-medium tracking-wide text-muted uppercase">
                By part
              </caption>
              <thead>
                <tr className="text-xs tracking-wide text-muted uppercase">
                  <th className="px-5 py-2 font-medium">Part</th>
                  <th className="px-2 py-2 text-right font-medium">Questions</th>
                  <th className="px-2 py-2 text-right font-medium">Each</th>
                  <th className="px-5 py-2 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border border-y border-border">
                {partRows.map(({ part, each, totals: t }) => (
                  <tr key={part.id}>
                    <td className="px-5 py-2.5 font-medium">
                      {part.title || "Untitled part"}
                      {part.poolSize !== null && (
                        <span className="block text-xs font-normal text-muted">
                          Pool: {part.poolSize} of {part.questions.length}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{part.questions.length}</td>
                    <td className="px-2 py-2.5 text-right">
                      {pointsInput(`part:${part.id}`, each, `Points for each question in ${part.title}`, (points) =>
                        onSetPartPoints(part.id, points),
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right font-medium tabular-nums">{t.totalPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {typeRows.length > 0 && (
              <table className="mt-2 w-full text-left text-sm">
                <caption className="px-5 pt-4 pb-2 text-left text-xs font-medium tracking-wide text-muted uppercase">
                  By question type
                </caption>
                <tbody className="divide-y divide-border border-y border-border">
                  {typeRows.map((r) => (
                    <tr key={r.type}>
                      <td className="px-5 py-2.5 font-medium">{questionTypeLabel[r.type]}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.count}</td>
                      <td className="px-2 py-2.5 text-right">
                        {pointsInput(
                          `type:${r.type}`,
                          r.each,
                          `Points for each ${questionTypeLabel[r.type]} question`,
                          (points) => onSetTypePoints(r.type, points),
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right font-medium tabular-nums">{r.subtotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {parts.some((p) => p.poolSize !== null) && (
              <p className="px-5 pt-3 text-xs text-muted">
                Questions in a pool part are not in the type rows: a pool needs equal points, so set them by part.
              </p>
            )}

            <div className="flex items-center justify-between px-5 py-4 font-semibold">
              <span>
                Student&apos;s paper · {totals.questionCount} {totals.questionCount === 1 ? "question" : "questions"}
              </span>
              <span className="text-lg tabular-nums">{totals.totalPoints} pts</span>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
