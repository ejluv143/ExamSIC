"use client";

import clsx from "clsx";
import { Plus, TriangleAlert, X } from "lucide-react";
import { Button, inputClass } from "@/components/ui";
import { rubricTotal } from "@examinus/domain/kinds/base";
import type { Question } from "@examinus/domain/question";
import type { RubricRow } from "@examinus/domain/kinds/base";
import { matchRubric, newId } from "@examinus/question-kinds-core/editor-shared";
import { PointsInput } from "./editor-fields";

// Essay and drawing rubric: rows with points that add up to the question's points. No rows: graded as a whole.
export function RubricEditor<Q extends Extract<Question, { type: "essay" | "drawing" }>>({ q, onChange }: { q: Q; onChange: (q: Q) => void }) {
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
