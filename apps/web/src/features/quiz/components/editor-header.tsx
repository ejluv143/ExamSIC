"use client";

import Link from "next/link";
import clsx from "clsx";
import { Check } from "lucide-react";
import { Button } from "@/components/ui";
import { Menu, type MenuItem } from "@/components/menu";
import { Segmented } from "@/components/segmented";

export type EditorView = "cards" | "table";

export type SaveState = "saved" | "unsaved" | "saving";

const saveText: Record<SaveState, string> = { saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…" };

const saveTone: Record<SaveState, string> = {
  saved: "bg-success-soft text-success",
  unsaved: "bg-warning-soft text-warning",
  saving: "bg-surface-muted text-muted",
};

// What the teacher is looking at: the breadcrumb, the title with the save state and the quiz's totals, and on the
// right the cards/table switch, Save and one "More" menu holding everything else the quiz offers.
export function EditorHeader({
  quizId,
  title,
  totals,
  view,
  state,
  onView,
  onSave,
  items,
}: {
  quizId: string;
  title: string;
  totals: { parts: number; questions: number; points: number };
  view: EditorView;
  state: SaveState;
  onView: (view: EditorView) => void;
  onSave: () => void;
  // The "More" menu: preview, paper layout, details, bulk points, import, bank.
  items: MenuItem[];
}) {
  const name = title.trim() || "Untitled quiz";
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  return (
    <header className="mb-6">
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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{name}</h1>
          <p
            role="status"
            className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", saveTone[state])}
          >
            {state === "saved" && <Check className="size-3.5" aria-hidden />}
            {saveText[state]}
          </p>
          <p className="text-sm text-muted tabular-nums" aria-label="Totals">
            {plural(totals.parts, "part")} · {plural(totals.questions, "question")} · {totals.points} {totals.points === 1 ? "pt" : "pts"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            label="View"
            value={view}
            options={[
              ["cards", "Cards"],
              ["table", "Table"],
            ]}
            onChange={onView}
          />
          <Button variant={state === "unsaved" ? "primary" : "secondary"} onClick={onSave} disabled={state === "saving"}>
            {state === "saving" ? "Saving…" : "Save"}
          </Button>
          <Menu label="More" items={items} />
        </div>
      </div>
    </header>
  );
}
