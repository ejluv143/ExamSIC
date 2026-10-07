"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { ModeBadge, StatusBadge } from "@/components/assessment-bits";
import { retakesLabel } from "@/lib/attempts";
import { formatDateTime } from "@/lib/format";
import type { SessionListItem } from "@examora/contract";
import type { Class } from "@/lib/types";
import {
  endSessionAction,
  releaseResultsAction,
  removeSessionAction,
  sessionStudentsAction,
  startSessionAction,
} from "../actions";
import { SessionForm, type RosterStudent } from "./session-form";

type Editing = { item: SessionListItem; studentIds: readonly string[] };

function schedule(item: SessionListItem) {
  const { opensAt, closesAt, status } = item.session;
  if (!opensAt) return status === "scheduled" ? "Starts when you press Start" : "Started by hand";
  return `${formatDateTime(opensAt)} – ${closesAt ? formatDateTime(closesAt) : "until you end it"}`;
}

export function SessionList({
  quizId,
  items,
  classes,
  students,
  defaultClassId,
}: {
  quizId: string;
  items: readonly SessionListItem[];
  classes: Class[];
  students: RosterStudent[];
  defaultClassId?: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));

  async function run(id: string, action: () => Promise<{ error: string } | object>) {
    setBusy(id);
    setError(null);
    const result = await action();
    setBusy(null);
    if ("error" in result) setError(String(result.error));
    else router.refresh();
  }

  async function edit(item: SessionListItem) {
    setBusy(item.session.id);
    const studentIds = await sessionStudentsAction(item.session.id);
    setBusy(null);
    if (!studentIds) {
      setError("That session no longer exists.");
      return;
    }
    setCreating(false);
    setEditing({ item, studentIds });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Sessions"
          description="Each time you run this quiz for a class is one session."
          action={
            !creating && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setCreating(true);
                }}
                disabled={classes.length === 0}
              >
                <Plus className="size-4" aria-hidden /> Start a session
              </Button>
            )
          }
        />
        {error && (
          <p role="alert" className="mx-5 mt-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
        {items.length === 0 ? (
          <EmptyState title="No sessions yet">Start a session to give this quiz to a class.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const { session, submittedCount, studentCount, needsGrading } = item;
              const c = session.classId ? classById[session.classId] : undefined;
              const base = `/teacher/assessments/${quizId}/sessions/${session.id}`;
              const disabled = busy === session.id;
              return (
                <li key={session.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ModeBadge mode={session.mode} />
                    <StatusBadge status={session.status} />
                    <span className="font-medium">{c ? `${c.courseCode} ${c.section}` : "No class"}</span>
                    {c && <span className="text-sm text-muted">{c.title}</span>}
                  </div>
                  <p className="text-sm text-muted">
                    {schedule(item)}
                    {session.timeLimitMinutes ? ` · ${session.timeLimitMinutes} min` : ""} · {retakesLabel(session.attemptsAllowed)}
                  </p>
                  <p className="text-sm">
                    <span className="tabular-nums">
                      {submittedCount} / {studentCount}
                    </span>{" "}
                    submitted
                    {needsGrading > 0 && (
                      <span className="text-warning"> · {needsGrading} need grading</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {session.status === "scheduled" && (
                      <Button disabled={disabled} onClick={() => run(session.id, () => startSessionAction(session.id))}>
                        Start now
                      </Button>
                    )}
                    {session.status === "running" && (
                      <Button
                        variant="secondary"
                        disabled={disabled}
                        onClick={() => {
                          if (window.confirm("End it now? Attempts still in progress are submitted."))
                            run(session.id, () => endSessionAction(session.id));
                        }}
                      >
                        End
                      </Button>
                    )}
                    {session.resultsRelease === "manual" && session.status !== "scheduled" && (
                      <Button
                        variant="secondary"
                        disabled={disabled}
                        onClick={() => run(session.id, () => releaseResultsAction(session.id, !session.resultsReleased))}
                      >
                        {session.resultsReleased ? "Hide results" : "Release results"}
                      </Button>
                    )}
                    <ButtonLink href={base} variant="secondary">
                      Results
                    </ButtonLink>
                    {needsGrading > 0 && (
                      <ButtonLink href={`/teacher/grading/${session.id}`} variant="secondary">
                        Grade
                      </ButtonLink>
                    )}
                    <ButtonLink href={`${base}/integrity`} variant="secondary">
                      Anti-cheat
                    </ButtonLink>
                    {session.status !== "ended" && (
                      <Button variant="secondary" disabled={disabled} onClick={() => edit(item)}>
                        Edit session
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      disabled={disabled}
                      onClick={() => {
                        if (window.confirm("Delete this session and all students' attempts? This can't be undone."))
                          run(session.id, () => removeSessionAction(session.id));
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {classes.length === 0 && (
        <p className="text-sm text-muted">
          You have no classes yet.{" "}
          <Link href="/teacher/classes" className="underline hover:text-foreground">
            Sync from Classroom
          </Link>{" "}
          to start a session.
        </p>
      )}

      {creating && (
        <SessionForm
          quizId={quizId}
          classes={classes}
          students={students}
          defaultClassId={defaultClassId}
          onDone={() => setCreating(false)}
        />
      )}
      {editing && (
        <SessionForm
          key={editing.item.session.id}
          quizId={quizId}
          classes={classes}
          students={students}
          session={editing.item.session}
          studentIds={editing.studentIds}
          onDone={() => setEditing(null)}
        />
      )}
    </div>
  );
}
