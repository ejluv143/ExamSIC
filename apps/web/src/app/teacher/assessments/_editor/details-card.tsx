"use client";

import { useContext, useState } from "react";
import { BookOpen, GraduationCap, Pencil, Printer, Shuffle } from "lucide-react";
import { Button, Card, Switch } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { QuestionTypeBadge } from "@/lib/question-style";
import { questionTypesFor, subjectAreaLabel } from "@/lib/subjects";
import { blankModes, type QuizSettings } from "@examora/contract";
import type { EditorQuiz } from "@/lib/quiz-editor";
import type { Class } from "@/lib/types";
import { EditorAssetUrls } from "./image-field";
import { QuizDetailsDialog, type QuizDetails } from "./quiz-details-dialog";

// A small caption above a block of the card: what the block is, never louder than the content.
function Label({ children }: { children: string }) {
  return <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{children}</h3>;
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
    <section id="quiz-details" aria-labelledby="quiz-details-title" className="scroll-mt-24">
      <Card className="overflow-hidden">
        {/* Title block: the quiz's name is the headline; subject and class are chips under it. */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0 space-y-2">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Quiz details</p>
            <h2
              id="quiz-details-title"
              className={a.title.trim() ? "text-xl font-semibold text-balance" : "text-xl font-semibold italic text-danger"}
            >
              {a.title.trim() || "No title yet"}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1">
                <BookOpen className="size-3.5 text-muted" aria-hidden />
                {course ? (
                  <>
                    <span className="font-medium">{course.courseCode}</span>
                    <span className="text-muted">{course.title}</span>
                  </>
                ) : (
                  <span className="font-medium">{a.subject ?? "No class"}</span>
                )}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-primary">
                <GraduationCap className="size-3.5" aria-hidden />
                {subjectAreaLabel[area]}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={onOpenPaper} aria-haspopup="dialog">
              <Printer className="size-4" aria-hidden /> Test paper layout
            </Button>
            <Button variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog">
              <Pencil className="size-4" aria-hidden /> Edit details
            </Button>
          </div>
        </header>

        <div className="grid lg:grid-cols-[1fr_22rem]">
          <div className="space-y-6 px-6 py-5">
            <div className="space-y-2">
              <Label>Description</Label>
              {a.description.trim() ? (
                <div className="text-sm leading-relaxed">
                  <Markdown assetUrls={assetUrls}>{a.description}</Markdown>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  No description yet. It&apos;s shown to students before they start.{" "}
                  <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    Add one
                  </button>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Question types offered</Label>
              <div className="flex flex-wrap gap-1.5">
                {/* Blank questions come in two kinds, listed as the Add question menu lists them. */}
                {questionTypesFor[area].flatMap((t) =>
                  t === "blank"
                    ? blankModes.map((mode) => <QuestionTypeBadge key={`blank-${mode}`} type="blank" mode={mode} />)
                    : [<QuestionTypeBadge key={t} type={t} />],
                )}
              </div>
              <p className="text-xs text-muted">Set by the subject area. The Add question menu can still show every type.</p>
            </div>
          </div>

          <aside aria-labelledby="shuffling-title" className="space-y-4 border-t border-border bg-surface-muted/40 px-6 py-5 lg:border-t-0 lg:border-l">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-md bg-primary-soft text-primary">
                <Shuffle className="size-4" aria-hidden />
              </span>
              <h3 id="shuffling-title" className="text-sm font-semibold">
                Shuffling
              </h3>
            </div>
            <div className="space-y-3">
              <Switch
                label="Question order"
                description="Each student gets the questions in their own order."
                checked={a.settings.shuffleQuestions}
                onChange={(v) => onSettings({ shuffleQuestions: v })}
              />
              <Switch
                label="Choices"
                description="Multiple-choice options appear in a different order per student."
                checked={a.settings.shuffleChoices}
                onChange={(v) => onSettings({ shuffleChoices: v })}
              />
              <Switch
                label="Order of parts"
                description="Each student gets the parts in their own order."
                checked={a.settings.shuffleParts}
                onChange={(v) => onSettings({ shuffleParts: v })}
              />
            </div>
            <p className="border-t border-border pt-3 text-xs text-muted">
              Parts can also shuffle their own questions or draw a pool. The schedule, time limit and anti-cheating rules
              are set when you start a session.
            </p>
          </aside>
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
