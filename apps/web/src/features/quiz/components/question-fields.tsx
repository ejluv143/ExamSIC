"use client";

import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { TextEditor } from "@/components/text-editor";
import { Card, Switch } from "@/components/ui";
import type { Question } from "@examinus/domain/question";
import { questionLabel } from "@examinus/copy/question-types";
import { QuestionTypeBadge } from "@/components/question-kinds/question-style";
import { EditorAssetUrls } from "@/components/question-kinds/shared/editor-image-field";
import { PointsInput } from "@/components/question-kinds/shared/editor-fields";
import { BlankSettings } from "@/components/question-kinds/blank/settings";
import { AnswerEditor } from "@/components/question-kinds/views/editor";
import { modelOf } from "@examinus/question-kinds-core/editor-model";
import { TagField } from "@/features/bank/components/tag-combobox";
import { QuestionPreview } from "./question-preview";
import { ScoringSection } from "./scoring-section";
import { EditorTopics } from "./editor-topics";

const pointsLabel = (n: number) => `${n} ${n === 1 ? "pt" : "pts"}`;

// One question as a teacher edits it: what the student sees (the number, the text and the answer area), written in
// place, with its properties (type, points, topic, scoring, explanation) in a popover opened from a bar above it.
// `panes` makes it scroll on its own inside a parent of fixed height (the question editor dialog); without it the
// parent scrolls (the question bank's dialog). A parent that shows `QuestionToolbar` in its own header passes
// `preview`, and the bar above the question is left out.
export function QuestionFields({
  question: q,
  number,
  onChange,
  poolLocked,
  panes,
  preview: previewProp,
}: {
  question: Question;
  number: number;
  onChange: (q: Question) => void;
  // The question is in a pool part: its points are set by the part and can't be edited here.
  poolLocked?: boolean;
  panes?: boolean;
  // Set by a parent that renders the toolbar itself: whether the student's view is shown.
  preview?: boolean;
}) {
  const [ownPreview, setOwnPreview] = useState(false);
  const preview = previewProp ?? ownPreview;
  return (
    <div className={clsx(panes && "h-full overflow-y-auto")}>
      <div className="space-y-3 p-4 sm:p-6">
        {previewProp === undefined && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <QuestionToolbar question={q} number={number} onChange={onChange} poolLocked={poolLocked} preview={ownPreview} onPreview={setOwnPreview} />
          </div>
        )}
        {preview ? <QuestionPreview question={q} number={number} /> : <QuestionCanvas question={q} number={number} onChange={onChange} />}
      </div>
    </div>
  );
}

// The question's Properties button and the "Preview as student" switch.
export function QuestionToolbar({
  question,
  number,
  onChange,
  poolLocked,
  preview,
  onPreview,
}: {
  question: Question;
  number: number;
  onChange: (q: Question) => void;
  poolLocked?: boolean;
  preview: boolean;
  onPreview: (on: boolean) => void;
}) {
  return (
    <>
      <QuestionProperties question={question} number={number} onChange={onChange} poolLocked={poolLocked} />
      <Switch checked={preview} onChange={onPreview} label="Preview as student" className="w-fit items-center gap-2" />
    </>
  );
}

// What students see of the question, edited where it is: the prompt is written as it reads, the answer area is
// the type's editor.
function QuestionCanvas({ question: q, number, onChange }: { question: Question; number: number; onChange: (q: Question) => void }) {
  const assetUrls = useContext(EditorAssetUrls);
  const model = modelOf(q);
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-sm font-bold text-primary tabular-nums shadow-depth">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <TextEditor
            rows={5}
            value={q.prompt}
            onChange={(prompt) => onChange({ ...q, prompt })}
            label={`Question ${number} text`}
            blanks={model.promptBlanks}
            placeholder={typeof model.promptPlaceholder === "function" ? model.promptPlaceholder(q) : model.promptPlaceholder}
            assetUrls={assetUrls}
            images
          />
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <QuestionTypeBadge type={q.type} label={questionLabel(q)} />
            {pointsLabel(q.points)}
          </p>
        </div>
      </div>
      {q.type === "multiple_choice" || q.type === "true_false" ? (
        // The answer is the choices themselves: drawn as the student's list, with no frame around it.
        <AnswerEditor q={q} onChange={onChange} />
      ) : (
        <section className="rounded-lg border border-border bg-surface-muted/40 p-3">
          <h4 className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-semibold">
            Your answer
            <span className="text-xs font-normal text-muted">You set: {model.answer.title.toLowerCase()}</span>
          </h4>
          <AnswerEditor q={q} onChange={onChange} />
        </section>
      )}
    </Card>
  );
}

