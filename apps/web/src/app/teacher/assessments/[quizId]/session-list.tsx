"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  Eye,
  EyeOff,
  Pencil,
  Play,
  Plus,
  Radio,
  RotateCcw,
  ShieldCheck,
  Square,
  Timer,
  Trash2,
  Users,
} from "lucide-react";
import type { SessionListItem } from "@examinus/contract/session";
import { Button, ButtonLink, Card } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { Menu, type MenuItem } from "@/components/menu";
import {
  LiveDot,
  ModeBadge,
  SessionStatusPill,
  sessionGroupEdge,
  sessionGroupOf,
  sessionGroupRank,
  sessionGroups,
  type SessionGroup,
} from "@/components/assessment-bits";
import { JoinKey } from "@/components/join-key";
import { sessionRuleChips } from "@/lib/integrity";
import { retakesLabel } from "@/lib/attempts";
import { formatDateTime } from "@/lib/format";
import type { Class } from "@/lib/types";
import {
  endSessionAction,
  releaseResultsAction,
  removeSessionAction,
  sessionSecretsAction,
  startSessionAction,
} from "../actions";
import { SessionForm } from "./session-form";

type Editing = {
  item: SessionListItem;
  roomPassword: string | null;
  ipAllowlist: readonly string[];
  relayPassword: string | null;
  relayClues: readonly string[];
};

function schedule(item: SessionListItem) {
  const { opensAt, closesAt, status } = item.session;
  if (!opensAt) return status === "scheduled" ? "Starts when you press Start" : "Started by hand";
  return `${formatDateTime(opensAt)} – ${closesAt ? formatDateTime(closesAt) : "until you end it"}`;
}

