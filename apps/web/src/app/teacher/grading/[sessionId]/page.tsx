import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { ButtonDownload, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/dal";
import { isSubmitted, quizQuestions } from "@/lib/attempt-view";
import { getAttempts, getSession, getStudents } from "@/lib/data/teacher";
import { assetUrls } from "@/lib/data/assets";
import { assetIdsIn } from "@examora/contract";
import { resultsVisible } from "@/lib/sessions";
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
  // Pictures in the questions, and the students' drawings and photos.
  const questions = quizQuestions(detail.quiz);
  const urls = await assetUrls(assetIdsIn(JSON.stringify([questions, attempts.map((d) => d.answers)])));
  const exam = detail.session.mode === "exam";

  return (
    <>
      <PageHeader
        back={{
          href: `/teacher/assessments/${detail.session.quizId}/sessions/${sessionId}`,
          label: detail.quiz.quiz.title,
        }}
        title="Review answers"
        actions={
          <ButtonDownload href={`/teacher/assessments/${detail.session.quizId}/sessions/${sessionId}/export`}>
            <Download className="size-4" aria-hidden /> Export results (Excel)
          </ButtonDownload>
        }
      />
      <Grader
        questions={questions}
        attempts={attempts}
        students={students}
        assetUrls={urls}
        initialAttemptId={typeof attempt === "string" ? attempt : undefined}
        examMode={exam}
        reportBase={exam ? `/teacher/assessments/${detail.session.quizId}/sessions/${sessionId}/report` : null}
        reasonRequired={exam && resultsVisible(detail.session)}
      />
    </>
  );
}
