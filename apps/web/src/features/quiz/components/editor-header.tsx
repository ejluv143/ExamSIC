"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Check, Rows3, Table2 } from "lucide-react";
import { Button } from "@/components/ui";

export type EditorView = "cards" | "table";

export type SaveState = "saved" | "unsaved" | "saving";

const saveText: Record<SaveState, string> = { saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…" };

const saveTone: Record<SaveState, string> = {
  saved: "bg-success-soft text-success",
  unsaved: "bg-warning-soft text-warning",
  saving: "bg-surface-muted text-muted",
};

// What the teacher is looking at: the breadcrumb, the title with the save state and the quiz's totals, then a bar
// (it stays in view on wide screens) with the cards/table switch, the quiz's actions and the Save button.
export function EditorHeader({
  quizId,
  title,
  totals,
  view,
  state,
  onView,
  onSave,
  actions,
}: {
  quizId: string;
  title: string;
  totals: { parts: number; questions: number; points: number };
  view: EditorView;
  state: SaveState;
  onView: (view: EditorView) => void;
  onSave: () => void;
  // Buttons between the view switch and Save: preview, paper layout, add question.
  actions: ReactNode;
}) {
  const name = title.trim() || "Untitled quiz";
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  return (
    <>
      <header className="mb-4">
        <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted">
          <ol className="flex flex-wrap items-center gap-x-1.5">
            <li>
              <Link href="/teacher/assessments" className="hover:text-foreground hover:underline">
                Quizzes &amp; Exams
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="min-w-0 max-w-64 truncate">
              {quizId === "new" ? (
                name
              ) : (
                <Link href={`/teacher/assessments/${quizId}`} className="hover:text-foreground hover:underline">
                  {name}
                </Link>
              )}
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-foreground">
              Editor
            </li>
          </ol>
        </nav>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{name}</h1>
          <p
            role="status"
            className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", saveTone[state])}
          >
            {state === "saved" && <Check className="size-3.5" aria-hidden />}
            {saveText[state]}
          </p>
          <p className="rounded-md border border-border bg-surface px-2.5 py-0.5 text-xs text-muted tabular-nums" aria-label="Totals">
            {plural(totals.parts, "Part")} · {plural(totals.questions, "Question")} · {totals.points} {totals.points === 1 ? "pt" : "pts"}
          </p>
        </div>
      </header>

      <div className="z-30 mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-background py-2 lg:sticky lg:top-0">
        <div role="radiogroup" aria-label="View" className="inline-flex rounded-lg bg-surface-muted p-0.5 text-sm">
          {(
            [
              ["cards", "Cards", Rows3],
              ["table", "Table", Table2],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={view === value}
              onClick={() => onView(value)}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium focus-visible:outline-2 focus-visible:outline-primary",
                view === value ? "bg-surface shadow-sm" : "text-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {actions}
          <Button variant="secondary" onClick={onSave} disabled={state === "saving"}>
            {state === "saving" ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </>
  );
}