export function SessionList({
  quizId,
  items,
  classes,
  defaultClassId,
}: {
  quizId: string;
  items: readonly SessionListItem[];
  classes: Class[];
  defaultClassId?: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SessionGroup | "all">("all");
  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
  const classInfo = (item: SessionListItem) => {
    const c = item.session.classId ? classById[item.session.classId] : undefined;
    return c ? { name: `${c.courseCode} ${c.section}`, title: c.title } : null;
  };

  const counts: Record<SessionGroup, number> = { live: 0, upcoming: 0, ended: 0 };
  for (const item of items) counts[sessionGroupOf(item.session)]++;
  const shown = [...items]
    .filter((item) => filter === "all" || sessionGroupOf(item.session) === filter)
    .sort((a, b) => sessionGroupRank[sessionGroupOf(a.session)] - sessionGroupRank[sessionGroupOf(b.session)]);

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
    const found = await sessionSecretsAction(item.session.id);
    setBusy(null);
    if (!found) {
      setError("That session no longer exists.");
      return;
    }
    setCreating(false);
    setEditing({ item, ...found });
  }

  function start() {
    setEditing(null);
    setCreating(true);
  }

  return (
    <section aria-labelledby="sessions-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="sessions-heading" className="flex items-center gap-2 text-lg font-semibold">
            Sessions
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted tabular-nums">{items.length}</span>
          </h2>
          <p className="mt-0.5 text-sm text-muted">Each time you run this quiz for a class, or for anyone with its key, is one session.</p>
        </div>
        {items.length > 0 && (
          <Button onClick={start} aria-haspopup="dialog">
            <Plus className="size-4" aria-hidden /> Start a session
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <div role="group" aria-label="Show" className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1">
          {[{ key: "all" as const, label: "All", count: items.length }, ...sessionGroups.map((g) => ({ ...g, count: counts[g.key] }))].map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              disabled={f.count === 0 && f.key !== "all"}
              className={clsx(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40",
                filter === f.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-muted hover:text-foreground",
              )}
            >
              {f.key === "live" && f.count > 0 && <LiveDot />}
              {f.label}
              <span className="tabular-nums opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
            <CalendarClock className="size-6" aria-hidden />
          </span>
          <div>
            <p className="font-medium">No sessions yet</p>
            <p className="mt-1 text-sm text-muted">Start a session to give this quiz to a class, or to anyone with its key.</p>
          </div>
          <Button onClick={start} aria-haspopup="dialog">
            <Plus className="size-4" aria-hidden /> Start a session
          </Button>
        </Card>
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {shown.map((item) => (
            <SessionCard
              key={item.session.id}
              item={item}
              quizId={quizId}
              classInfo={classInfo(item)}
              busy={busy === item.session.id}
              onRun={(action) => run(item.session.id, action)}
              onEdit={() => edit(item)}
            />
          ))}
        </ul>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="Start a session" size="xl">
        <SessionForm quizId={quizId} classes={classes} defaultClassId={defaultClassId} onDone={() => setCreating(false)} />
      </Dialog>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit session" size="xl">
        {editing && (
          <SessionForm
            key={editing.item.session.id}
            quizId={quizId}
            classes={classes}
            session={editing.item.session}
            roomPassword={editing.roomPassword}
            ipAllowlist={editing.ipAllowlist}
            relayPassword={editing.relayPassword}
            relayClues={editing.relayClues}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

function SessionCard({
  item,
  quizId,
  classInfo,
  busy,
  onRun,
  onEdit,
}: {
  item: SessionListItem;
  quizId: string;
  classInfo: { name: string; title: string } | null;
  busy: boolean;
  onRun: (action: () => Promise<{ error: string } | object>) => void;
  onEdit: () => void;
}) {
  const { session, submittedCount, studentCount, needsGrading } = item;
  const group = sessionGroupOf(session);
  const base = `/teacher/assessments/${quizId}/sessions/${session.id}`;
  const share = studentCount > 0 ? Math.round((submittedCount / studentCount) * 100) : 0;
  const rules = sessionRuleChips(session);
  const canRelease = session.resultsRelease === "manual" && session.status !== "scheduled";

  const end = () => {
    if (window.confirm("End it now? Attempts still in progress are submitted.")) onRun(() => endSessionAction(session.id));
  };
  const more: MenuItem[] = [
    ...(session.status !== "ended" ? [{ label: "Edit session", icon: Pencil, onSelect: onEdit, disabled: busy }] : []),
    ...(canRelease
      ? [
          {
            label: session.resultsReleased ? "Hide results" : "Release results",
            icon: session.resultsReleased ? EyeOff : Eye,
            onSelect: () => onRun(() => releaseResultsAction(session.id, !session.resultsReleased)),
            disabled: busy,
          },
        ]
      : []),
    { label: "Anti-cheating", icon: ShieldCheck, href: `${base}/integrity` },
    ...(session.status === "running" ? [{ label: "End session", icon: Square, onSelect: end, disabled: busy }] : []),
    {
      label: "Delete session",
      icon: Trash2,
      danger: true,
      disabled: busy,
      onSelect: () => {
        if (window.confirm("Delete this session and all students' attempts? This can't be undone."))
          onRun(() => removeSessionAction(session.id));
      },
    },
  ];

  return (
    <li
      className={clsx(
        "relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-md",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        sessionGroupEdge[group],
        busy && "opacity-70",
      )}
      aria-busy={busy}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <SessionStatusPill session={session} />
          <ModeBadge mode={session.mode} />
        </div>
        <Menu label="More actions" items={more} />
      </div>

      <div className="px-5 pt-2">
        <h3 className="text-base font-semibold">{classInfo ? classInfo.name : "No class"}</h3>
        <p className="text-sm text-muted">{classInfo ? classInfo.title : "Anyone with the key can join"}</p>
      </div>

      <dl className="mt-3 grid gap-1.5 px-5 text-sm text-muted">
        <div className="flex items-center gap-2">
          <dt className="sr-only">When</dt>
          <CalendarClock className="size-4 shrink-0" aria-hidden />
          <dd>{schedule(item)}</dd>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {session.timeLimitMinutes !== null && (
            <div className="flex items-center gap-2">
              <dt className="sr-only">Time limit</dt>
              <Timer className="size-4 shrink-0" aria-hidden />
              <dd>{session.timeLimitMinutes} min</dd>
            </div>
          )}
          <div className="flex items-center gap-2">
            <dt className="sr-only">Retakes</dt>
            <RotateCcw className="size-4 shrink-0" aria-hidden />
            <dd>{retakesLabel(session.attemptsAllowed)}</dd>
          </div>
        </div>
      </dl>

      {session.joinCode && session.status !== "ended" && (
        <div className="mt-3 px-5">
          <JoinKey code={session.joinCode} />
        </div>
      )}

      <div className="mt-4 px-5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <Users className="size-4 text-muted" aria-hidden />
            <span className="tabular-nums">
              {submittedCount} of {studentCount}
            </span>{" "}
            submitted
          </span>
          <span className="tabular-nums text-muted">{share}%</span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-label="Submitted"
          aria-valuemin={0}
          aria-valuemax={studentCount}
          aria-valuenow={submittedCount}
        >
          <div className={clsx("h-full rounded-full transition-[width]", share === 100 ? "bg-success" : "bg-primary")} style={{ width: `${share}%` }} />
        </div>
        {needsGrading > 0 && (
          <Link
            href={`/teacher/grading/${session.id}`}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning hover:underline"
          >
            <ClipboardCheck className="size-3.5" aria-hidden />
            {needsGrading} {needsGrading === 1 ? "attempt needs" : "attempts need"} grading
          </Link>
        )}
      </div>

      {rules.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5 px-5" aria-label="Rules">
          {rules.slice(0, 3).map((rule) => (
            <li key={rule} className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-muted">
              {rule}
            </li>
          ))}
          {rules.length > 3 && (
            <li className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-muted" title={rules.slice(3).join(", ")}>
              +{rules.length - 3} more
            </li>
          )}
        </ul>
      )}

      {/* Keeps the actions at the bottom when cards in a row differ in height. */}
      <div className="min-h-4 flex-1" aria-hidden />
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-muted/40 px-5 py-3">
        {session.status === "scheduled" && (
          <Button disabled={busy} onClick={() => onRun(() => startSessionAction(session.id))}>
            <Play className="size-4" aria-hidden /> Start now
          </Button>
        )}
        {session.status === "running" && (
          <ButtonLink href={`${base}/live`}>
            <Radio className="size-4" aria-hidden /> Live view
          </ButtonLink>
        )}
        <ButtonLink href={base} variant={session.status === "ended" ? "primary" : "secondary"}>
          <BarChart3 className="size-4" aria-hidden /> Results
        </ButtonLink>
        {needsGrading > 0 && (
          <ButtonLink href={`/teacher/grading/${session.id}`} variant="secondary">
            <ClipboardCheck className="size-4" aria-hidden /> Grade
          </ButtonLink>
        )}
      </div>
    </li>
  );
}
