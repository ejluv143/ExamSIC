import Link from "next/link";
import { Clock } from "lucide-react";
import { KindBadge } from "@/components/assessment-bits";
import { ButtonLink } from "@/components/ui";
import type { getMyAssessments, getMyClasses } from "@/lib/data/student";
import { formatDateTime } from "@/lib/format";

export type Item = Awaited<ReturnType<typeof getMyAssessments>>[number];
export type MyClass = Awaited<ReturnType<typeof getMyClasses>>[number];
export type Bucket = "todo" | "upcoming" | "done";

// To do: open with attempts left. Done: submitted, used up, or closed.
export function bucketOf(i: Item): Bucket {
  if (i.availability === "open" && i.attemptsUsed < i.attemptsAllowed) return "todo";
  if (i.availability === "upcoming") return "upcoming";
  return "done";
}

export function classNames(item: Item, classes: MyClass[]) {
  return classes
    .filter((c) => item.classIds.includes(c.id))
    .map((c) => `${c.courseCode} · ${c.section}`)
    .join(", ");
}

// One quiz or exam with what the student can do next: start it, wait for it, or see the score.
export function AssessmentRow({ item: i, classes }: { item: Item; classes: MyClass[] }) {
  const bucket = bucketOf(i);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{i.title}</p>
          <KindBadge kind={i.kind} />
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {classNames(i, classes)} ·{" "}
          {bucket === "todo" ? (
            <>
              {i.closesAt ? `Closes ${formatDateTime(i.closesAt)}` : "No deadline"}
              {i.timeLimitMinutes && ` · ${i.timeLimitMinutes} min`}
              {i.attemptsAllowed > 1 && ` · attempt ${i.attemptsUsed + 1} of ${i.attemptsAllowed}`}
            </>
          ) : bucket === "upcoming" ? (
            <>
              Opens {formatDateTime(i.opensAt)}
              {i.timeLimitMinutes && ` · ${i.timeLimitMinutes} min`} · {i.questionCount} questions
            </>
          ) : i.attemptsUsed === 0 ? (
            <span className="text-danger">Not submitted</span>
          ) : (
            <>Submitted {formatDateTime(i.lastSubmittedAt)}</>
          )}
        </p>
      </div>
      {bucket === "todo" && (
        <ButtonLink href={`/student/assessments/${i.id}`}>
          {i.attemptsUsed > 0 ? "Try again" : `Start ${i.kind}`}
        </ButtonLink>
      )}
      {bucket === "done" && i.attemptsUsed > 0 && (
        <Link
          href={`/student/assessments/${i.id}/result`}
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
