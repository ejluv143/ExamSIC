"use client";

import Link from "next/link";
import { Badge, Card, Switch } from "@/components/ui";
import { previewText } from "@/lib/preview-text";
import { subjectAreaLabel } from "@/lib/subjects";
import type { QuizSettings } from "@examinus/domain/quiz";
import type { EditorQuiz } from "@/features/quiz/quiz-editor";
import type { Class } from "@/features/classes/types";

// One slim card: the subject, the description in a line, the three shuffle switches and a note on where the
// anti-cheating rules live. "Edit details" opens the dialog the quiz was created with (owned by the editor).
export function DetailsStrip({
  quiz: a,
  classes,
  onEditDetails,
  onSettings,
}: {
  quiz: EditorQuiz;
  classes: Class[];
  onEditDetails: () => void;
  onSettings: (patch: Partial<QuizSettings>) => void;
}) {
  const area = a.subjectArea ?? "general";
  const course = classes.find((c) => c.courseCode === a.subject);
  const description = previewText(a.description);
  return (
    <Card id="quiz-details" className="scroll-mt-24 space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Badge>{course ? `${course.courseCode} · ${course.title}` : (a.subject ?? "No class")}</Badge>
        <Badge tone="primary">{subjectAreaLabel[area]}</Badge>
        <span className={description ? "min-w-0 flex-1 truncate" : "min-w-0 flex-1 truncate text-muted"} title={description || undefined}>
          {description || "No description yet"}
        </span>
        <button
          type="button"
          onClick={onEditDetails}
          aria-haspopup="dialog"
          className="shrink-0 font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          Edit details
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Switch
          label="Shuffle questions"
          checked={a.settings.shuffleQuestions}
          onChange={(v) => onSettings({ shuffleQuestions: v })}
        />
        <Switch label="Shuffle options" checked={a.settings.shuffleChoices} onChange={(v) => onSettings({ shuffleChoices: v })} />
        <Switch label="Shuffle parts" checked={a.settings.shuffleParts} onChange={(v) => onSettings({ shuffleParts: v })} />
      </div>
      <p className="text-xs text-muted">
        Anti-cheating rules (full screen, tab switches, copy and paste) are set when you start a session
        {a.id === "new" ? (
          "."
        ) : (
          <>
            {" "}
            from the{" "}
            <Link href={`/teacher/assessments/${a.id}`} className="hover:underline">
              quiz&apos;s sessions
            </Link>
            .
          </>
        )}
      </p>
    </Card>
  );
}
