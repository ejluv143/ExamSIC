import clsx from "clsx";
import {
  ArrowDownUp,
  ArrowLeftRight,
  Brush,
  Code2,
  Crosshair,
  Database,
  Hash,
  LayoutGrid,
  ListChecks,
  ListOrdered,
  PenLine,
  TextCursorInput,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";
import type { BlankMode, QuestionType } from "@examora/contract";
import { questionLabel } from "./format";

// One look per question type: an icon and a soft colour. Classes are written out in full so Tailwind finds them.
export const questionStyle: Record<QuestionType, { icon: LucideIcon; soft: string; text: string }> = {
  multiple_choice: { icon: ListChecks, soft: "bg-violet-100 dark:bg-violet-500/20", text: "text-violet-800 dark:text-violet-200" },
  true_false: { icon: ToggleRight, soft: "bg-sky-100 dark:bg-sky-500/20", text: "text-sky-800 dark:text-sky-200" },
  blank: { icon: TextCursorInput, soft: "bg-blue-100 dark:bg-blue-500/20", text: "text-blue-800 dark:text-blue-200" },
  matching: { icon: ArrowLeftRight, soft: "bg-teal-100 dark:bg-teal-500/20", text: "text-teal-800 dark:text-teal-200" },
  enumeration: { icon: ListOrdered, soft: "bg-amber-100 dark:bg-amber-500/20", text: "text-amber-900 dark:text-amber-200" },
  numeric: { icon: Hash, soft: "bg-orange-100 dark:bg-orange-500/20", text: "text-orange-800 dark:text-orange-200" },
  essay: { icon: PenLine, soft: "bg-rose-100 dark:bg-rose-500/20", text: "text-rose-800 dark:text-rose-200" },
  drawing: { icon: Brush, soft: "bg-pink-100 dark:bg-pink-500/20", text: "text-pink-800 dark:text-pink-200" },
  code: { icon: Code2, soft: "bg-indigo-100 dark:bg-indigo-500/20", text: "text-indigo-800 dark:text-indigo-200" },
  sql: { icon: Database, soft: "bg-emerald-100 dark:bg-emerald-500/20", text: "text-emerald-800 dark:text-emerald-200" },
  categorization: { icon: LayoutGrid, soft: "bg-cyan-100 dark:bg-cyan-500/20", text: "text-cyan-800 dark:text-cyan-200" },
  ordering: { icon: ArrowDownUp, soft: "bg-fuchsia-100 dark:bg-fuchsia-500/20", text: "text-fuchsia-800 dark:text-fuchsia-200" },
  hotspot: { icon: Crosshair, soft: "bg-red-100 dark:bg-red-500/20", text: "text-red-800 dark:text-red-200" },
};

// The type's icon in its colour, without a label (the label sits next to it or in a title).
export function QuestionTypeIcon({ type, className }: { type: QuestionType; className?: string }) {
  const { icon: Icon, text } = questionStyle[type];
  return <Icon aria-hidden className={clsx("size-4 shrink-0", text, className)} />;
}

// Icon and label in the type's colour. `label` overrides the default text (e.g. a blank question's mode).
export function QuestionTypeBadge({
  type,
  mode,
  label,
  className,
}: {
  type: QuestionType;
  mode?: BlankMode;
  label?: string;
  className?: string;
}) {
  const { icon: Icon, soft, text } = questionStyle[type];
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        soft,
        text,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label ?? questionLabel({ type, mode })}
    </span>
  );
}
