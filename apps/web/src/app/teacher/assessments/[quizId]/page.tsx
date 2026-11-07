import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, Award, BarChart3, CalendarClock, CheckCircle2, ClipboardCheck, KeyRound, ListChecks, Pencil, Printer } from "lucide-react";
import { ButtonLink, Card, EmptyState, IconStat, segmentClass, segmentGroupClass } from "@/components/ui";
import { ModeTile, StatusBadge } from "@/features/session/components/assessment-bits";
import { Markdown } from "@/components/markdown";
import { answerKey } from "@examinus/domain/answer-text";
import { questionLabel } from "@examinus/copy/question-types";
import { modeLabel } from "@examinus/copy/modes";
import { contentAssetUrls, getQuiz } from "@/features/quiz/data";
import { getClasses } from "@/features/classes/data";
import { listSessions } from "@/features/session/data";
import { headlineSession, quizStatus } from "@/features/session/sessions";
import { quizTotals } from "@examinus/domain/shuffle";
import type { QuizDetail } from "@examinus/contract/quiz";
import { QuizActions } from "@/features/quiz/components/quiz-actions";
import { SessionResults, SessionTable } from "@/features/session/components/session-table";
import { StartSessionButton } from "@/features/session/components/start-session-button";

export async function generateMetadata(props: PageProps<"/teacher/assessments/[quizId]">): Promise<Metadata> {
  const { quizId } = await props.params;
  return { title: (await getQuiz(quizId))?.quiz.title ?? "Quiz" };
}

const points = (n: number) => `${n} ${n === 1 ? "pt" : "pts"}`;

// The page's tabs, in the URL (?tab=) so each one can be linked to and reloads in place. Sessions is the default:
// running the quiz is what most visits are for.
const tabs = [
  { key: "sessions", label: "Sessions", icon: CalendarClock },
  { key: "questions", label: "Questions", icon: ListChecks },
  { key: "results", label: "Results", icon: BarChart3 },
] as const;
type Tab = (typeof tabs)[number]["key"];

