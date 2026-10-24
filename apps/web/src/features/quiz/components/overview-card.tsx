"use client";

import { useContext, useState } from "react";
import Link from "next/link";
import { BookOpen, GraduationCap, Pencil, ShieldCheck } from "lucide-react";
import { Button, Card, Switch } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { QuestionTypeBadge } from "@/components/question-kinds/question-style";
import { EditorAssetUrls } from "@/components/question-kinds/shared/editor-image-field";
import { questionLabel } from "@/lib/format";
import { subjectAreaLabel } from "@/lib/subjects";
import type { QuizSettings } from "@examinus/domain/quiz";
import { allQuestions, type EditorQuiz } from "@/features/quiz/quiz-editor";
import type { Class } from "@/features/classes/types";
import { QuizDetailsDialog, type QuizDetails } from "./quiz-details-dialog";

const eyebrow = "text-xs font-semibold tracking-wide text-primary uppercase";

// Two cards side by side: what the quiz is (subject, description and the question formats it uses) and how its
// papers are randomised. "Edit details" reopens the dialog the quiz was created with.
export function OverviewCard({
  quiz: a,
  classes,
  onDetails,
  onSettings,
}: {
  quiz: EditorQuiz;
  classes: Class[];
  onDetails: (details: QuizDetails) => void;
  onSettings: (patch: Partial<QuizSettings>) => void;
}) {
  const assetUrls = useContext(EditorAssetUrls);
  const [open, setOpen] = useState(false);
  const area = a.subjectArea ?? "general";
  const course = classes.find((c) => c.courseCode === a.subject);
  // The formats the quiz really has, as the question rows name them (a blank question shows its mode).
  const formats = new Map(allQuestions(a).map((q) => [questionLabel(q), q]));
  return (
    <section id="quiz-details" aria-label="Quiz overview and settings" className="grid scroll-mt-24 gap-6 lg:grid-cols-[3fr_2fr]">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <h2 className={eyebrow}>Quiz overview &amp; subject</h2>
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
          <Button variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog">
            <Pencil className="size-4" aria-hidden /> Edit details
          </Button>
        </div>

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

        <div className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Question formats in this assessment</h3>
          {formats.size > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {[...formats].map(([label, q]) => (
                <QuestionTypeBadge key={label} type={q.type} label={label} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No questions yet.</p>
          )}
        </div>
      </Card>

      <Card className="space-y-4 bg-surface-muted/40 p-5">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-primary-soft text-primary">
            <ShieldCheck className="size-4" aria-hidden />
          </span>
          <h2 className={eyebrow}>Anti-cheating &amp; randomization</h2>
        </div>
        <div className="space-y-3">
          <Switch
            label="Shuffle question order"
            description="Each student gets the questions in their own order."
            checked={a.settings.shuffleQuestions}
            onChange={(v) => onSettings({ shuffleQuestions: v })}
          />
          <Switch
            label="Shuffle answer options"
            description="Multiple-choice options appear in a different order per student."
            checked={a.settings.shuffleChoices}
            onChange={(v) => onSettings({ shuffleChoices: v })}
          />
          <Switch
            label="Shuffle parts"
            description="Each student gets the parts in their own order."
            checked={a.settings.shuffleParts}
            onChange={(v) => onSettings({ shuffleParts: v })}
          />
        </div>
        <p className="border-t border-border pt-3 text-xs text-muted">
          Anti-cheating rules (full screen, tab switches, copy and paste) are set when you start a session
          {a.id === "new" ? "." : (
            <>
              {" "}
              from the{" "}
              <Link href={`/teacher/assessments/${a.id}`} className="font-medium text-primary hover:underline">
                quiz&apos;s sessions
              </Link>
              .
            </>
          )}
        </p>
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
