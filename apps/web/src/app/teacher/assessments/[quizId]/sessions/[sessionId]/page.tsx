import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModeBadge, StatusBadge } from "@/components/assessment-bits";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { latestSubmitted, quizQuestions, scoreOf } from "@/lib/attempt-view";
import { getAttempts, getClass, getSession, getStudents } from "@/lib/data/teacher";
import { formatDateTime, fullName, questionTypeLabel } from "@/lib/format";
import { percent, questionScore } from "@examora/contract/scoring";
import { SessionActions } from "./session-actions";

export const metadata: Metadata = { title: "Results" };

const average = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

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
  const latest = latestSubmitted(attempts);

  const rows = roster.map((student) => {
    const mine = attempts.filter((d) => d.studentId === student.id);
    const last = latest.get(student.id);
    const score = last && scoreOf(questions, last);
    const status = last
      ? last.attempt.status === "graded"
        ? "Graded"
        : "Needs grading"
      : mine.length > 0
        ? "In progress"
        : "Not submitted";
    return { student, attempts: mine.length, last, score, status };
  });

  const done = rows.filter((r) => r.score && r.score.ungraded === 0);
  const percents = done.map((r) => percent(r.score!.score, r.score!.max));
  const needsGrading = rows.filter((r) => r.last?.attempt.status === "needs_grading").length;

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
      return { q, percent: scores.length ? percent(scores.reduce((a, b) => a + b, 0), q.points * scores.length) : null, count: scores.length };
    }),
  }));
  const partPercent = (items: (typeof perQuestion)[number]["questions"]) => {
    const graded = items.filter((i) => i.percent !== null);
    const max = graded.reduce((n, i) => n + i.q.points * i.count, 0);
    const got = graded.reduce((n, i) => n + (i.percent! / 100) * i.q.points * i.count, 0);
    return graded.length ? percent(got, max) : null;
  };
  const number = (id: string) => questions.findIndex((q) => q.id === id) + 1;

  return (
    <>
      <PageHeader
        back={{ href: `/teacher/assessments/${quizId}`, label: detail.quiz.quiz.title }}
        title={detail.quiz.quiz.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ModeBadge mode={session.mode} />
            <StatusBadge status={session.status} />
            {cls && (
              <span>
                {cls.courseCode} · {cls.section}
              </span>
            )}
            <span>
              {session.opensAt ? `Opens ${formatDateTime(session.opensAt)}` : "Opens when you start it"} ·{" "}
              {session.closesAt ? `closes ${formatDateTime(session.closesAt)}` : "closes when you end it"}
            </span>
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/teacher/grading/${sessionId}`} variant="secondary">
              Grade
            </ButtonLink>
            <ButtonLink href={`${base}/integrity`} variant="secondary">
              Anti-cheating
            </ButtonLink>
          </>
        }
      />

      <div className="mb-6">
        <SessionActions
          sessionId={sessionId}
          status={session.status}
          manualRelease={session.resultsRelease === "manual"}
          released={session.resultsReleased}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Submitted" value={`${latest.size} / ${roster.length}`} />
        <StatCard label="Average" value={pct(average(percents))} />
        <StatCard label="Highest" value={pct(percents.length ? Math.max(...percents) : null)} />
        <StatCard label="Lowest" value={pct(percents.length ? Math.min(...percents) : null)} />
        <StatCard label="Needs grading" value={needsGrading} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Scores" description="Each student's latest submitted attempt." />
        {rows.length === 0 ? (
          <EmptyState title="No students on this session" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="hidden md:table-cell">Student no.</Th>
                <Th className="text-right">Attempts</Th>
                <Th className="text-right">Score</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Anti-cheating</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ student, attempts: count, last, score, status }) => (
                <tr key={student.id}>
                  <Td className="font-medium">{fullName(student)}</Td>
                  <Td className="hidden font-mono text-xs md:table-cell">{student.studentNumber}</Td>
                  <Td className="text-right tabular-nums">{count}</Td>
                  <Td className="text-right tabular-nums">
                    {score ? (
                      <>
                        {score.score} / {score.max}
                        <span className="ml-2 text-muted">
                          {percent(score.score, score.max)}%{score.ungraded > 0 && " so far"}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <Badge tone={status === "Graded" ? "success" : status === "Needs grading" ? "warning" : "neutral"}>
                      {status}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    {last && last.integrityEvents.length > 0 && (
                      <ButtonLink href={`${base}/integrity`} variant="ghost" className="px-2.5 py-1.5">
                        <Badge tone="warning">
                          {last.integrityEvents.length} {last.integrityEvents.length === 1 ? "alert" : "alerts"}
                        </Badge>
                      </ButtonLink>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Results by question" description="Percent of the points earned. Answers still waiting for grading are left out." />
        {latest.size === 0 ? (
          <EmptyState title="Nothing submitted yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Question</Th>
                <Th>Type</Th>
                <Th className="text-right">Points</Th>
                <Th className="text-right">Earned</Th>
              </tr>
            </thead>
            <tbody>
              {perQuestion.map(({ part, questions: items }) => [
                <tr key={part.id} className="bg-surface-muted">
                  <Td className="font-medium">{part.title || "Part"}</Td>
                  <Td />
                  <Td />
                  <Td className="text-right font-medium tabular-nums">{pct(partPercent(items))}</Td>
                </tr>,
                ...items.map(({ q, percent: p }) => (
                  <tr key={q.id}>
                    <Td className="tabular-nums">Q{number(q.id)}</Td>
                    <Td className="text-muted">{questionTypeLabel[q.type]}</Td>
                    <Td className="text-right tabular-nums">{q.points}</Td>
                    <Td className="text-right tabular-nums">{pct(p)}</Td>
                  </tr>
                )),
              ])}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
