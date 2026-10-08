import Link from "next/link";
import { Clock } from "lucide-react";
import { ModeBadge } from "@/components/assessment-bits";
import { ButtonLink } from "@/components/ui";
import type { MySessionItem } from "@examora/contract";
import type { Class } from "@/lib/types";
import { attemptLabel, hasAttemptsLeft } from "@/lib/attempts";
import { formatDateTime } from "@/lib/format";
import { availability, modeLabel } from "@/lib/sessions";

export type Item = MySessionItem;
export type MyClass = Class;
export type Bucket = "todo" | "upcoming" | "done";

// To do: open with attempts left. Done: submitted, used up, or closed.
export function bucketOf(i: Item): Bucket {
  // A game is joined from its lobby, or while it runs.
  if (i.session.mode === "game" && (i.session.status === "lobby" || i.session.status === "running")) return "todo";
  const when = availability(i.session.status);
  if (when === "open" && hasAttemptsLeft(i.attemptsUsed, i.session.attemptsAllowed)) return "todo";
  if (when === "upcoming") return "upcoming";
  return "done";
}

export function classNames(item: Item, classes: MyClass[]) {
  return classes
    .filter((c) => c.id === item.session.classId)
    .map((c) => `${c.courseCode} · ${c.section}`)
    .join(", ");
}

// One quiz or exam with what the student can do next: start it, wait for it, or see the score.
export function AssessmentRow({ item: i, classes }: { item: Item; classes: MyClass[] }) {
  const bucket = bucketOf(i);
  const s = i.session;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{i.quizTitle}</p>
          <ModeBadge mode={s.mode} />
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {classNames(i, classes)} ·{" "}
          {bucket === "todo" ? (
            <>
              {s.closesAt ? `Closes ${formatDateTime(s.closesAt)}` : "No deadline"}
              {s.timeLimitMinutes && ` · ${s.timeLimitMinutes} min`}
              {s.attemptsAllowed !== 1 && ` · ${attemptLabel(i.attemptsUsed + (i.inProgress ? 0 : 1), s.attemptsAllowed)}`}
            </>
          ) : bucket === "upcoming" ? (
            <>
              Opens {formatDateTime(s.opensAt)}
              {s.timeLimitMinutes && ` · ${s.timeLimitMinutes} min`} · {i.questionCount} questions
            </>
          ) : i.attemptsUsed === 0 ? (
            <span className="text-danger">Not submitted</span>
          ) : (
            <>Submitted {formatDateTime(i.lastSubmittedAt)}</>
          )}
        </p>
        {bucket === "todo" && s.mode === "exam" && (
          <p className="mt-0.5 text-xs text-muted">
            Needs a computer with one screen. You check your device and accept the honor pledge before you start.
          </p>
        )}
      </div>
      {bucket === "todo" && (
        <ButtonLink href={s.mode === "game" ? `/student/game/${s.id}` : `/student/assessments/${s.id}`}>
          {s.mode === "game" ? "Join game" : i.inProgress ? "Continue" : i.attemptsUsed > 0 ? "Try again" : `Start ${modeLabel(s.mode).toLowerCase()}`}
        </ButtonLink>
      )}
      {bucket === "done" && i.lastSubmittedAt && (
        <Link
          href={s.mode === "game" ? `/student/game/${s.id}/results` : `/student/assessments/${s.id}/result`}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-muted"
        >
          {i.result ? (
            <span className="font-semibold tabular-nums">
              {i.result.score} <span className="font-normal text-muted">/ {i.result.max}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted">
              <Clock className="size-4" aria-hidden /> Score not out yet
            </span>
          )}
          <span aria-hidden>→</span>
        </Link>
      )}
    </li>
  );
}