// The properties: a button with a one-line summary that opens them in a popover (the browser's top layer, so the
// dialog's scrolling never clips it; a click outside or Esc closes it). Selects inside it open their own lists.
function QuestionProperties({
  question: q,
  number,
  onChange,
  poolLocked,
}: {
  question: Question;
  number: number;
  onChange: (q: Question) => void;
  poolLocked?: boolean;
}) {
  const assetUrls = useContext(EditorAssetUrls);
  const topics = useContext(EditorTopics);
  const model = modelOf(q);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ top: 0, left: 0, maxHeight: 480 });
  const partial = model.partialCredit?.applies(q) ?? false;
  const summary = [pointsLabel(q.points), q.topic, partial && q.partialCredit ? "Partial credit" : null].filter(Boolean).join(" · ");

  // The popover's own open state (light dismiss and Esc close it without React), mirrored for aria-expanded.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const onToggle = (e: Event) => setOpen((e as ToggleEvent).newState === "open");
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, []);

  // Under the button, kept on screen: as wide as fits (up to 24rem) and no taller than the room below.
  useEffect(() => {
    if (!open) return;
    const position = () => {
      const r = trigger.current!.getBoundingClientRect();
      const width = Math.min(384, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPlace({ top: r.bottom + 8, left, maxHeight: Math.max(240, window.innerHeight - r.bottom - 24) });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="question-properties"
        onClick={() => panel.current?.togglePopover()}
        className={clsx(
          "inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border px-3 text-left text-sm shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          open ? "border-primary bg-primary-soft" : "border-border bg-surface hover:bg-surface-muted",
        )}
      >
        <SlidersHorizontal className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="font-semibold">Properties</span>
        <span className="min-w-0 truncate text-muted">{summary}</span>
        <ChevronDown className={clsx("size-4 shrink-0 text-muted motion-safe:transition", open && "rotate-180")} aria-hidden />
      </button>
      <div
        ref={panel}
        id="question-properties"
        popover="auto"
        role="dialog"
        aria-label={`Question ${number} properties`}
        style={{ top: place.top, left: place.left, maxHeight: place.maxHeight }}
        className="fixed inset-auto m-0 w-[min(24rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-border bg-surface p-0 text-sm text-foreground shadow-lg"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2">
          <p className="font-bold">Properties</p>
          <button
            type="button"
            onClick={() => panel.current?.hidePopover()}
            aria-label="Close properties"
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="divide-y divide-border">
        <Section title="Question" hint="Its type, worth and topic.">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Type</span>
              <QuestionTypeBadge type={q.type} label={questionLabel(q)} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Points</span>
              <PointsInput value={q.points} readOnly={poolLocked} onChange={(points) => onChange({ ...q, points })} label={`Points for question ${number}`} />
            </div>
            {poolLocked && <p className="-mt-1 text-xs text-muted">Set by the part&apos;s pool.</p>}
            <TagField
              label="Topic"
              value={q.topic ?? ""}
              options={topics}
              placeholder="e.g. Normalization"
              onChange={(topic) => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { topic: _previous, ...without } = q;
                onChange((topic === "" ? without : { ...without, topic }) as Question);
              }}
            />
          </div>
        </Section>
        {q.type === "blank" && (
          <Section title="Type settings">
            <BlankSettings q={q} onChange={onChange} />
          </Section>
        )}
        <Section title="Scoring" hint="How the points are earned and split." defaultOpen={false}>
          <ScoringSection question={q} onChange={onChange} poolLocked={poolLocked} />
        </Section>
        <Section title="Explanation" hint="Shown to students with their results." defaultOpen={q.explanation !== undefined && q.explanation !== ""}>
          <TextEditor
            value={q.explanation ?? ""}
            onChange={(explanation) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { explanation: _previous, ...without } = q;
              onChange((explanation === "" ? without : { ...without, explanation }) as Question);
            }}
            label={`Question ${number} explanation`}
            rows={3}
            assetUrls={assetUrls}
            images
          />
        </Section>
        </div>
      </div>
    </>
  );
}

// One accordion section of the panel.
function Section({
  title,
  hint,
  defaultOpen = true,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 px-4 py-2 text-sm font-bold select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
        <ChevronRight className="size-4 text-muted motion-safe:transition group-open:rotate-90" aria-hidden />
        {title}
      </summary>
      <div className="px-4 pb-4">
        {hint && <p className="-mt-1 mb-3 text-xs text-muted">{hint}</p>}
        {children}
      </div>
    </details>
  );
}
