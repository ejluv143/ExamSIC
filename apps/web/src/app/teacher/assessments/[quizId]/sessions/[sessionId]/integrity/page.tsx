import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { alertStyle, AlertChip, IntegrityLevelBadge } from "@/components/integrity-chip";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { answerText, isSubmitted, quizQuestions } from "@/lib/attempt-view";
import { getAttempts, getSession, getStudents } from "@/lib/data/teacher";
import { formatDateTime, formatRelative, formatTime, fullName } from "@/lib/format";
import { modeLabel } from "@/lib/sessions";
import { awayCount, formatDuration } from "@/lib/integrity";
import { typingFlagLabel } from "@/lib/typing";
import { sessionIntegrity } from "@/lib/session-integrity";
import {
  similarPairs,
  sourceKind,
  type IntegrityEventType,
  type IntegrityLevel,
  type PairKind,
} from "@examora/contract";
import { TypeFilter } from "./type-filter";

export const metadata: Metadata = { title: "Anti-cheating" };

// Same student, same color, so names are quick to scan.
const avatarColors = [
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
];
const avatarColor = (id: string) => avatarColors[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % avatarColors.length];

export default async function IntegrityPage(
  props: PageProps<"/teacher/assessments/[quizId]/sessions/[sessionId]/integrity">,
) {
  const { quizId, sessionId } = await props.params;
  const { type } = await props.searchParams;
  const detail = await getSession(sessionId);
  if (!detail || detail.session.quizId !== quizId) notFound();
  const { session } = detail;
  const questions = quizQuestions(detail.quiz);

  const submitted = (await getAttempts(sessionId)).filter(isSubmitted);
  const submissions = submitted.filter((s) => s.integrityEvents.length > 0);
  const students = new Map((await getStudents(submitted.map((s) => s.studentId))).map((s) => [s.id, s]));
  const nameOf = (studentId: string) => {
    const st = students.get(studentId);
    return st ? fullName(st) : "Unknown student";
  };
  const subById = new Map(submitted.map((s) => [s.attempt.id, s]));
  const number = (questionId: string) => questions.findIndex((q) => q.id === questionId) + 1;

  // Pairs of near-identical code answers. SQL is left out: correct queries are naturally alike.
  const codeQuestions = questions.filter((q) => q.type === "code");
  const similar = codeQuestions.flatMap((q) =>
    similarPairs(
      submitted.map((s) => ({ id: s.attempt.id, text: answerText(s, q.id) })),
      q.starterCode,
      sourceKind(q.language),
    ).map((p) => ({ ...p, question: q })),
  );

  // The level of each student's latest submitted attempt, what two students share, and answers whose typing
  // history looks pasted, auto-typed or tampered with.
  const { typed, oddTyping, latest: latestByStudent, analysis } = sessionIntegrity(questions, submitted);
  const latest = [...latestByStudent.values()];
  const levelRank: Record<IntegrityLevel, number> = { high: 2, medium: 1, low: 0 };
  const report = latest
    .map((sub) => ({ sub, student: students.get(sub.studentId), result: analysis.attempts[sub.attempt.id] }))
    .filter((r) => r.result)
    .sort((x, y) => levelRank[y.result.level] - levelRank[x.result.level] || y.result.score - x.result.score);
  const pairKindLabel: Partial<Record<PairKind, string>> = {
    wrong_answers: "Same rare wrong answers",
    essay_text: "Similar essay text",
    timing: "Answered at the same moments",
    device: "Same device",
    network: "Same network address",
  };
  const checks = analysis.pairs.filter((p) => p.kind !== "code");
  const compareBase = `/teacher/assessments/${quizId}/sessions/${sessionId}/integrity/compare`;

  // One row per submission with its alerts grouped by type, most alerts first.
  const rows = submissions
    .map((s) => {
      const counts = new Map<IntegrityEventType, number>();
      for (const e of s.integrityEvents) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
      return {
        sub: s,
        student: students.get(s.studentId),
        counts: [...counts].sort((x, y) => y[1] - x[1]),
        total: s.integrityEvents.length,
        away: awayCount(s.integrityEvents),
        last: s.integrityEvents.reduce((m, e) => (e.at > m ? e.at : m), ""),
      };
    })
    .sort((x, y) => y.away - x.away || y.total - x.total);

  const typeCounts = new Map<IntegrityEventType, number>();
  for (const r of rows) for (const [t] of r.counts) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  const filter = typeof type === "string" && typeCounts.has(type as IntegrityEventType) ? (type as IntegrityEventType) : null;
  const shown = filter ? rows.filter((r) => r.counts.some(([t]) => t === filter)) : rows;

  return (
    <>
      <PageHeader
        back={{ href: `/teacher/assessments/${quizId}/sessions/${sessionId}`, label: detail.quiz.quiz.title }}
        title="Anti-cheating"
        description="What the anti-cheating checks noticed while students took it. A flag isn't proof of cheating: a notification or a lost connection can cause one too."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="size-5" aria-hidden />
          {rows.length} {rows.length === 1 ? "student" : "students"} with alerts
        </h2>
        {session.integrity.autoSubmitAfter !== null && (
          <Badge tone="warning">
            Auto-submit after {session.integrity.autoSubmitAfter} {session.integrity.autoSubmitAfter === 1 ? "chance" : "chances"}
          </Badge>
        )}
        {filter && (
          <span className="text-sm text-muted">
            · showing {shown.length} with “{alertStyle[filter].label}”
          </span>
        )}
      </div>

      <Card className="mb-6">
        <CardHeader
          title="Report per student"
          description="Each student's latest submitted attempt, highest concern first. The level adds up everything below; it is a pointer for where to look, not a verdict."
        />
        {report.length === 0 ? (
          <EmptyState title="Nothing submitted yet" />
        ) : (
          <ul className="divide-y divide-border">
            {report.map(({ sub, student, result }) => (
              <li key={sub.attempt.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{student ? fullName(student) : "Unknown student"}</span>
                  <span className="font-mono text-xs text-muted">{student?.studentNumber}</span>
                  <IntegrityLevelBadge level={result.level} />
                  <span className="text-sm text-muted">
                    Away {formatDuration(result.report.awayMs)} · Out of full screen {formatDuration(result.report.fullscreenMs)} ·
                    Disconnected {formatDuration(result.report.disconnectedMs)} · Longest gap {formatDuration(result.report.longestGapMs)}
                  </span>
                </div>
                {(result.signals.length > 0 || result.report.timeline.length > 0) && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-muted hover:text-foreground">
                      Why this level and what happened
                    </summary>
                    <div className="mt-3 space-y-4">
                      {result.signals.length > 0 && (
                        <div>
                          <p className="mb-1 font-medium">Signals</p>
                          <ul className="space-y-0.5">
                            {result.signals.map((sig) => (
                              <li key={sig.key} className="flex gap-2">
                                <span className="w-10 text-right font-mono text-xs text-muted tabular-nums">+{sig.points}</span>
                                <span>{sig.label}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.report.byType.length > 0 && (
                        <div>
                          <p className="mb-1 font-medium">By type</p>
                          <ul className="space-y-1.5">
                            {result.report.byType.map((t) => (
                              <li key={t.type} className="flex flex-wrap items-center gap-2">
                                <AlertChip type={t.type} count={t.count} />
                                {t.totalMs > 0 && <span className="text-muted">{formatDuration(t.totalMs)} in total</span>}
                                <span className="text-xs text-muted">at {t.times.map(formatTime).join(", ")}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.report.timeline.length > 0 && (
                        <div>
                          <p className="mb-1 font-medium">Timeline</p>
                          <ol className="space-y-1">
                            {result.report.timeline.map((e, i) => (
                              <li key={i} className="flex flex-wrap items-center gap-2">
                                <span className="w-24 font-mono text-xs text-muted">{formatTime(e.at)}</span>
                                <AlertChip type={e.type} />
                                {e.durationMs ? <span className="text-muted">{formatDuration(e.durationMs)}</span> : null}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No alerts">
            <ShieldCheck className="mx-auto mb-1 size-6 text-success" aria-hidden />
            Nobody left the page, copied or pasted during this {modeLabel(session.mode).toLowerCase()}.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>
                  <Suspense>
                    <TypeFilter
                      options={[...typeCounts].map(([t, count]) => ({ value: t, label: alertStyle[t].label, count }))}
                    />
                  </Suspense>
                </Th>
                <Th className="text-right">Total alerts</Th>
                <Th className="hidden md:table-cell">Last alert</Th>
                <Th>
                  <span className="sr-only">Log</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ sub, student, counts, total, away, last }) => (
                <tr key={sub.attempt.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${avatarColor(sub.studentId)}`}
                        aria-hidden
                      >
                        {student ? `${student.firstName[0]}${student.lastName[0]}` : "?"}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium">{student ? fullName(student) : "Unknown student"}</p>
                        <p className="font-mono text-xs text-muted">{student?.studentNumber}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {counts.map(([t, n]) => (
                        <AlertChip key={t} type={t} count={n} />
                      ))}
                    </div>
                  </Td>
                  <Td className="text-right tabular-nums">
                    <span className="font-semibold">{total}</span>
                    {away > 0 && <span className="block text-xs text-danger">left {away}×</span>}
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span title={formatDateTime(last)}>{formatRelative(last)}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <ButtonLink
                      href={`/teacher/grading/${sessionId}?attempt=${sub.attempt.id}`}
                      variant="ghost"
                      className="px-2.5 py-1.5"
                    >
                      View log
                    </ButtonLink>
                    {session.mode === "exam" && (
                      <ButtonLink
                        href={`/teacher/assessments/${quizId}/sessions/${sessionId}/report/${sub.attempt.id}`}
                        variant="ghost"
                        className="px-2.5 py-1.5"
                      >
                        Report
                      </ButtonLink>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {codeQuestions.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Similar answers"
            description="Code answers that match after ignoring variable names, comments, spacing and the starter code. Short or very common solutions can match by chance; compare before deciding."
          />
          {similar.length === 0 ? (
            <EmptyState title="No similar code answers" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Question</Th>
                  <Th>Students</Th>
                  <Th className="text-right">Similarity</Th>
                  <Th>
                    <span className="sr-only">Compare</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {similar.map((p) => (
                  <tr key={`${p.question.id}-${p.a}-${p.b}`}>
                    <Td className="text-muted tabular-nums">Q{number(p.question.id)}</Td>
                    <Td>
                      <span className="font-medium">{nameOf(subById.get(p.a)!.studentId)}</span>
                      <span className="text-muted"> and </span>
                      <span className="font-medium">{nameOf(subById.get(p.b)!.studentId)}</span>
                    </Td>
                    <Td className="text-right">
                      <Badge tone={p.score >= 0.85 ? "danger" : "warning"}>{Math.round(p.score * 100)}%</Badge>
                    </Td>
                    <Td className="text-right">
                      <ButtonLink
                        href={`/teacher/assessments/${quizId}/sessions/${sessionId}/integrity/compare?q=${p.question.id}&a=${p.a}&b=${p.b}`}
                        variant="ghost"
                        className="px-2.5 py-1.5"
                      >
                        Compare
                      </ButtonLink>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader
          title="Checks after the session"
          description="Students' answers compared with each other. Matching rare wrong answers, similar essay text and answers given at the same moments can point at copying. A shared device or network address is only a flag: students on the same campus Wi-Fi share addresses."
        />
        {checks.length === 0 ? (
          <EmptyState title="Nothing stands out" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Check</Th>
                <Th>Students</Th>
                <Th>Detail</Th>
                <Th>
                  <span className="sr-only">Compare</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {checks.map((p) => {
                const a = subById.get(p.a);
                const b = subById.get(p.b);
                const link =
                  p.kind === "wrong_answers" || p.kind === "essay_text"
                    ? `${compareBase}?kind=${p.kind}&q=${p.questionIds[0] ?? ""}&a=${p.a}&b=${p.b}`
                    : null;
                return (
                  <tr key={`${p.kind}-${p.a}-${p.b}`}>
                    <Td>
                      <Badge tone={p.kind === "device" || p.kind === "network" ? "info" : p.strength >= 0.7 ? "danger" : "warning"}>
                        {pairKindLabel[p.kind]}
                      </Badge>
                    </Td>
                    <Td>
                      <span className="font-medium">{a ? nameOf(a.studentId) : "Unknown student"}</span>
                      <span className="text-muted"> and </span>
                      <span className="font-medium">{b ? nameOf(b.studentId) : "Unknown student"}</span>
                    </Td>
                    <Td className="text-sm">
                      {p.detail}
                      {p.questionIds.length > 0 && (
                        <span className="text-muted"> Questions: {p.questionIds.map((id) => `Q${number(id)}`).join(", ")}.</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      {link && (
                        <ButtonLink href={link} variant="ghost" className="px-2.5 py-1.5">
                          Compare
                        </ButtonLink>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {typed.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Unusual typing"
            description="From the typing replay of code, SQL, essay and blank answers: text that appeared all at once, typing faster than a person can, or a history that doesn't add up to the submitted answer."
          />
          {oddTyping.length === 0 ? (
            <EmptyState title="Every answer was typed normally" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Question</Th>
                  <Th>What was noticed</Th>
                  <Th>
                    <span className="sr-only">Replay</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {oddTyping.map(({ sub, question, analysis }) => (
                  <tr key={`${sub.attempt.id}-${question.id}`}>
                    <Td className="font-medium">{nameOf(sub.studentId)}</Td>
                    <Td className="text-muted tabular-nums">Q{number(question.id)}</Td>
                    <Td>
                      <ul className="space-y-0.5 text-sm">
                        {analysis.flags.map((f) => (
                          <li key={f}>{typingFlagLabel[f]}</li>
                        ))}
                      </ul>
                    </Td>
                    <Td className="text-right">
                      <ButtonLink
                        href={`/teacher/grading/${sessionId}?attempt=${sub.attempt.id}`}
                        variant="ghost"
                        className="px-2.5 py-1.5"
                      >
                        Watch replay
                      </ButtonLink>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
