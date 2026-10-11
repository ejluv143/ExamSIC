import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CalendarClock, CheckCircle2, ClipboardCheck, KeyRound, ListChecks, Pencil, Printer, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { ButtonLink, Card } from "@/components/ui";
import { StatusBadge } from "@/components/assessment-bits";
import { Markdown } from "@/components/markdown";
import { answerKey } from "@examinus/contract/answer-text";
import { questionLabel } from "@/lib/format";
import { contentAssetUrls, getClasses, getQuiz, listSessions } from "@/lib/data/teacher";
import { quizStatus } from "@/lib/sessions";
import { quizTotals } from "@examinus/contract";
import { QuizActions } from "./quiz-actions";
import { SessionList } from "./session-list";

export async function generateMetadata(props: PageProps<"/teacher/assessments/[quizId]">): Promise<Metadata> {
  const { quizId } = await props.params;
  return { title: (await getQuiz(quizId))?.quiz.title ?? "Quiz" };
}

const points = (n: number) => `${n} ${n === 1 ? "pt" : "pts"}`;

function Stat({ icon: Icon, label, value, tone = "primary" }: { icon: LucideIcon; label: string; value: number; tone?: "primary" | "warning" }) {
  return (
    <div className="flex items-center gap-3 bg-surface px-5 py-4">
      <span
        className={clsx(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          tone === "warning" ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div>
        <p className="text-2xl font-semibold leading-none tabular-nums">{value}</p>
        <p className="mt-1 text-sm text-muted">{label}</p>
      </div>
    </div>
  );
}

export default async function QuizPage(props: PageProps<"/teacher/assessments/[quizId]">) {
  const { quizId } = await props.params;
  const { class: classId } = await props.searchParams;
  const [detail, sessions, classes] = await Promise.all([getQuiz(quizId), listSessions({ quizId }), getClasses()]);
  if (!detail) notFound();

  const { quiz, parts } = detail;
  const totals = quizTotals(parts);
  const toGrade = sessions.reduce((sum, s) => sum + s.needsGrading, 0);
  const assetUrls = await contentAssetUrls(detail);

  return (
    <>
      <header className="mb-6">
        <Link href="/teacher/assessments" className="mb-3 inline-block text-sm text-muted hover:text-foreground">
          ← Quizzes &amp; exams
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <StatusBadge status={quizStatus(sessions.map((s) => s.session))} />
              {quiz.subject && <span>{quiz.subject}</span>}
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{quiz.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/teacher/assessments/${quiz.id}/edit`}>
              <Pencil className="size-4" aria-hidden /> Edit
            </ButtonLink>
            <ButtonLink href={`/teacher/assessments/${quiz.id}/edit?tab=paper`} variant="secondary">
              <Printer className="size-4" aria-hidden /> Test paper
            </ButtonLink>
            <QuizActions quizId={quiz.id} title={quiz.title} sessionCount={sessions.length} />
          </div>
        </div>
      </header>

      {/* Hairline dividers between the stats: the gaps show the border colour behind them. */}
      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4">
        <Stat icon={ListChecks} label="Questions" value={totals.questionCount} />
        <Stat icon={Award} label="Total points" value={totals.totalPoints} />
        <Stat icon={CalendarClock} label={sessions.length === 1 ? "Session" : "Sessions"} value={sessions.length} />
        <Stat icon={ClipboardCheck} label="To grade" value={toGrade} tone={toGrade > 0 ? "warning" : "primary"} />
      </Card>

      <div className="mt-8">
        <SessionList
          quizId={quiz.id}
          items={sessions}
          classes={classes}
          defaultClassId={typeof classId === "string" && classes.some((c) => c.id === classId) ? classId : undefined}
        />
      </div>

      <section aria-labelledby="questions-heading" className="mt-10 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="questions-heading" className="text-lg font-semibold">
              Questions
            </h2>
            <p className="mt-0.5 text-sm text-muted">With the answer key.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-muted">
            <KeyRound className="size-3.5" aria-hidden /> Students never see the key
          </span>
        </div>

        {totals.questionCount === 0 ? (
          <Card className="border-dashed px-6 py-10 text-center text-sm text-muted">No questions yet.</Card>
        ) : (
          parts.map((part, p) => (
            <Card key={part.id} className="overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-surface-muted/50 px-5 py-3">
                <h3 className="font-semibold">
                  <span className="mr-2 text-muted">Part {p + 1}</span>
                  {part.title}
                </h3>
                <p className="text-xs text-muted tabular-nums">
                  {part.questions.length} {part.questions.length === 1 ? "question" : "questions"} ·{" "}
                  {points(part.questions.reduce((sum, q) => sum + q.points, 0))}
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
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-muted text-xs font-semibold text-muted tabular-nums">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <Markdown className="text-sm" assetUrls={assetUrls}>
                        {q.prompt}
                      </Markdown>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="rounded-md bg-surface-muted px-2 py-0.5 text-muted">{questionLabel(q)}</span>
                        <span className="rounded-md bg-primary-soft px-2 py-0.5 font-medium text-primary tabular-nums">{points(q.points)}</span>
                      </div>
                      <p className="flex gap-2 rounded-lg bg-success-soft px-3 py-2 text-xs">
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
          ))
        )}
      </section>
    </>
  );
}
