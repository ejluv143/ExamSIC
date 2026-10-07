"use client";

import { useContext, useState } from "react";
import { Pencil, Printer } from "lucide-react";
import { Button, Card, CardHeader, Switch } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { questionTypeLabel } from "@/lib/format";
import { questionTypesFor, subjectAreaLabel } from "@/lib/subjects";
import type { QuizSettings } from "@examora/contract";
import type { EditorQuiz } from "@/lib/quiz-editor";
import type { Class } from "@/lib/types";
import { EditorAssetUrls } from "./image-field";
import { QuizDetailsDialog, type QuizDetails } from "./quiz-details-dialog";

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return <Switch label={label} description={hint} checked={checked} onChange={onChange} />;
}

// The quiz's title, subject, description and shuffle settings in a card of their own. "Edit details" reopens the
// dialog the quiz was created with.
export function DetailsCard({
  quiz: a,
  classes,
  onDetails,
  onOpenPaper,
  onSettings,
}: {
  quiz: EditorQuiz;
  classes: Class[];
  onDetails: (details: QuizDetails) => void;
  onSettings: (patch: Partial<QuizSettings>) => void;
  onOpenPaper: () => void;
}) {
  const assetUrls = useContext(EditorAssetUrls);
  const [open, setOpen] = useState(false);
  const area = a.subjectArea ?? "general";
  const course = classes.find((c) => c.courseCode === a.subject);
  return (
    <section id="quiz-details" aria-label="Quiz details" className="scroll-mt-24">
      <Card>
        <CardHeader
          title="Quiz details"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={onOpenPaper} aria-haspopup="dialog">
                <Printer className="size-4" aria-hidden /> Test paper layout
              </Button>
              <Button variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog">
                <Pencil className="size-4" aria-hidden /> Edit details
              </Button>
            </div>
          }
        />
        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_20rem]">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted">Title</dt>
              <dd className={a.title.trim() ? "font-medium" : "italic text-danger"}>{a.title.trim() || "No title yet"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">Subject</dt>
              <dd>
                {course ? `${course.courseCode} · ${course.title} (${subjectAreaLabel[area]})` : a.subject ? `${a.subject} (${subjectAreaLabel[area]})` : `${subjectAreaLabel[area]} (no class)`}
                <span className="block text-xs text-muted">
                  Question types: {questionTypesFor[area].map((t) => questionTypeLabel[t]).join(", ")}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">Description</dt>
              <dd>
                {a.description.trim() ? (
                  <Markdown assetUrls={assetUrls}>{a.description}</Markdown>
                ) : (
                  <span className="text-muted">None. Shown to students before they start.</span>
                )}
              </dd>
            </div>
          </dl>
          <div className="space-y-3 rounded-xl border border-border p-4">
            <p className="text-sm font-medium">Shuffling</p>
            <Toggle
              label="Shuffle question order"
              hint="Each student gets the questions in their own order."
              checked={a.settings.shuffleQuestions}
              onChange={(v) => onSettings({ shuffleQuestions: v })}
            />
            <Toggle
              label="Shuffle choices"
              hint="Multiple-choice options appear in a different order per student."
              checked={a.settings.shuffleChoices}
              onChange={(v) => onSettings({ shuffleChoices: v })}
            />
            <Toggle
              label="Shuffle order of parts"
              hint="Each student gets the parts in their own order."
              checked={a.settings.shuffleParts}
              onChange={(v) => onSettings({ shuffleParts: v })}
            />
            <p className="text-xs text-muted">
              Each part can also shuffle its own questions or draw a pool. The schedule, time limit and anti-cheating
              rules are set when you start a session.
            </p>
          </div>
        </div>
      </Card>
      <QuizDetailsDialog
        open={open}
        onClose={() => setOpen(false)}
        classes={classes}
        title="Quiz details"
        submitLabel="Save details"
        assetUrls={assetUrls}
        initial={{
          title: a.title,
          description: a.description,
          ...(a.subject ? { subject: a.subject } : {}),
          subjectArea: area,
        }}
        onSubmit={(d) => onDetails(d)}
      />
    </section>
  );
}