export default async function QuizPage(props: PageProps<"/teacher/assessments/[quizId]">) {
  const { quizId } = await props.params;
  const params = await props.searchParams;
  const [detail, sessions, classes] = await Promise.all([getQuiz(quizId), listSessions({ quizId }), getClasses()]);
  if (!detail) notFound();

  const { quiz, parts } = detail;
  const totals = quizTotals(parts);
  const toGrade = sessions.reduce((sum, s) => sum + s.needsGrading, 0);
  const lead = headlineSession(sessions.map((s) => s.session));
  const tab: Tab = tabs.find((t) => t.key === params.tab)?.key ?? "sessions";
  const classId = typeof params.class === "string" && classes.some((c) => c.id === params.class) ? params.class : undefined;
  const base = `/teacher/assessments/${quiz.id}`;
  // Tab links keep a class the page was opened for, so starting a session still picks it.
  const tabHref = (key: Tab) => {
    const sp = new URLSearchParams();
    if (key !== "sessions") sp.set("tab", key);
    if (classId) sp.set("class", classId);
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const tabCount: Record<Tab, number> = { sessions: sessions.length, questions: totals.questionCount, results: toGrade };

  return (
    <>
      <Link href="/teacher/assessments" className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
        <ArrowLeft className="size-4" aria-hidden /> Quizzes &amp; exams
      </Link>

      {/* Not overflow-hidden itself: the More menu opens past its edge. The glow and the figures clip on their own. */}
      <Card className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <div className="absolute -top-24 -right-20 size-72 rounded-full bg-primary-soft opacity-70 blur-3xl" />
        </div>
        <div className="relative flex flex-wrap items-start gap-5 p-6">
          <ModeTile mode={lead?.mode ?? null} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <StatusBadge status={quizStatus(sessions.map((s) => s.session))} />
              <span>{lead ? modeLabel(lead.mode) : "Not run yet"}</span>
              {quiz.subject && (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-semibold text-primary">{quiz.subject}</span>
                </>
              )}
            </div>
            <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-balance">{quiz.title}</h1>
            {quiz.description && (
              <Markdown className="mt-2 line-clamp-2 max-w-2xl text-sm text-muted">{quiz.description}</Markdown>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StartSessionButton quizId={quiz.id} classes={classes} defaultClassId={classId} />
            <ButtonLink href={`${base}/edit`} variant="secondary">
              <Pencil className="size-4" aria-hidden /> Edit
            </ButtonLink>
            <ButtonLink href={`${base}/edit?tab=paper`} variant="secondary">
              <Printer className="size-4" aria-hidden /> Test paper
            </ButtonLink>
            <QuizActions quizId={quiz.id} title={quiz.title} sessionCount={sessions.length} />
          </div>
        </div>
        {/* Hairline dividers between the figures: the gaps show the border colour behind them. */}
        <div className="relative grid grid-cols-2 gap-px overflow-hidden rounded-b-[inherit] border-t border-border bg-border lg:grid-cols-4">
          <IconStat icon={ListChecks} label="Questions" value={totals.questionCount} href={tabHref("questions")} />
          <IconStat icon={Award} label="Total points" value={totals.totalPoints} tone="info" href={tabHref("questions")} />
          <IconStat icon={CalendarClock} label={sessions.length === 1 ? "Session" : "Sessions"} value={sessions.length} tone="success" href={tabHref("sessions")} />
          <IconStat icon={ClipboardCheck} label="To grade" value={toGrade} tone={toGrade > 0 ? "warning" : "primary"} href={tabHref("results")} />
        </div>
      </Card>

      <nav aria-label="Quiz sections" className={clsx(segmentGroupClass, "mt-8 mb-4")}>
        {tabs.map(({ key, label, icon: Icon }) => (
          <Link key={key} href={tabHref(key)} className={clsx(segmentClass(tab === key), "px-4 py-2")} aria-current={tab === key ? "page" : undefined}>
            <Icon className="size-4" aria-hidden />
            {label}
            {tabCount[key] > 0 && <span className="tabular-nums opacity-70">{tabCount[key]}</span>}
          </Link>
        ))}
      </nav>

      {tab === "sessions" && <SessionTable quizId={quiz.id} items={sessions} classes={classes} defaultClassId={classId} />}
      {tab === "results" && <SessionResults quizId={quiz.id} items={sessions} classes={classes} />}
      {tab === "questions" && (
        <section aria-labelledby="questions-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="questions-heading" className="text-lg font-bold">
                Questions
              </h2>
              <p className="text-sm text-muted">
                {totals.questionCount} {totals.questionCount === 1 ? "question" : "questions"} · {points(totals.totalPoints)}, with the answer key
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted shadow-sm">
              <KeyRound className="size-3.5" aria-hidden /> Students never see the key
            </span>
          </div>

          {totals.questionCount === 0 ? (
            <Card className="border-dashed">
              <EmptyState
                icon={ListChecks}
                title="No questions yet"
                action={
                  <ButtonLink href={`${base}/edit`}>
                    <Pencil className="size-4" aria-hidden /> Add questions
                  </ButtonLink>
                }
              >
                Write them by hand, pick them from your bank or import them from Excel.
              </EmptyState>
            </Card>
          ) : (
            <QuestionParts parts={parts} assetUrls={await contentAssetUrls(detail)} />
          )}
        </section>
      )}
    </>
  );
}

function QuestionParts({ parts, assetUrls }: { parts: QuizDetail["parts"]; assetUrls: Readonly<Record<string, string>> }) {
  return parts.map((part, p) => (
    <Card key={part.id} className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted/50 px-5 py-3">
        <h3 className="flex items-center gap-2 font-bold">
          <span className="rounded-lg bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground shadow-depth">Part {p + 1}</span>
          {part.title}
        </h3>
        <p className="text-xs text-muted tabular-nums">
          {part.questions.length} {part.questions.length === 1 ? "question" : "questions"} · {points(part.questions.reduce((sum, q) => sum + q.points, 0))}
          {part.poolSize !== null && ` · each student gets ${part.poolSize}`}
        </p>
      </div>
      {part.instructions && (
        <Markdown className="border-b border-border px-5 py-3 text-sm text-muted" assetUrls={assetUrls}>
          {part.instructions}
        </Markdown>
      )}
      <ol className="divide-y divide-border">
        {part.questions.map((q, i) => (
          <li key={q.id} className="flex gap-4 px-5 py-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-sm font-bold text-primary tabular-nums">{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-2.5">
              <Markdown className="text-sm" assetUrls={assetUrls}>
                {q.prompt}
              </Markdown>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-full bg-surface-muted px-2.5 py-0.5 font-semibold text-muted">{questionLabel(q)}</span>
                <span className="rounded-full bg-primary-soft px-2.5 py-0.5 font-semibold text-primary tabular-nums">{points(q.points)}</span>
              </div>
              <p className="flex gap-2 rounded-xl bg-success-soft px-3 py-2 text-xs shadow-well">
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                <span className="min-w-0 whitespace-pre-wrap">
                  <span className="font-semibold text-success">Answer: </span>
                  {answerKey(q)}
                </span>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  ));
}
