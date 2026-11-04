"use client";

import clsx from "clsx";
import { ArrowLeft, CircleAlert, CircleCheck, LayoutList, LoaderCircle, Printer, Save, Table2 } from "lucide-react";
import { Button, ButtonLink, Card, segmentClass, segmentGroupClass } from "@/components/ui";
import { Menu, type MenuItem } from "@/components/menu";

export type EditorView = "cards" | "table";

export type SaveState = "saved" | "unsaved" | "saving";

const saveText: Record<SaveState, string> = { saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…" };

const saveTone: Record<SaveState, string> = {
  saved: "bg-success-soft text-success",
  unsaved: "bg-warning-soft text-warning",
  saving: "bg-surface-muted text-muted",
};

const views = [
  { key: "cards", label: "Cards", icon: LayoutList },
  { key: "table", label: "Table", icon: Table2 },
] as const;

// The editor's sticky bar: back to the quiz, its title with the save state, and on the right the cards/table switch,
// the test paper, Save and one "More" menu holding everything else the quiz offers. It stays in view while the
// teacher scrolls, so the save state and Save are never out of reach.
export function EditorHeader({
  quizId,
  title,
  totals,
  view,
  state,
  onView,
  onSave,
  onPaper,
  items,
}: {
  quizId: string;
  title: string;
  totals: { parts: number; questions: number; points: number };
  view: EditorView;
  state: SaveState;
  onView: (view: EditorView) => void;
  onSave: () => void;
  onPaper: () => void;
  // The "More" menu: preview, paper layout, details, bulk points, import, bank.
  items: MenuItem[];
}) {
  const name = title.trim() || "Untitled quiz";
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const isNew = quizId === "new";
  const StateIcon = state === "saved" ? CircleCheck : state === "saving" ? LoaderCircle : CircleAlert;
  // Below lg the app's own top bar is sticky too, so this one sits under it.
  return (
    <header className="sticky z-20 mb-6 max-lg:top-14 lg:top-3">
      <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2 shadow-md sm:px-3">
        <ButtonLink
          href={isNew ? "/teacher/assessments" : `/teacher/assessments/${quizId}`}
          variant="ghost"
          aria-label={isNew ? "Back to quizzes and exams" : "Back to the quiz"}
          className="min-h-11 min-w-11 px-0 sm:px-3"
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">{isNew ? "Quizzes" : "Quiz"}</span>
        </ButtonLink>

        <div className="min-w-0 flex-1 basis-40">
          <h1 title={name} className="truncate text-lg leading-tight font-bold tracking-tight">
            {name}
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p
              role="status"
              className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", saveTone[state])}
            >
              <StateIcon className={clsx("size-3.5", state === "saving" && "motion-safe:animate-spin")} aria-hidden />
              {saveText[state]}
            </p>
            <p className="hidden text-xs text-muted tabular-nums sm:block" aria-label="Totals">
              {plural(totals.parts, "part")} · {plural(totals.questions, "question")} · {totals.points} {totals.points === 1 ? "pt" : "pts"}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div role="radiogroup" aria-label="View" className={clsx(segmentGroupClass, "!flex-nowrap")}>
            {views.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={view === key}
                onClick={() => onView(key)}
                className={clsx(segmentClass(view === key), "min-h-9 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary")}
              >
                <Icon className="size-4" aria-hidden />
                <span className="max-sm:sr-only">{label}</span>
              </button>
            ))}
          </div>
          {/* A wrapper hides it: the button's own inline-flex would win over `hidden`. Phones find it in More. */}
          <span className="hidden md:block">
            <Button variant="secondary" className="min-h-11" onClick={onPaper}>
              <Printer className="size-4" aria-hidden /> Test paper
            </Button>
          </span>
          <Button variant={state === "unsaved" ? "primary" : "secondary"} className="min-h-11" onClick={onSave} disabled={state === "saving"}>
            <Save className="size-4" aria-hidden />
            {state === "saving" ? "Saving…" : "Save"}
          </Button>
          <Menu label="More" items={items} />
        </div>
      </Card>
    </header>
  );
}
