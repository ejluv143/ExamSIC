import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/dal";
import { isSubmitted, quizQuestions } from "@/lib/attempt-view";
import { getAttempts, getSession, getStudents } from "@/lib/data/teacher";
import { Grader } from "./grader";

export const metadata: Metadata = { title: "Review answers" };

export default async function GradeSessionPage(props: PageProps<"/teacher/grading/[sessionId]">) {
  await requirePermission({ submission: ["grade"] });
  const { sessionId } = await props.params;
  const { attempt } = await props.searchParams;
  const detail = await getSession(sessionId);
  if (!detail) notFound();

  const attempts = (await getAttempts(sessionId)).filter(isSubmitted);
  const students = await getStudents(attempts.map((d) => d.studentId));

  return (
    <>
      <PageHeader
        back={{
          href: `/teacher/assessments/${detail.session.quizId}/sessions/${sessionId}`,
          label: detail.quiz.quiz.title,
        }}
        title="Review answers"
      />
      <Grader
        questions={quizQuestions(detail.quiz)}
        attempts={attempts}
        students={students}
        initialAttemptId={typeof attempt === "string" ? attempt : undefined}
      />
    </>
  );
}
