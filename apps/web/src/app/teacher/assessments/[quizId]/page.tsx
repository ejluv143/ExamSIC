import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Pencil, Printer } from "lucide-react";
import { ButtonLink, Card, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { StatusBadge } from "@/components/assessment-bits";
import { Markdown } from "@/components/markdown";
import { answerKey } from "@/lib/answers";
import { fullName, questionLabel } from "@/lib/format";
import { getClasses, getQuiz, getStudents, listSessions } from "@/lib/data/teacher";
import { quizStatus } from "@/lib/sessions";
import { quizTotals } from "@examora/contract";
import { QuizActions } from "./quiz-actions";
import { SessionList } from "./session-list";

export async function generateMetadata(props: PageProps<"/teacher/assessments/[quizId]">): Promise<Metadata> {
  const { quizId } = await props.params;
  return { title: (await getQuiz(quizId))?.quiz.title ?? "Quiz" };
}

export default async function QuizPage(props: PageProps<"/teacher/assessments/[quizId]">) {
  const { quizId } = await props.params;
  const { class: classId } = await props.searchParams;
  const [detail, sessions, classes] = await Promise.all([getQuiz(quizId), listSessions({ quizId }), getClasses()]);
  if (!detail) notFound();

  const { quiz, parts } = detail;
  const questions = parts.flatMap((p) => p.questions);
  const roster = await getStudents([...new Set(classes.flatMap((c) => c.studentIds))]);
  const students = roster.map((s) => ({ id: s.id, name: fullName(s), number: s.studentNumber }));

  return (
    <>
      <PageHeader
        back={{ href: "/teacher/assessments", label: "Quizzes & exams" }}
        title={quiz.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={quizStatus(sessions.map((s) => s.session))} />
            {quiz.subject}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/teacher/assessments/${quiz.id}/edit`} variant="secondary">
              <Pencil className="size-4" aria-hidden /> Edit
            </ButtonLink>
            <ButtonLink href={`/teacher/assessments/${quiz.id}/edit?tab=paper`} variant="secondary">
              <Printer className="size-4" aria-hidden /> Test paper
            </ButtonLink>
            <QuizActions quizId={quiz.id} title={quiz.title} sessionCount={sessions.length} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Questions" value={quizTotals(parts).questionCount} />
        <StatCard label="Total points" value={quizTotals(parts).totalPoints} />
        <StatCard label="Sessions" value={sessions.length} />
      </div>

      <div className="mt-6">
        <SessionList
          quizId={quiz.id}
          items={sessions}
          classes={classes}
          students={students}
          defaultClassId={typeof classId === "string" && classes.some((c) => c.id === classId) ? classId : undefined}
        />
      </div>

      <Card className="mt-6">
        <CardHeader title="Questions" description="With the answer key. Students never see the key." />
        {questions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No questions yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {parts.map((part) => (
              <section key={part.id} className="px-5 py-4">
                <h3 className="font-medium">{part.title}</h3>
                {part.poolSize !== null && (
                  <p className="mt-0.5 text-xs text-muted">
                    Each student gets {part.poolSize} of {part.questions.length} questions.
                  </p>
                )}
                {part.instructions && <Markdown className="mt-0.5 text-sm text-muted">{part.instructions}</Markdown>}
                <ol className="mt-3 space-y-3">
                  {part.questions.map((q, i) => {
                    return (
                      <li key={q.id} className="flex gap-3 text-sm">
                        <span className="w-6 shrink-0 text-muted tabular-nums">{i + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <Markdown>{q.prompt}</Markdown>
                          <p className="mt-0.5 text-xs text-muted">
                            {questionLabel(q)} · {q.points} {q.points === 1 ? "pt" : "pts"}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-xs">
                            <span className="font-medium text-success">Answer: </span>
                            {answerKey(q)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
