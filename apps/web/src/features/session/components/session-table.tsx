"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { BarChart3, CalendarClock, ClipboardCheck, Eye, EyeOff, Pencil, Play, Radio, ShieldCheck, Square, Trash2 } from "lucide-react";
import type { SessionListItem } from "@examinus/contract/session";
import { modeLabel } from "@examinus/copy/modes";
import { Button, ButtonLink, Card, EmptyState, segmentClass, segmentGroupClass } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { Menu, type MenuItem } from "@/components/menu";
import { SortHeader, type SortDir } from "@/components/sort-header";
import { LiveDot, ModeTile, SessionStatusPill, sessionGroupOf, sessionGroupRank, sessionGroups, type SessionGroup } from "./assessment-bits";
import { JoinKey } from "@/components/join-key";
import { sessionRuleChips } from "@/features/session/integrity";
import { resultsVisible } from "@/features/session/sessions";
import { retakesLabel } from "@examinus/domain/attempts";
import { formatDateTime } from "@/lib/format";
import type { Class } from "@/features/classes/types";
import { endSessionAction, releaseResultsAction, removeSessionAction, sessionSecretsAction, openLobbyAction, startSessionAction } from "../actions";
import type { SessionSecrets } from "../actions";
import { SessionForm } from "./session-form";
import { StartSessionButton } from "./start-session-button";

type Editing = SessionSecrets & { item: SessionListItem };
type ClassInfo = { name: string; title: string } | null;
type Action = () => Promise<{ error: string } | object>;

function schedule(item: SessionListItem) {
  const { opensAt, closesAt, status } = item.session;
  if (!opensAt) return status === "scheduled" ? "Starts when you press Start" : "Started by hand";
  return `${formatDateTime(opensAt)} – ${closesAt ? formatDateTime(closesAt) : "until you end it"}`;
}

// Both tables run one session action at a time; an action's refusal shows above the table, success refreshes the page.
function useSessionRun() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(id: string, action: Action) {
    setBusy(id);
    setError(null);
    const result = await action();
    setBusy(null);
    if ("error" in result) setError(String(result.error));
    else router.refresh();
  }
  return { busy, setBusy, error, setError, run };
}

function useClassInfo(classes: Class[]) {
  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
  return (item: SessionListItem): ClassInfo => {
    const c = item.session.classId ? classById[item.session.classId] : undefined;
    return c ? { name: `${c.courseCode} ${c.section}`, title: c.title } : null;
  };
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mx-4 mt-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">
      {error}
    </p>
  );
}

// The class a session is for (or "No class"), its mode in words beside the decorative tile, and an optional extra line.
function SessionCell({ item, info, children }: { item: SessionListItem; info: ClassInfo; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-[9rem] items-start gap-3">
      <ModeTile mode={item.session.mode} />
      <div className="min-w-0">
        <p className="font-semibold">{info ? info.name : "No class"}</p>
        <p className="line-clamp-2 text-xs text-muted">{info ? info.title : "Anyone with the key can join"}</p>
        {children}
      </div>
    </div>
  );
}

