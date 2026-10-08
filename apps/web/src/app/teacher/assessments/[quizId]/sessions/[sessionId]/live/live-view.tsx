"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { Check, ChevronDown, Copy, Flag, KeyRound, Lock, Pause, Play, Square } from "lucide-react";
import { formatJoinKey, type AnswerValue, type Incident, type LiveStudent, type Question, type Session } from "@examora/contract";
import { ModeBadge, StatusBadge } from "@/components/assessment-bits";
import { IntegrityLevelBadge } from "@/components/integrity-chip";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Switch, Table, Td, Th } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { formatDuration } from "@/lib/integrity";
import {
  addTimeAction,
  endSessionAction,
  liveAttemptAction,
  pauseSessionAction,
  resumeSessionAction,
  startSessionAction,
} from "@/lib/live/actions";
import { followTeacher, type LiveStatus } from "@/lib/live/client";
import { incidentText } from "@/lib/incidents";
import { AddTimeDialog, type Outcome } from "./add-time-dialog";
import { ApproveButton } from "./approve-button";
import { ExamToasts, examToastTypes, type ExamToast } from "./exam-toasts";
import { RowStatusBadge, formatClock, isTaking, placeholderStudent, rowStatus } from "./live-shared";
import { StudentDrawer } from "./student-drawer";

type Filter = "all" | "taking" | "alerts";
type Sort = "name" | "alerts";

const levelRank = { low: 0, medium: 1, high: 2 };
const tickMs = 10_000;
// An alert older than this when it arrives (a reconnect replaying the stream) is not worth interrupting for.
const freshAlertMs = 120_000;
const maxToasts = 5;

// Teacher actions that let a held exam attempt continue.
const approvals: Partial<Record<Incident["kind"], true>> = { device_switch_allowed: true, allow_back_in: true };

// An exam student is waiting for approval when their last device change is newer than the last approval.
const waitingFrom = (waitingAt: string | undefined, approvedAt: string | undefined) =>
  waitingAt !== undefined && (approvedAt === undefined || Date.parse(waitingAt) > Date.parse(approvedAt));

const connection: Record<LiveStatus, { label: string; dot: string }> = {
  connecting: { label: "Connecting…", dot: "bg-warning" },
  live: { label: "Live", dot: "bg-success" },
  reconnecting: { label: "Reconnecting…", dot: "bg-warning animate-pulse" },
  closed: { label: "Disconnected", dot: "bg-danger" },
};

