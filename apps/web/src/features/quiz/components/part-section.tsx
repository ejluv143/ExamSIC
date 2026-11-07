"use client";

import { useContext, useId, useState, type DragEventHandler, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ListChecks, Pencil, Settings2, Trash2 } from "lucide-react";
import { Badge, Button, Card, inputBase, inputClass, Switch } from "@/components/ui";
import { Menu, type MenuItem } from "@/components/menu";
import { MarkdownEditor } from "@/components/markdown-editor";
import { previewText } from "@examinus/domain/markdown";
import { partTotals, poolPoints, type EditorPart } from "@/features/quiz/quiz-editor";
import { partLabel, partName, roman } from "@examinus/copy/paper";
import { EditorAssetUrls } from "@/components/question-kinds/shared/editor-image-field";
import { validPoints } from "./points-dialog";

export type DeleteMode = "move" | "remove";

const pts = (n: number) => `${n} ${n === 1 ? "pt" : "pts"}`;

// One part of the quiz as its own section: its number and title, instructions, totals, the questions in it, and
// the part's own settings (shuffle, pool) behind "Part settings".
export function PartSection({
  part,
  index,
  count,
  moveTarget,
  dropActive,
  onDragOver,
  onDragLeave,
  onDrop,
  onChange,
  onPool,
  onPoolPoints,
  onMove,
  onDelete,
  children,
  footer,
}: {
  part: EditorPart;
  index: number;
  count: number;
  // The title of the part its questions move to when it is deleted; undefined if there is no other part.
  moveTarget: string | undefined;
  dropActive: boolean;
  onDragOver: DragEventHandler<HTMLElement>;
  onDragLeave: DragEventHandler<HTMLElement>;
  onDrop: DragEventHandler<HTMLElement>;
  onChange: (part: EditorPart) => void;
  onPool: (on: boolean) => void;
  onPoolPoints: (points: number) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: (mode: DeleteMode) => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const assetUrls = useContext(EditorAssetUrls);
  const settingsId = useId();
  const [confirming, setConfirming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [pointsDraft, setPointsDraft] = useState<string>();
  const totals = partTotals(part);
  const pool = part.poolSize !== null;
  const n = part.questions.length;
  const label = partName(part.title, index + 1);
  const unequal = pool && new Set(part.questions.map((q) => q.points)).size > 1;
  const editingTitle = renaming || !part.title.trim();
  const instructions = previewText(part.instructions);

  function setPoolPoints(raw: string) {
    setPointsDraft(raw);
    const value = Number(raw);
    if (raw !== "" && validPoints(value)) onPoolPoints(value);
  }

  const menu: MenuItem[] = [
    { label: "Rename", icon: Pencil, onSelect: () => setRenaming(true) },
    { label: "Move up", icon: ArrowUp, disabled: index === 0, onSelect: () => onMove(-1) },
    { label: "Move down", icon: ArrowDown, disabled: index === count - 1, onSelect: () => onMove(1) },
    {
      label: count === 1 ? "Delete (a quiz needs a part)" : "Delete part",
      icon: Trash2,
      danger: true,
      disabled: count === 1,
      onSelect: () => (n === 0 ? onDelete("remove") : setConfirming(true)),
    },
  ];

  return (
    <section
      id={`part-${part.id}`}
      aria-label={`${partLabel(index + 1)}: ${label}`}
      className="scroll-mt-40"
    >
      {/* A part is one card: its header over its questions, with the add buttons under them. */}
      <Card
        className={clsx(dropActive && "outline-2 outline-offset-2 outline-primary")}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="space-y-3 rounded-t-xl border-b border-border bg-surface-muted/40 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <span
              aria-hidden
              className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-depth"
            >
              <span className="text-[11px] leading-none font-bold tracking-wide uppercase opacity-80">Part</span>
              <span className="mt-0.5 text-lg leading-none font-bold">{roman(index + 1)}</span>
            </span>
            <div className="min-w-0 flex-1 basis-40">
              {editingTitle ? (
                <input
                  value={part.title}
                  autoFocus={renaming}
                  onChange={(e) => onChange({ ...part, title: e.target.value })}
                  onBlur={() => setRenaming(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") {
                      e.preventDefault();
                      setRenaming(false);
                    }
                  }}
                  aria-label={`Title of part ${index + 1}`}
                  placeholder="Part title, e.g. Multiple choice"
                  className={clsx(inputClass, "min-h-11 font-semibold")}
                />
              ) : (
                <h3 className="text-lg leading-snug font-bold">
                  <button
                    type="button"
                    onClick={() => setRenaming(true)}
                    title="Rename"
                    className="max-w-full truncate rounded text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {part.title}
                  </button>
                </h3>
              )}
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 tabular-nums" aria-live="polite">
                <Badge>
                  {totals.questionCount} {totals.questionCount === 1 ? "question" : "questions"}
                </Badge>
                <Badge tone="primary">{pts(totals.totalPoints)}</Badge>
                {pool && <Badge tone="info">Pool: draws {totals.questionCount} of {n}</Badge>}
                {part.shuffleQuestions && <Badge tone="success">Shuffled</Badge>}
              </p>
              {!settingsOpen && instructions && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{instructions}</p>}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Button
                variant={settingsOpen ? "secondary" : "ghost"}
                className="min-h-11"
                aria-expanded={settingsOpen}
                aria-controls={settingsOpen ? settingsId : undefined}
                onClick={() => setSettingsOpen(!settingsOpen)}
              >
                <Settings2 className="size-4" aria-hidden /> Settings
              </Button>
              <Menu label={`${label} actions`} items={menu} />
            </div>
          </div>

          {confirming && (
            <div role="alertdialog" aria-label={`Delete ${label}`} className="space-y-3 rounded-lg bg-danger-soft p-3 text-sm">
              <p className="text-danger">
                {label} has {n} {n === 1 ? "question" : "questions"}. What should happen to them?
              </p>
              <div className="flex flex-wrap gap-2">
                {moveTarget !== undefined && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setConfirming(false);
                      onDelete("move");
                    }}
                  >
                    Move them to {moveTarget.trim() || "the neighbouring part"}
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirming(false);
                    onDelete("remove");
                  }}
                >
                  Delete part and its questions
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {settingsOpen && (
            <div id={settingsId} className="space-y-4 rounded-xl border border-border bg-surface p-4">
              <div>
                <p className="mb-1.5 text-sm font-medium">Instructions</p>
                <MarkdownEditor
                  value={part.instructions}
                  onChange={(instructions) => onChange({ ...part, instructions })}
                  label={`Instructions of ${label}`}
                  rows={3}
                  assetUrls={assetUrls}
                  images
                  placeholder="e.g. Choose the letter of the best answer."
                />
                <p className="mt-1 text-xs text-muted">
                  Printed under the part title and shown to students before its questions.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Switch
                  label="Shuffle questions in this part"
                  description="Each student sees this part's questions in their own order."
                  checked={part.shuffleQuestions}
                  onChange={(v) => onChange({ ...part, shuffleQuestions: v })}
                />
                <Switch
                  label="Pool: draw some of the questions"
                  description="Write more questions than students answer. Each student gets a random selection."
                  checked={pool}
                  onChange={onPool}
                />
              </div>

              {pool && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <label className="flex items-center gap-2">
                      Draw
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={part.poolSize ?? 1}
                        onChange={(e) =>
                          onChange({ ...part, poolSize: e.target.value === "" ? 1 : Math.max(1, Math.trunc(Number(e.target.value))) })
                        }
                        aria-label={`Questions drawn from ${label}`}
                        className={clsx(inputBase, "w-20 py-1 text-right tabular-nums")}
                      />
                      of {n}
                    </label>
                    <label className="flex items-center gap-2">
                      Points per question
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={pointsDraft ?? poolPoints(part)}
                        onChange={(e) => setPoolPoints(e.target.value)}
                        onBlur={() => setPointsDraft(undefined)}
                        aria-label={`Points per question in ${label}`}
                        className={clsx(inputBase, "w-20 py-1 text-right tabular-nums")}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-muted">
                    Each student gets a random {part.poolSize} of these {n} questions, all worth the same points.
                  </p>
                  {part.poolSize !== null && part.poolSize > n && (
                    <p role="alert" className="text-xs text-danger">
                      The pool draws more questions than the part has. Add questions or lower the number.
                    </p>
                  )}
                  {unequal && (
                    <p role="alert" className="text-xs text-danger">
                      Questions in a pool need equal points. Set “Points per question” to fix it.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {n === 0 ? (
          <div className="m-3 grid place-items-center gap-1 rounded-xl border-2 border-dashed border-border px-4 py-8 text-center sm:m-4">
            <ListChecks className="size-6 text-muted" aria-hidden />
            <p className="font-semibold">No questions yet</p>
            <p className="text-sm text-muted">Add one below or drag a question here.</p>
          </div>
        ) : (
          <div className="space-y-2 p-3 sm:p-4">{children}</div>
        )}
        <div className="rounded-b-xl border-t border-border bg-surface-muted/40 px-4 py-3 sm:px-5">{footer}</div>
      </Card>
    </section>
  );
}
