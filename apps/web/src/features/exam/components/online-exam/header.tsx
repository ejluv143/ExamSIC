import clsx from "clsx";
import { Clock, LayoutGrid } from "lucide-react";
import { countsText } from "../question-navigator";
import { type NavItem } from "@examinus/taking/nav-items";

// The bar that stays on top: title, the questions panel toggles, whether the answers are saved, the time left for
// the exam and, with one question at a time, for the question. Below it, the progress.
export function ExamHeader({
  title,
  items,
  marking,
  answered,
  position,
  panelOpen,
  onOpenSheet,
  onTogglePanel,
  saveState,
  secondsLeft,
  qSecondsLeft,
}: {
  title: string;
  items: readonly NavItem[];
  marking: boolean;
  answered: number;
  // "Question 3 of 10 · " when the questions come one at a time.
  position: string;
  panelOpen: boolean;
  onOpenSheet: () => void;
  onTogglePanel: () => void;
  // Only a student taking it has answers to save.
  saveState: "idle" | "saving" | "saved" | "error" | null;
  secondsLeft: number | null;
  qSecondsLeft: number | null;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-3 mb-4 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur @lg:mx-0 @lg:rounded-xl @lg:border">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate font-semibold">{title || "Untitled"}</p>
        <button
          type="button"
          onClick={onOpenSheet}
          aria-haspopup="dialog"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-muted @5xl:hidden"
        >
          <LayoutGrid className="size-3.5" aria-hidden /> Questions
        </button>
        <button
          type="button"
          onClick={onTogglePanel}
          aria-expanded={panelOpen}
          className="hidden items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-muted @5xl:inline-flex"
        >
          <LayoutGrid className="size-3.5" aria-hidden /> {panelOpen ? "Hide questions" : "Show questions"}
        </button>
        {saveState !== null && saveState !== "idle" && (
          <span aria-live="polite" className={clsx("text-xs", saveState === "error" ? "text-danger" : "text-muted")}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Not saved, check your connection"}
          </span>
        )}
        {secondsLeft !== null && (
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium tabular-nums",
              secondsLeft < 300 ? "bg-danger-soft text-danger" : "bg-surface-muted",
            )}
          >
            <Clock className="size-4" aria-hidden />
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted">
        <div className="h-1.5 flex-1 rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${(answered / Math.max(1, items.length)) * 100}%` }}
          />
        </div>
        <span className="tabular-nums">
          {position}
          {countsText(items, marking)}
        </span>
        {qSecondsLeft !== null && (
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium tabular-nums",
              qSecondsLeft < 10 ? "bg-danger-soft text-danger" : "bg-surface-muted",
            )}
            title="Time left for this question"
          >
            <Clock className="size-3.5" aria-hidden />
            {qSecondsLeft}s
          </span>
        )}
      </div>
    </div>
  );
}