function Submitted({ item }: { item: SessionListItem }) {
  const { submittedCount, studentCount } = item;
  const share = studentCount > 0 ? Math.round((submittedCount / studentCount) * 100) : 0;
  return (
    <div className="w-32">
      <p className="text-xs">
        <span className="font-semibold tabular-nums">
          {submittedCount} of {studentCount}
        </span>{" "}
        <span className="text-muted">submitted</span>
      </p>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted shadow-well"
        role="progressbar"
        aria-label="Submitted"
        aria-valuemin={0}
        aria-valuemax={studentCount}
        aria-valuenow={submittedCount}
      >
        <div className={clsx("h-full rounded-full", share === 100 ? "bg-success" : "bg-primary")} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

// Row buttons: compact on wide screens; on phones their labels go to screen readers only, so they grow to a 44px tap.
const small = "px-3 py-1.5 text-xs max-sm:min-h-11 max-sm:min-w-11";

type SortKey = "class" | "status" | "submitted";

// The Sessions tab: every run of this quiz, filtered by live / upcoming / ended and sortable, with its next step and a
// menu for the rest.
export function SessionTable({
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
  const { busy, setBusy, error, setError, run } = useSessionRun();
  const classInfo = useClassInfo(classes);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [filter, setFilter] = useState<SessionGroup | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "status", dir: "asc" });

  const counts: Record<SessionGroup, number> = { live: 0, upcoming: 0, ended: 0 };
  for (const item of items) counts[sessionGroupOf(item.session)]++;
  const value = (item: SessionListItem): number | string => {
    if (sort.key === "class") return classInfo(item)?.name ?? "~";
    if (sort.key === "submitted") return item.studentCount > 0 ? item.submittedCount / item.studentCount : 0;
    return sessionGroupRank[sessionGroupOf(item.session)];
  };
  // Ties keep the API's order (newest first).
  const shown = items
    .filter((item) => filter === "all" || sessionGroupOf(item.session) === filter)
    .toSorted((a, b) => {
      const [x, y] = [value(a), value(b)];
      const order = typeof x === "string" ? x.localeCompare(String(y), undefined, { numeric: true }) : x - (y as number);
      return sort.dir === "asc" ? order : -order;
    });
  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  async function edit(item: SessionListItem) {
    setBusy(item.session.id);
    const found = await sessionSecretsAction(item.session.id);
    setBusy(null);
    if (!found) setError("That session no longer exists.");
    else setEditing({ item, ...found });
  }

  return (
    <section aria-labelledby="sessions-heading">
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3 sm:px-4">
          <h2 id="sessions-heading" className="sr-only">
            Sessions
          </h2>
          {items.length > 0 && (
            <div role="group" aria-label="Show" className={segmentGroupClass}>
              {[{ key: "all" as const, label: "All", count: items.length }, ...sessionGroups.map((g) => ({ ...g, count: counts[g.key] }))].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  disabled={f.count === 0 && f.key !== "all"}
                  className={clsx(segmentClass(filter === f.key), "disabled:opacity-40")}
                >
                  {f.key === "live" && f.count > 0 && <LiveDot />}
                  {f.label}
                  <span className="tabular-nums opacity-70">{f.count}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-sm text-muted">Each run for a class, or for anyone with its key, is one session.</p>
          <div className="ml-auto">
            <StartSessionButton quizId={quizId} classes={classes} defaultClassId={defaultClassId} variant="secondary" />
          </div>
        </div>
        <ErrorNote error={error} />

        {items.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No sessions yet"
            action={<StartSessionButton quizId={quizId} classes={classes} defaultClassId={defaultClassId} />}
          >
            Start a session to give this quiz to a class, or to anyone with its key.
          </EmptyState>
        ) : (
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Sessions of this quiz</caption>
            <thead className="border-b border-border bg-surface-muted/60 text-xs tracking-wide text-muted uppercase">
              <tr>
                <SortHeader active={sort.key === "class"} dir={sort.dir} onSort={() => sortBy("class")} className="py-2 pr-3 pl-4 text-left">
                  Session
                </SortHeader>
                <SortHeader active={sort.key === "status"} dir={sort.dir} onSort={() => sortBy("status")} className="hidden px-3 py-2 text-left sm:table-cell">
                  Status
                </SortHeader>
                <th scope="col" className="hidden px-3 py-2 text-left font-medium lg:table-cell">
                  Join key
                </th>
                <SortHeader active={sort.key === "submitted"} dir={sort.dir} onSort={() => sortBy("submitted")} className="hidden px-3 py-2 text-left md:table-cell">
                  Submitted
                </SortHeader>
                <th scope="col" className="py-2 pr-4 pl-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((item) => (
                <SessionRow
                  key={item.session.id}
                  item={item}
                  quizId={quizId}
                  info={classInfo(item)}
                  busy={busy === item.session.id}
                  onRun={(action) => run(item.session.id, action)}
                  onEdit={() => edit(item)}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit session" size="xl" fill>
        {editing && (
          <SessionForm
            key={editing.item.session.id}
            quizId={quizId}
            classes={classes}
            session={editing.item.session}
            roomPassword={editing.roomPassword}
            exitPassword={editing.exitPassword}
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

function SessionRow({
  item,
  quizId,
  info,
  busy,
  onRun,
  onEdit,
}: {
  item: SessionListItem;
  quizId: string;
  info: ClassInfo;
  busy: boolean;
  onRun: (action: Action) => void;
  onEdit: () => void;
}) {
  const { session, needsGrading } = item;
  const base = `/teacher/assessments/${quizId}/sessions/${session.id}`;
  const rules = sessionRuleChips(session);
  const live = session.status === "lobby" || session.status === "running";
  const liveHref = session.mode === "game" ? `${base}/present` : `${base}/live`;
  const liveLabel = session.mode === "game" ? "Presenter" : "Live view";
  // A lobby (outside games) starts from here, so its live view moves into the menu.
  const startable = session.status === "lobby" && session.mode !== "game";
  const canRelease = session.resultsRelease === "manual" && session.status !== "scheduled";

  const more: MenuItem[] = [
    ...(startable ? [{ label: liveLabel, icon: Radio, href: liveHref }] : []),
    ...(session.status !== "ended" ? [{ label: "Results", icon: BarChart3, href: base }] : []),
    ...(needsGrading > 0 ? [{ label: "Grade", icon: ClipboardCheck, href: `/teacher/grading/${session.id}` }] : []),
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
    ...(live
      ? [
          {
            label: "End session",
            icon: Square,
            disabled: busy,
            onSelect: () => {
              if (window.confirm("End it now? Attempts still in progress are submitted.")) onRun(() => endSessionAction(session.id));
            },
          },
        ]
      : []),
    {
      label: "Delete session",
      icon: Trash2,
      danger: true,
      disabled: busy,
      onSelect: () => {
        if (window.confirm("Delete this session and all students' attempts? This can't be undone.")) onRun(() => removeSessionAction(session.id));
      },
    },
  ];

  return (
    <tr className={clsx("align-top transition-colors hover:bg-primary-soft/30", busy && "opacity-60")} aria-busy={busy}>
      <td className="py-3 pr-3 pl-4">
        <SessionCell item={item} info={info}>
          <p className="mt-1 flex flex-wrap gap-x-1.5 text-xs text-muted">
            <span>{modeLabel(session.mode)}</span>
            {session.timeLimitMinutes !== null && <span>· {session.timeLimitMinutes} min</span>}
            <span>· {retakesLabel(session.attemptsAllowed)}</span>
            {/* Shown here only where the Submitted column is hidden. */}
            <span className="md:hidden">
              · {item.submittedCount} of {item.studentCount} submitted
            </span>
          </p>
          {/* Phones have no Status column: the pill comes here. */}
          <div className="mt-1.5 sm:hidden">
            <SessionStatusPill session={session} />
          </div>
          {rules.length > 0 && (
            <ul className="mt-1.5 hidden flex-wrap gap-1 xl:flex" aria-label="Rules">
              {rules.slice(0, 2).map((rule) => (
                <li key={rule} className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-muted">
                  {rule}
                </li>
              ))}
              {rules.length > 2 && (
                <li className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-muted" title={rules.slice(2).join(", ")}>
                  +{rules.length - 2} more
                </li>
              )}
            </ul>
          )}
        </SessionCell>
      </td>
      <td className="hidden px-3 py-3 sm:table-cell">
        <SessionStatusPill session={session} />
        <p className="mt-1 max-w-[15rem] text-xs text-muted">{schedule(item)}</p>
      </td>
      <td className="hidden px-3 py-3 whitespace-nowrap lg:table-cell">
        {session.joinCode && session.status !== "ended" ? <JoinKey code={session.joinCode} /> : <span className="text-muted">—</span>}
      </td>
      <td className="hidden px-3 py-3 md:table-cell">
        <Submitted item={item} />
        {needsGrading > 0 && (
          <Link
            href={`/teacher/grading/${session.id}`}
            className="mt-2 inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning hover:underline"
          >
            <ClipboardCheck className="size-3.5" aria-hidden />
            {needsGrading} to grade
          </Link>
        )}
      </td>
      <td className="py-3 pr-4 pl-3">
        <div className="flex items-center justify-end gap-1">
          {session.status === "scheduled" && (
            <Button disabled={busy} onClick={() => onRun(() => openLobbyAction(session.id))} className={small}>
              <Play className="size-3.5" aria-hidden /> <span className="max-sm:sr-only">Open lobby</span>
            </Button>
          )}
          {startable && (
            <Button disabled={busy} onClick={() => onRun(() => startSessionAction(session.id))} className={small}>
              <Play className="size-3.5" aria-hidden /> <span className="max-sm:sr-only">Start now</span>
            </Button>
          )}
          {live && !startable && (
            <ButtonLink href={liveHref} className={small}>
              <Radio className="size-3.5" aria-hidden /> <span className="max-sm:sr-only">{liveLabel}</span>
            </ButtonLink>
          )}
          {session.status === "ended" && (
            <ButtonLink href={base} variant="secondary" className={small}>
              <BarChart3 className="size-3.5" aria-hidden /> <span className="max-sm:sr-only">Results</span>
            </ButtonLink>
          )}
          <Menu label={`More actions for ${info ? info.name : "this session"}`} items={more} />
        </div>
      </td>
    </tr>
  );
}

// What students can see of their scores, and why.
function visibilityNote(item: SessionListItem): string {
  const { resultsRelease, status } = item.session;
  if (resultsRelease === "immediately") return "As soon as they submit";
  if (resultsRelease === "after_close") return status === "ended" ? "Since the session closed" : "When the session closes";
  return "When you release them";
}

// The Results tab: every session that has started, with how far it got, what's left to grade and whether students
// can see their scores.
export function SessionResults({ quizId, items, classes }: { quizId: string; items: readonly SessionListItem[]; classes: Class[] }) {
  const { busy, error, run } = useSessionRun();
  const classInfo = useClassInfo(classes);
  const started = items.filter((item) => item.session.status !== "scheduled");

  return (
    <section aria-labelledby="results-heading">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id="results-heading" className="font-semibold">
            Results by session
          </h2>
          <p className="text-sm text-muted">Open a session for its scores, item analysis and exports.</p>
        </div>
        <ErrorNote error={error} />

        {started.length === 0 ? (
          <EmptyState icon={BarChart3} title="No results yet">
            Results show here once a session has started.
          </EmptyState>
        ) : (
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Results of each session</caption>
            <thead className="border-b border-border bg-surface-muted/60 text-xs tracking-wide text-muted uppercase">
              <tr>
                <th scope="col" className="py-2 pr-3 pl-4 text-left font-medium">
                  Session
                </th>
                <th scope="col" className="hidden px-3 py-2 text-left font-medium md:table-cell">
                  Submitted
                </th>
                <th scope="col" className="hidden px-3 py-2 text-left font-medium sm:table-cell">
                  To grade
                </th>
                <th scope="col" className="hidden px-3 py-2 text-left font-medium lg:table-cell">
                  Students see scores
                </th>
                <th scope="col" className="py-2 pr-4 pl-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {started.map((item) => {
                const { session, needsGrading } = item;
                const info = classInfo(item);
                const isBusy = busy === session.id;
                const visible = resultsVisible(session);
                const ran = session.endedAt ?? session.startedAt ?? session.opensAt;
                return (
                  <tr key={session.id} className={clsx("align-top transition-colors hover:bg-primary-soft/30", isBusy && "opacity-60")} aria-busy={isBusy}>
                    <td className="py-3 pr-3 pl-4">
                      <SessionCell item={item} info={info}>
                        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                          <span>{modeLabel(session.mode)}</span>
                          <span>· {ran ? formatDateTime(ran) : "Not started"}</span>
                          {session.status === "running" && <span className="font-semibold text-success">· Live now</span>}
                          {session.status === "lobby" && <span className="font-semibold text-success">· Lobby open</span>}
                        </p>
                      </SessionCell>
                    </td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      <Submitted item={item} />
                    </td>
                    <td className="hidden px-3 py-3 sm:table-cell">
                      {needsGrading > 0 ? (
                        <Link
                          href={`/teacher/grading/${session.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning hover:underline"
                        >
                          <ClipboardCheck className="size-3.5" aria-hidden />
                          {needsGrading} {needsGrading === 1 ? "attempt" : "attempts"}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">All graded</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      <span
                        className={clsx(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          visible ? "bg-success-soft text-success" : "bg-surface-muted text-muted",
                        )}
                      >
                        {visible ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
                        {visible ? "Visible" : "Hidden"}
                      </span>
                      <p className="mt-1 text-xs text-muted">{visibilityNote(item)}</p>
                    </td>
                    <td className="py-3 pr-4 pl-3">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {session.resultsRelease === "manual" && (
                          <Button
                            variant="ghost"
                            disabled={isBusy}
                            onClick={() => run(session.id, () => releaseResultsAction(session.id, !session.resultsReleased))}
                            className={small}
                          >
                            {session.resultsReleased ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                            <span className="max-sm:sr-only">{session.resultsReleased ? "Hide" : "Release"}</span>
                          </Button>
                        )}
                        {needsGrading > 0 && (
                          <ButtonLink href={`/teacher/grading/${session.id}`} variant="secondary" className={small}>
                            <ClipboardCheck className="size-3.5" aria-hidden /> <span className="max-sm:sr-only">Grade</span>
                          </ButtonLink>
                        )}
                        <ButtonLink href={`/teacher/assessments/${quizId}/sessions/${session.id}`} className={small}>
                          <BarChart3 className="size-3.5" aria-hidden /> <span className="max-sm:sr-only">Results</span>
                        </ButtonLink>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  );
}
