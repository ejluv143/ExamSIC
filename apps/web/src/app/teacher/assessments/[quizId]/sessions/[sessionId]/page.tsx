import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { CalendarClock, ClipboardCheck, Download, Presentation, Radio, ShieldAlert, Users } from "lucide-react";
import { ModeBadge, StatusBadge } from "@/features/session/components/assessment-bits";
import { IntegrityLevelBadge } from "@/features/session/components/integrity-chip";
import { GameStandingsTable } from "@/features/game/components/game-standings";
import { MasteryTable } from "@/features/mastery/components/mastery-results";
import { Badge, ButtonDownload, ButtonLink, Card, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui";
import { latestSubmitted, quizQuestions, scoreOf } from "@/features/session/attempt-view";
import { getGameStandings } from "@/features/game/data";
import { getAttempts, getSession } from "@/features/session/data";
import { getClass, getStudents } from "@/features/classes/data";
import { formatDateTime, fullName, questionTypeLabel } from "@/lib/format";
import { median, topicTags } from "@examinus/domain/analytics";
import { percent, questionScore } from "@examinus/domain/scoring";
import { formatJoinKey } from "@examinus/domain/join-key";
import { formatDuration, sessionRuleChips } from "@/features/session/integrity";
import { sessionIntegrity } from "@/features/session/session-integrity";
import { SessionActions } from "@/features/session/components/session-actions";
import { TakingNow } from "@/features/session/components/taking-now";
import { CopyChip } from "@/features/session/components/copy-chip";
import { Histogram, PercentBar, ProgressRing, StatusBreakdown, TopicMastery, band, type TopicRow } from "@/features/session/components/charts";
import { StudentsTable, type StudentRow, type StudentStatus } from "@/features/session/components/students-table";

export const metadata: Metadata = { title: "Results" };

const average = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

function Kpi({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={clsx("bg-surface px-5 py-4", className)}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function SessionResultsPage(props: PageProps<"/teacher/assessments/[quizId]/sessions/[sessionId]">) {
  const { quizId, sessionId } = await props.params;
  const detail = await getSession(sessionId);
  if (!detail || detail.session.quizId !== quizId) notFound();
  const { session } = detail;
  const questions = quizQuestions(detail.quiz);
  const [attempts, cls, roster] = await Promise.all([
    getAttempts(sessionId),
    session.classId ? getClass(session.classId) : null,
    getStudents([...detail.studentIds]),
  ]);
  const base = `/teacher/assessments/${quizId}/sessions/${sessionId}`;
  const game = session.mode === "game" ? await getGameStandings(sessionId) : null;
  const latest = latestSubmitted(attempts);

  const integrity = sessionIntegrity(questions, attempts).analysis.attempts;
  const rules = sessionRuleChips(session);

  const rows = roster.map((student) => {
    const mine = attempts.filter((d) => d.studentId === student.id);
    const last = latest.get(student.id);
    const score = last && scoreOf(questions, last);
    const status: StudentStatus = last
      ? last.attempt.status === "graded"
        ? "Graded"
        : "Needs grading"
      : mine.length > 0
        ? "In progress"
        : "Not submitted";
    const timeMs = last ? Date.parse(last.attempt.submittedAt!) - Date.parse(last.attempt.startedAt) : null;
    return { student, attempts: mine.length, last, score, status, timeMs: timeMs !== null && timeMs > 0 ? timeMs : null };
  });

  const done = rows.filter((r) => r.score && r.score.ungraded === 0);
  const percents = done.map((r) => percent(r.score!.score, r.score!.max));
  const needsGrading = rows.filter((r) => r.status === "Needs grading").length;
  const medianScore = median(percents);
  const times = rows.flatMap((r) => (r.timeMs === null ? [] : [r.timeMs]));
  const avgTime = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;

  const statusCount = (s: StudentStatus) => rows.filter((r) => r.status === s).length;
  const slices = [
    { label: "Graded", count: statusCount("Graded"), color: "bg-success", tone: "success" },
    { label: "Needs grading", count: needsGrading, color: "bg-warning", tone: "warning" },
    { label: "In progress", count: statusCount("In progress"), color: "bg-info", tone: "info" },
    { label: "Not submitted", count: statusCount("Not submitted"), color: "bg-border", tone: "neutral" },
  ] as const;

  // Percent of the points earned, per question and per part, over the latest submitted attempts that had it.
  // Answers still waiting for a teacher are left out.
  const perQuestion = detail.quiz.parts.map((part) => ({
    part,
    questions: part.questions.map((q) => {
      const scores = [...latest.values()]
        .filter((d) => d.questionOrder.includes(q.id))
        .map((d) => {
          const answer = d.answers.find((a) => a.questionId === q.id);
          return answer ? questionScore(q, answer) : 0;
        })
        .filter((s): s is number => s !== null);
      return {
        q,
        percent: scores.length
          ? percent(
              scores.reduce((a, b) => a + b, 0),
              q.points * scores.length,
            )
          : null,
        count: scores.length,
      };
    }),
  }));
  const partPercent = (items: (typeof perQuestion)[number]["questions"]) => {
    const graded = items.filter((i) => i.percent !== null);
    const max = graded.reduce((n, i) => n + i.q.points * i.count, 0);
    const got = graded.reduce((n, i) => n + (i.percent! / 100) * i.q.points * i.count, 0);
    return graded.length ? percent(got, max) : null;
  };
  const number = (id: string) => questions.findIndex((q) => q.id === id) + 1;

  // Class mastery per topic tag: points earned over points possible, and the typical time spent.
  const topicTotals = new Map<string, { got: number; max: number; answers: number; times: number[] }>();
  for (const d of latest.values()) {
    for (const q of questions) {
      if (!d.questionOrder.includes(q.id)) continue;
      const answer = d.answers.find((a) => a.questionId === q.id);
      const earned = answer ? questionScore(q, answer) : 0;
      if (earned === null) continue;
      for (const tag of topicTags(q.topic)) {
        const t = topicTotals.get(tag) ?? { got: 0, max: 0, answers: 0, times: [] };
        t.got += earned;
        t.max += q.points;
        t.answers++;
        if (answer?.timeSpentMs !== undefined) t.times.push(answer.timeSpentMs);
        topicTotals.set(tag, t);
      }
    }
  }
  const topicRows: TopicRow[] = [...topicTotals]
    .filter(([, t]) => t.max > 0)
    .map(([topic, t]) => {
      const m = median(t.times);
      return { topic, accuracy: percent(t.got, t.max), answers: t.answers, medianTime: m === null ? "—" : formatDuration(m) };
    })
    .sort((a, b) => a.accuracy - b.accuracy);

  const studentRows: StudentRow[] = rows.map(({ student, attempts: count, last, score, status, timeMs }) => {
    const level = last && integrity[last.attempt.id];
    return {
      id: student.id,
      name: fullName(student),
      number: student.studentNumber,
      initials: `${student.firstName.charAt(0)}${student.lastName.charAt(0)}`.toUpperCase(),
      attempts: count,
      percent: score ? percent(score.score, score.max) : null,
      scoreText: score ? `${score.score} / ${score.max}` : null,
      partial: !!score && score.ungraded > 0,
      timeText: timeMs === null ? "—" : formatDuration(timeMs),
      status,
      links: (
        <>
          {level && (
            <ButtonLink href={`${base}/integrity`} variant="ghost" className="gap-2 px-2.5 py-1.5">
              <IntegrityLevelBadge level={level.level} />
              {level.report.awayMs > 0 && <span className="text-xs text-muted">{formatDuration(level.report.awayMs)} away</span>}
            </ButtonLink>
          )}
          {session.mode === "exam" && last && (
            <ButtonLink href={`${base}/report/${last.attempt.id}`} variant="ghost" className="px-2.5 py-1.5">
              Report
            </ButtonLink>
          )}
        </>
      ),
    };
  });

  // While a quiz or exam runs, who is taking it sits beside the results.
  const taking = session.mode !== "game" && session.status === "running";
  const names = Object.fromEntries(roster.map((s) => [s.id, fullName(s)]));

  const present = session.mode === "game" && session.status !== "ended";
  const live = session.mode !== "game" && ["running", "lobby", "scheduled"].includes(session.status);
  const toolbar = "inline-flex items-center gap-1.5";

  return (
    <>
      <header className="mb-6">
        <ButtonLink href={`/teacher/assessments/${quizId}`} variant="text" className="mb-2 -ml-1 px-1 py-0 text-muted hover:text-foreground">
          ← {detail.quiz.quiz.title}
        </ButtonLink>
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <ModeBadge mode={session.mode} />
                <StatusBadge status={session.status} />
                {cls && (
                  <span className="inline-flex items-center gap-1 text-sm text-muted">
                    <Users className="size-3.5" aria-hidden /> {cls.courseCode} · {cls.section}
                  </span>
                )}
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{detail.quiz.quiz.title}</h1>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
                <CalendarClock className="size-4 shrink-0" aria-hidden />
                <span>
                  {session.opensAt ? `Opens ${formatDateTime(session.opensAt)}` : "Opens when you start it"} ·{" "}
                  {session.closesAt ? `closes ${formatDateTime(session.closesAt)}` : "closes when you end it"}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {present && (
                <ButtonLink href={`${base}/present`}>
                  <Presentation className="size-4" aria-hidden /> Present the game
                </ButtonLink>
              )}
              {live && (
                <ButtonLink href={`${base}/live`}>
                  <Radio className="size-4" aria-hidden /> Live view
                </ButtonLink>
              )}
              {!present && !live && (
                <ButtonLink href={`/teacher/grading/${sessionId}`}>
                  <ClipboardCheck className="size-4" aria-hidden /> Grade
                </ButtonLink>
              )}
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface-muted p-1" role="toolbar" aria-label="More actions">
                {(present || live) && (
                  <ButtonLink href={`/teacher/grading/${sessionId}`} variant="ghost" className={toolbar}>
                    <ClipboardCheck className="size-4" aria-hidden /> Grade
                  </ButtonLink>
                )}
                <ButtonLink href={`${base}/integrity`} variant="ghost" className={toolbar}>
                  <ShieldAlert className="size-4" aria-hidden /> Anti-cheating
                </ButtonLink>
                <ButtonDownload variant="ghost" href={`${base}/export`} className={toolbar}>
                  <Download className="size-4" aria-hidden /> Export Excel
                </ButtonDownload>
              </div>
            </div>
          </div>

          {(session.joinCode || detail.roomPassword || detail.exitPassword || detail.relayPassword) && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              {session.joinCode && <CopyChip label="Join key" value={session.joinCode} display={formatJoinKey(session.joinCode)} />}
              {detail.roomPassword && <CopyChip label="Room password" value={detail.roomPassword} />}
              {detail.exitPassword && <CopyChip label="Exit password" value={detail.exitPassword} />}
              {detail.relayPassword && <CopyChip label="Relay password" value={detail.relayPassword} />}
            </div>
          )}
          {detail.relayClues.length > 0 && (
            <div className="mt-3 text-sm">
              <p className="font-medium">Relay clues</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted">
                {detail.relayClues.map((clue, i) => (
                  <li key={i}>{clue}</li>
                ))}
              </ol>
            </div>
          )}
          {rules.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Rules">
              {rules.map((rule) => (
                <li key={rule}>
                  <Badge>{rule}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </header>

      <div className={taking ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]" : undefined}>
        <div className="min-w-0 space-y-6">
          {(game || session.mode !== "game") && (
            <div className="space-y-6">
              {session.mode === "game" && session.status !== "ended" && (
                <p className="text-sm text-muted">
                  Open the presenter screen to run the game: it opens the lobby, starts it and moves it along.
                </p>
              )}
              {session.mode !== "game" && session.status === "lobby" && (
                <p className="text-sm text-muted">
                  Students are gathering in the lobby. Start the session from the live view when everyone is in.
                </p>
              )}
              {session.mode !== "game" && (
                <SessionActions
                  sessionId={sessionId}
                  status={session.status}
                  manualRelease={session.resultsRelease === "manual"}
                  released={session.resultsReleased}
                />
              )}
            </div>
          )}

          {game && game.standings.length > 0 && (
            <section aria-labelledby="standings-heading">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 id="standings-heading" className="font-semibold">
                  Game standings
                </h2>
                {session.status === "ended" && (
                  <ButtonDownload href={`${base}/standings/export`}>
                    <Download className="size-4" aria-hidden /> Standings (Excel)
                  </ButtonDownload>
                )}
              </div>
              <GameStandingsTable standings={game} />
              <p className="mt-2 text-xs text-muted">
                Points reward speed and streaks. The scores below are the normal grading scores, so the class record is not
                affected by speed.
              </p>
            </section>
          )}
          {game && game.standings.length === 0 && session.status === "ended" && (
            <ButtonDownload href={`${base}/standings/export`}>
              <Download className="size-4" aria-hidden /> Standings (Excel)
            </ButtonDownload>
          )}

          {/* Hairline dividers between the stats: the gaps show the border colour behind them. */}
          <Card className="overflow-hidden">
            <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
              <div className="col-span-2 flex items-center gap-4 bg-surface px-5 py-4">
                <ProgressRing value={latest.size} total={roster.length} label={`${latest.size} of ${roster.length} submitted`} />
                <div>
                  <p className="text-xs text-muted">Submitted</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {latest.size} / {roster.length}
                  </p>
                </div>
              </div>
              <Kpi label="Average" value={pct(average(percents))} />
              <Kpi label="Median" value={pct(medianScore === null ? null : Math.round(medianScore))} />
              <Kpi label="Highest" value={pct(percents.length ? Math.max(...percents) : null)} />
              <Kpi label="Lowest" value={pct(percents.length ? Math.min(...percents) : null)} />
              <Kpi
                label="Needs grading"
                value={<span className={needsGrading > 0 ? "text-warning" : undefined}>{needsGrading}</span>}
              />
              <Kpi label="Average time" value={avgTime === null ? "—" : formatDuration(avgTime)} hint="Start to submit" />
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader title="Score distribution" description="Students with a completed score, in 10% steps." />
              <Histogram percents={percents} />
            </Card>
            <Card>
              <CardHeader title="Status" description="Where each student is." />
              <StatusBreakdown slices={[...slices]} />
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader title="Question difficulty" description="Percent of the points earned. Red under 50%, amber under 75%." />
              {latest.size === 0 ? (
                <EmptyState title="Nothing submitted yet" />
              ) : (
                <ul className="max-h-96 divide-y divide-border overflow-auto">
                  {perQuestion.flatMap(({ questions: items }) =>
                    items.map(({ q, percent: p }) => (
                      <li key={q.id} className="flex items-center gap-3 px-5 py-2.5">
                        <span className="w-9 shrink-0 text-sm font-semibold tabular-nums">Q{number(q.id)}</span>
                        <span className="hidden w-28 shrink-0 truncate text-xs text-muted sm:block">{questionTypeLabel[q.type]}</span>
                        <PercentBar percent={p} className="flex-1" />
                        <span className="w-10 shrink-0 text-right text-sm tabular-nums">{pct(p)}</span>
                      </li>
                    )),
                  )}
                </ul>
              )}
            </Card>
            <Card className="overflow-hidden">
              <CardHeader title="Topic mastery" description="Weakest topics first, across the class." />
              <TopicMastery rows={topicRows} />
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader title="Scores" description="Each student's latest submitted attempt." />
            {rows.length === 0 ? <EmptyState title="No students on this session" /> : <StudentsTable rows={studentRows} />}
          </Card>

          {session.mastery && (
            <MasteryTable
              settings={session.mastery}
              questions={questions}
              rows={roster.map((student) => ({
                id: student.id,
                name: fullName(student),
                attempt: attempts.findLast((d) => d.studentId === student.id),
              }))}
            />
          )}

          <section aria-labelledby="by-question-heading" className="space-y-4">
            <div>
              <h2 id="by-question-heading" className="text-lg font-semibold">
                Results by question
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                Percent of the points earned. Answers still waiting for grading are left out.
              </p>
            </div>
            {latest.size === 0 ? (
              <Card>
                <EmptyState title="Nothing submitted yet" />
              </Card>
            ) : (
              perQuestion.map(({ part, questions: items }, i) => {
                const total = partPercent(items);
                return (
                  <Card key={part.id} className="overflow-hidden">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-surface-muted/50 px-5 py-3">
                      <h3 className="font-semibold">
                        <span className="mr-2 text-muted">Part {i + 1}</span>
                        {part.title}
                      </h3>
                      {total !== null && <Badge tone={band(total)}>{total}% earned</Badge>}
                    </div>
                    <Table>
                      <thead>
                        <tr>
                          <Th>Question</Th>
                          <Th className="hidden sm:table-cell">Type</Th>
                          <Th className="text-right">Points</Th>
                          <Th className="w-1/3">Earned</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(({ q, percent: p }) => (
                          <tr key={q.id}>
                            <Td className="tabular-nums">Q{number(q.id)}</Td>
                            <Td className="hidden text-muted sm:table-cell">{questionTypeLabel[q.type]}</Td>
                            <Td className="text-right tabular-nums">{q.points}</Td>
                            <Td>
                              <div className="flex items-center gap-3">
                                <PercentBar percent={p} className="flex-1" />
                                <span className="w-10 text-right tabular-nums">{pct(p)}</span>
                              </div>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Card>
                );
              })
            )}
          </section>
        </div>
        {taking && <TakingNow sessionId={sessionId} names={names} liveHref={`${base}/live`} />}
      </div>
    </>
  );
}