// Everything a teacher watches while a session runs: the controls, one row per rostered student and the log of
// what the teacher did. Rows change as events arrive; clicking one opens that student's panel.
export function LiveView({
  quizId,
  title,
  classLabel,
  initialSession,
  questions,
  roster,
}: {
  quizId: string;
  title: string;
  classLabel: string | null;
  initialSession: Session;
  questions: readonly Question[];
  roster: readonly { id: string; name: string }[];
}) {
  const [session, setSession] = useState(initialSession);
  const [rows, setRows] = useState<Readonly<Record<string, LiveStudent>>>({});
  const [incidents, setIncidents] = useState<readonly Incident[]>([]);
  // The latest saved value of each answer, by attempt then question, and the question changed last.
  const [values, setValues] = useState<Readonly<Record<string, Readonly<Record<string, AnswerValue>>>>>({});
  const [changed, setChanged] = useState<Readonly<Record<string, string>>>({});
  // Counts events per attempt, so an open panel knows to read the attempt again.
  const [pulses, setPulses] = useState<Readonly<Record<string, number>>>({});
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [openId, setOpenId] = useState<string | null>(null);
  // Exam sessions: when each attempt last changed device and was last approved, and the alerts waiting to be read.
  const [waitingAt, setWaitingAt] = useState<Readonly<Record<string, string>>>({});
  const [approvedAt, setApprovedAt] = useState<Readonly<Record<string, string>>>({});
  const [toasts, setToasts] = useState<readonly ExamToast[]>([]);
  // For projecting the live view: students show as "Student 1", "Student 2"… in roster order, everywhere on this page.
  const [hideNames, setHideNames] = useState(false);
  const exam = initialSession.mode === "exam";

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const bump = (...attemptIds: string[]) =>
      setPulses((prev) => {
        const next = { ...prev };
        for (const id of attemptIds) next[id] = (next[id] ?? 0) + 1;
        return next;
      });
    return followTeacher(initialSession.id, {
      onStatus: setStatus,
      onEvent: (event) => {
        switch (event._tag) {
          case "snapshot":
            setSession(event.session);
            setRows(Object.fromEntries(event.students.map((s) => [s.studentId, s])));
            setIncidents(event.incidents);
            setValues({});
            setChanged({});
            bump(...event.students.flatMap((s) => s.attemptId ?? []));
            if (exam) {
              const approved: Record<string, string> = {};
              for (const i of event.incidents)
                if (i.attemptId && approvals[i.kind] && (approved[i.attemptId] ?? "") < i.at) approved[i.attemptId] = i.at;
              setApprovedAt(approved);
              // The snapshot has no events: read the attempts that are still open and have alerts.
              for (const s of event.students) {
                if (!s.attemptId || s.submittedAt || s.alerts === 0) continue;
                const attemptId = s.attemptId;
                void liveAttemptAction(attemptId)
                  .then(({ detail }) => {
                    const last = detail.integrityEvents.filter((e) => e.type === "device_changed").map((e) => e.at).sort().at(-1);
                    if (last) setWaitingAt((prev) => ({ ...prev, [attemptId]: last }));
                  })
                  .catch(() => undefined);
              }
            }
            break;
          case "student":
            setRows((prev) => ({ ...prev, [event.student.studentId]: event.student }));
            if (event.student.attemptId) bump(event.student.attemptId);
            break;
          case "answer":
            setValues((prev) => ({
              ...prev,
              [event.attemptId]: { ...prev[event.attemptId], [event.questionId]: event.value },
            }));
            setChanged((prev) => ({ ...prev, [event.attemptId]: event.questionId }));
            bump(event.attemptId);
            break;
          case "integrity": {
            bump(event.attemptId);
            if (!exam) break;
            const fresh = event.events.filter((e) => Date.now() - Date.parse(e.at) < freshAlertMs);
            const change = fresh.filter((e) => e.type === "device_changed").map((e) => e.at).sort().at(-1);
            if (change) setWaitingAt((prev) => ({ ...prev, [event.attemptId]: change }));
            const added = fresh
              .filter((e) => examToastTypes[e.type])
              .map((e): ExamToast => ({ id: `${event.attemptId}-${e.type}-${e.at}`, attemptId: event.attemptId, type: e.type, at: e.at }));
            if (added.length > 0)
              setToasts((prev) => [...prev, ...added.filter((t) => !prev.some((p) => p.id === t.id))].slice(-maxToasts));
            break;
          }
          case "incident":
            setIncidents((prev) => (prev.some((i) => i.id === event.incident.id) ? prev : [...prev, event.incident]));
            if (event.incident.attemptId) {
              bump(event.incident.attemptId);
              const { attemptId, at, kind } = event.incident;
              if (approvals[kind]) setApprovedAt((prev) => ({ ...prev, [attemptId]: at }));
            }
            break;
          case "session":
            setSession(event.session);
            break;
        }
      },
    });
  }, [initialSession.id, exam]);

  const all = useMemo(
    () =>
      roster.map((r, i) => ({
        ...r,
        name: hideNames ? `Student ${i + 1}` : r.name,
        student: rows[r.id] ?? placeholderStudent(r.id, questions.length),
      })),
    [roster, rows, questions.length, hideNames],
  );

  const counts = {
    all: all.length,
    taking: all.filter((r) => isTaking(rowStatus(r.student, now))).length,
    alerts: all.filter((r) => r.student.alerts > 0).length,
  };

  const shown = useMemo(() => {
    const kept = all.filter(({ student }) =>
      filter === "taking" ? isTaking(rowStatus(student, now)) : filter === "alerts" ? student.alerts > 0 : true,
    );
    if (sort === "name") return kept;
    return [...kept].sort(
      (a, b) =>
        levelRank[b.student.level] - levelRank[a.student.level] ||
        b.student.alerts - a.student.alerts ||
        b.student.awayMs - a.student.awayMs,
    );
  }, [all, filter, sort, now]);

  const open = openId ? all.find((r) => r.id === openId) : undefined;
  const nameByAttempt = useMemo(
    () => new Map(all.flatMap((r) => (r.student.attemptId ? [[r.student.attemptId, r.name] as const] : []))),
    [all],
  );
  const questionNumber = useMemo(() => new Map(questions.map((q, i) => [q.id, i + 1])), [questions]);
  const sortedIncidents = useMemo(() => [...incidents].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), [incidents]);
  const base = `/teacher/assessments/${quizId}/sessions/${session.id}`;
  const c = connection[status];

  return (
    <>
      <PageHeader
        back={{ href: base, label: "Results" }}
        title={title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ModeBadge mode={session.mode} />
            <StatusBadge status={session.status} />
            {classLabel && <span>{classLabel}</span>}
            <span role="status" className="inline-flex items-center gap-1.5">
              <span className={clsx("size-2 rounded-full", c.dot)} aria-hidden />
              {c.label}
            </span>
          </span>
        }
        actions={<Controls session={session} />}
      />

      {session.pausedAt && session.status === "running" && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
          <Pause className="size-4 shrink-0" aria-hidden />
          <span>
            Paused since {formatDateTime(session.pausedAt)}. Timers are stopped and students can&apos;t save answers.
          </span>
        </div>
      )}

      {session.joinCode && session.status !== "ended" && <JoinKey code={session.joinCode} />}

      <Card>
        <CardHeader title="Students" description="Select a student to see their answers and act on their attempt." />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
            {(
              [
                ["all", "All"],
                ["taking", "In progress"],
                ["alerts", "With alerts"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  filter === key ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-surface-muted",
                )}
              >
                {label} <span className="tabular-nums opacity-70">{counts[key]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Switch
              checked={hideNames}
              onChange={setHideNames}
              label="Hide names"
              className="items-center"
            />
            <label className="flex items-center gap-2 text-sm text-muted">
              Sort by
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
              >
                <option value="name">Name</option>
                <option value="alerts">Most alerts</option>
              </select>
            </label>
          </div>
        </div>

        {shown.length === 0 ? (
          <EmptyState title={all.length === 0 ? "Nobody is rostered for this session" : "No students match"} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Status</Th>
                <Th>Progress</Th>
                <Th>On</Th>
                <Th className="text-right">Score</Th>
                <Th className="text-right">Alerts</Th>
                <Th>Away</Th>
                <Th>Integrity</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ id, name, student: s }) => {
                const waiting = waitingFrom(s.attemptId ? waitingAt[s.attemptId] : undefined, s.attemptId ? approvedAt[s.attemptId] : undefined);
                const rs = rowStatus(s, now, waiting);
                const taking = isTaking(rs);
                const number = s.currentQuestionId ? questionNumber.get(s.currentQuestionId) : undefined;
                // Mastery shows the questions mastered; the other modes the ones answered.
                const progress = s.mastered ?? s.answered;
                const percent = s.questionCount > 0 ? Math.round((progress / s.questionCount) * 100) : 0;
                return (
                  <tr
                    key={id}
                    onClick={() => setOpenId(id)}
                    className={clsx(
                      "cursor-pointer hover:bg-surface-muted",
                      rs === "waiting" && "bg-danger-soft",
                      openId === id && "bg-primary-soft",
                    )}
                  >
                    <Td className="font-medium">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(id);
                        }}
                        aria-haspopup="dialog"
                        className="inline-flex items-center gap-1.5 text-left hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {name}
                        {s.locked && <Lock className="size-3.5 text-danger" aria-label="Locked" />}
                      </button>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-2">
                        <RowStatusBadge status={rs} />
                        {rs === "waiting" && s.attemptId && (
                          <ApproveButton attemptId={s.attemptId} name={name} />
                        )}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div
                          role="progressbar"
                          aria-label={`${name}: ${s.mastered === undefined ? "answered" : "mastered"}`}
                          aria-valuemin={0}
                          aria-valuemax={s.questionCount}
                          aria-valuenow={progress}
                          className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-muted"
                        >
                          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted">
                          {progress}/{s.questionCount}
                        </span>
                        {s.marked > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 text-xs font-medium tabular-nums text-warning"
                            title={`${s.marked} marked for review`}
                          >
                            <Flag className="size-3" aria-hidden />
                            {s.marked}
                            <span className="sr-only"> marked for review</span>
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums">
                      {taking ? (
                        <span title={number ? `Question ${number} in the quiz` : undefined}>
                          Q{s.questionIndex + 1} <span className="text-muted">/ {s.questionCount}</span>
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {rs === "not_started" ? <span className="text-muted">—</span> : `${s.score} / ${s.max}`}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {s.alerts > 0 ? <span className="font-medium text-warning">{s.alerts}</span> : <span className="text-muted">0</span>}
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums">{formatDuration(s.awayMs)}</Td>
                    <Td>{rs === "not_started" ? <span className="text-muted">—</span> : <IntegrityLevelBadge level={s.level} />}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <details className="group mt-6 rounded-xl border border-border bg-surface">
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 font-semibold">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          Incident log
          <Badge>{sortedIncidents.length}</Badge>
        </summary>
        {sortedIncidents.length === 0 ? (
          <p className="border-t border-border px-5 py-4 text-sm text-muted">Nothing done yet in this session.</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border text-sm">
            {sortedIncidents.map((i) => (
              <li key={i.id} className="flex items-start gap-3 px-5 py-2.5">
                <time dateTime={i.at} className="w-20 shrink-0 text-xs tabular-nums text-muted">
                  {formatClock(i.at)}
                </time>
                <span className="min-w-0 break-words">
                  {incidentText(i, i.attemptId ? (nameByAttempt.get(i.attemptId) ?? "a student") : null)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>

      {open && (
        <StudentDrawer
          key={open.id}
          student={open.student}
          name={open.name}
          questions={questions}
          session={session}
          incidents={incidents}
          values={open.student.attemptId ? values[open.student.attemptId] : undefined}
          justChanged={open.student.attemptId ? changed[open.student.attemptId] : undefined}
          pulse={open.student.attemptId ? (pulses[open.student.attemptId] ?? 0) : 0}
          now={now}
          waiting={waitingFrom(
            open.student.attemptId ? waitingAt[open.student.attemptId] : undefined,
            open.student.attemptId ? approvedAt[open.student.attemptId] : undefined,
          )}
          reportHref={exam && open.student.attemptId ? `${base}/report/${open.student.attemptId}` : null}
          onClose={() => setOpenId(null)}
        />
      )}

      {exam && (
        <ExamToasts
          toasts={toasts}
          nameOf={(attemptId) => nameByAttempt.get(attemptId) ?? "A student"}
          onOpen={(attemptId) => {
            const row = all.find((r) => r.student.attemptId === attemptId);
            if (row) setOpenId(row.id);
          }}
          onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        />
      )}
    </>
  );
}

// Start, pause, resume, add time and end, for the whole session.
function Controls({ session }: { session: Session }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<Outcome>) {
    start(async () => {
      const result = await action();
      setError("error" in result ? result.error : null);
    });
  }

  return (
    <>
      {(session.status === "scheduled" || session.status === "lobby") && (
        <Button disabled={pending} onClick={() => run(() => startSessionAction(session.id))}>
          <Play className="size-4" aria-hidden /> Start now
        </Button>
      )}
      {session.status === "running" && (
        <>
          {session.pausedAt ? (
            <Button disabled={pending} onClick={() => run(() => resumeSessionAction(session.id))}>
              <Play className="size-4" aria-hidden /> Resume
            </Button>
          ) : (
            <Button variant="secondary" disabled={pending} onClick={() => run(() => pauseSessionAction(session.id))}>
              <Pause className="size-4" aria-hidden /> Pause
            </Button>
          )}
          <AddTimeDialog
            title="Add time for everyone"
            description="Every student still taking the session gets these extra minutes."
            onAdd={(seconds) => addTimeAction(session.id, seconds)}
          />
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              if (window.confirm("End it now? Attempts still in progress are submitted.")) run(() => endSessionAction(session.id));
            }}
          >
            <Square className="size-4" aria-hidden /> End session
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}

// The session's join key, large enough to read off a projector, with a copy button.
function JoinKey({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const key = formatJoinKey(code);
  return (
    <section
      aria-label="Join key"
      className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-surface px-5 py-4"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
        <KeyRound className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">Join key</p>
        <p className="text-xs text-muted">Students choose Join on their dashboard (or open /join) and type this key.</p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <code className="rounded-lg bg-surface-muted px-4 py-2 font-mono text-3xl font-bold tracking-[0.2em] tabular-nums">
          {key}
        </code>
        <Button
          variant="secondary"
          className="px-2.5"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          aria-label={copied ? "Key copied" : `Copy key ${key}`}
          title={copied ? "Copied" : "Copy key"}
        >
          {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </Button>
      </div>
    </section>
  );
}
