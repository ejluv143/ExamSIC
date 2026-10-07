"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { ChevronDown, Lock, Pause, Play, Square } from "lucide-react";
import type { AnswerValue, Incident, LiveStudent, Question, Session } from "@examora/contract";
import { ModeBadge, StatusBadge } from "@/components/assessment-bits";
import { IntegrityLevelBadge } from "@/components/integrity-chip";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { formatDuration } from "@/lib/integrity";
import { endSessionAction, pauseSessionAction, resumeSessionAction, addTimeAction, startSessionAction } from "@/lib/live/actions";
import { followTeacher, type LiveStatus } from "@/lib/live/client";
import { AddTimeDialog, type Outcome } from "./add-time-dialog";
import { RowStatusBadge, formatClock, incidentText, isTaking, placeholderStudent, rowStatus } from "./live-shared";
import { StudentDrawer } from "./student-drawer";

type Filter = "all" | "taking" | "alerts";
type Sort = "name" | "alerts";

const levelRank = { low: 0, medium: 1, high: 2 };
const tickMs = 10_000;

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
          case "integrity":
            bump(event.attemptId);
            break;
          case "incident":
            setIncidents((prev) => (prev.some((i) => i.id === event.incident.id) ? prev : [...prev, event.incident]));
            if (event.incident.attemptId) bump(event.incident.attemptId);
            break;
          case "session":
            setSession(event.session);
            break;
        }
      },
    });
  }, [initialSession.id]);

  const all = useMemo(
    () => roster.map((r) => ({ ...r, student: rows[r.id] ?? placeholderStudent(r.id, questions.length) })),
    [roster, rows, questions.length],
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
                const rs = rowStatus(s, now);
                const taking = isTaking(rs);
                const number = s.currentQuestionId ? questionNumber.get(s.currentQuestionId) : undefined;
                const percent = s.questionCount > 0 ? Math.round((s.answered / s.questionCount) * 100) : 0;
                return (
                  <tr
                    key={id}
                    onClick={() => setOpenId(id)}
                    className={clsx("cursor-pointer hover:bg-surface-muted", openId === id && "bg-primary-soft")}
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
                      <RowStatusBadge status={rs} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div
                          role="progressbar"
                          aria-label={`${name}: answered`}
                          aria-valuemin={0}
                          aria-valuemax={s.questionCount}
                          aria-valuenow={s.answered}
                          className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-muted"
                        >
                          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted">
                          {s.answered}/{s.questionCount}
                        </span>
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
          onClose={() => setOpenId(null)}
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
