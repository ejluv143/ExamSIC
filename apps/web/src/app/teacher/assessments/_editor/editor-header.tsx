"use client";

import Link from "next/link";
import clsx from "clsx";
import { Check, ListChecks, Printer, Rows3, Table2 } from "lucide-react";
import { Button } from "@/components/ui";

export type EditorTab = "questions" | "paper";
export type EditorView = "cards" | "table";

export type SaveState = "saved" | "unsaved" | "saving";

const saveText: Record<SaveState, string> = { saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…" };

// What the teacher is looking at: the breadcrumb and title with the quiz's totals, then a bar (it stays in view
// on wide screens) with the page tabs, the cards/table switch, the save state and the Save button.
export function EditorHeader({
  quizId,
  title,
  totals,
  tab,
  view,
  state,
  onTab,
  onView,
  onSave,
}: {
  quizId: string;
  title: string;
  totals: { parts: number; questions: number; points: number };
  tab: EditorTab;
  view: EditorView;
  state: SaveState;
  onTab: (tab: EditorTab) => void;
  onView: (view: EditorView) => void;
  onSave: () => void;
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
                Quizzes
              </Link>
            </li>
            <li aria-hidden>›</li>
            <li className="min-w-0 max-w-64 truncate">
              {quizId === "new" ? (
                name
              ) : (
                <Link href={`/teacher/assessments/${quizId}`} className="hover:text-foreground hover:underline">
                  {name}
                </Link>
              )}
            </li>
            <li aria-hidden>›</li>
            <li aria-current="page" className="text-foreground">
              Edit
            </li>
          </ol>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="text-sm text-muted tabular-nums" aria-label="Totals">
            {plural(totals.parts, "part")} · {plural(totals.questions, "question")} · {totals.points} {totals.points === 1 ? "pt" : "pts"}
          </p>
        </div>
      </header>

      <div className="z-30 mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background py-2 lg:sticky lg:top-0">
        <nav aria-label="Editor pages" className="flex gap-1">
          {(
            [
              ["questions", "Questions", ListChecks],
              ["paper", "Test paper layout", Printer],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-current={tab === value ? "page" : undefined}
              onClick={() => onTab(value)}
              className={clsx(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary",
                tab === value ? "bg-primary-soft text-primary" : "text-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </nav>
        {tab === "questions" && (
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
        )}
        <div className="ml-auto flex items-center gap-3">
          <p
            role="status"
            className={clsx(
              "flex items-center gap-1.5 text-sm",
              state === "unsaved" ? "font-medium text-warning" : "text-muted",
            )}
          >
            {state === "saved" && <Check className="size-4 text-success" aria-hidden />}
            {saveText[state]}
          </p>
          <Button onClick={onSave} disabled={state === "saving"}>
            {state === "saving" ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </>
  );
}
