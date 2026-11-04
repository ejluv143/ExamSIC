"use client";

import Link from "next/link";
import { Award, ClipboardList, Layers, ListChecks, Pencil } from "lucide-react";
import { Badge, Button, Card, IconStat, Switch } from "@/components/ui";
import { previewText } from "@examinus/question-kinds-core/preview-text";
import { subjectAreaLabel } from "@/lib/subjects";
import type { QuizSettings } from "@examinus/domain/quiz";
import type { EditorQuiz } from "@/features/quiz/quiz-editor";
import type { Class } from "@/features/classes/types";

// The quiz as a card, in the look of the quiz page's header: its subject, title and description with "Edit details"
// (which opens the dialog the quiz was created with, owned by the editor), the three shuffle switches, a note on
// where the anti-cheating rules live, and the quiz's totals as figures.
export function DetailsStrip({
  quiz: a,
  classes,
  totals,
  onEditDetails,
  onSettings,
}: {
  quiz: EditorQuiz;
  classes: Class[];
  totals: { parts: number; questions: number; points: number };
  onEditDetails: () => void;
  onSettings: (patch: Partial<QuizSettings>) => void;
}) {
  const area = a.subjectArea ?? "general";
  const course = classes.find((c) => c.courseCode === a.subject);
  const description = previewText(a.description);
  return (
    <Card id="quiz-details" className="relative scroll-mt-40">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <div className="absolute -top-24 -right-20 size-72 rounded-full bg-primary-soft opacity-70 blur-3xl" />
      </div>
      <div className="relative space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary shadow-depth">
            <ClipboardList className="size-7" />
          </span>
          <div className="min-w-0 flex-1 basis-56">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{course ? `${course.courseCode} · ${course.title}` : (a.subject ?? "No class")}</Badge>
              <Badge tone="primary">{subjectAreaLabel[area]}</Badge>
            </div>
            <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-balance break-words">{a.title.trim() || "Untitled quiz"}</h2>
            <p className={description ? "mt-1 line-clamp-2 max-w-2xl text-sm text-muted" : "mt-1 text-sm text-muted italic"}>
              {description || "No description yet."}
            </p>
          </div>
          <Button variant="secondary" className="min-h-11" onClick={onEditDetails} aria-haspopup="dialog">
            <Pencil className="size-4" aria-hidden /> Edit details
          </Button>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Shuffling</h3>
          <div className="grid gap-x-6 gap-y-3 rounded-xl border border-border bg-surface-muted/50 p-4 shadow-well sm:grid-cols-3">
            <Switch
              label="Shuffle questions"
              description="Each student gets their own order."
              checked={a.settings.shuffleQuestions}
              onChange={(v) => onSettings({ shuffleQuestions: v })}
            />
            <Switch
              label="Shuffle options"
              description="Choices appear in a different order."
              checked={a.settings.shuffleChoices}
              onChange={(v) => onSettings({ shuffleChoices: v })}
            />
            <Switch
              label="Shuffle parts"
              description="The parts swap places for each student."
              checked={a.settings.shuffleParts}
              onChange={(v) => onSettings({ shuffleParts: v })}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            Anti-cheating rules (full screen, tab switches, copy and paste) are set when you start a session
            {a.id === "new" ? (
              "."
            ) : (
              <>
                {" "}
                from the{" "}
                <Link href={`/teacher/assessments/${a.id}`} className="font-semibold text-primary hover:underline">
                  quiz&apos;s sessions
                </Link>
                .
              </>
            )}
          </p>
        </div>
      </div>
      {/* Hairline dividers between the figures: the gaps show the border colour behind them. */}
      <div
        aria-label="Totals"
        role="group"
        className="relative grid grid-cols-1 gap-px overflow-hidden rounded-b-[inherit] border-t border-border bg-border sm:grid-cols-3"
      >
        <IconStat icon={Layers} label={totals.parts === 1 ? "Part" : "Parts"} value={totals.parts} />
        <IconStat icon={ListChecks} label={totals.questions === 1 ? "Question" : "Questions"} value={totals.questions} tone="info" />
        <IconStat icon={Award} label="Total points" value={totals.points} tone="success" />
      </div>
    </Card>
  );
}
