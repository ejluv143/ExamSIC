import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/dal";
import { getAssessment, getStudents, getSubmissions } from "@/lib/data/teacher";
import { Grader } from "./grader";

export const metadata: Metadata = { title: "Review answers" };

export default async function GradeAssessmentPage(props: PageProps<"/teacher/grading/[assessmentId]">) {
  await requirePermission({ submission: ["grade"] });
  const { assessmentId } = await props.params;
  const { submission } = await props.searchParams;
  const a = await getAssessment(assessmentId);
  if (!a) notFound();

  const submissions = (await getSubmissions(a.id)).filter((s) => s.submittedAt);
  const students = await getStudents(submissions.map((s) => s.studentId));

  return (
    <>
      <PageHeader back={{ href: `/teacher/assessments/${a.id}`, label: a.title }} title="Review answers" />
      <Grader
        assessment={a}
        submissions={submissions}
        students={students}
        initialSubmissionId={typeof submission === "string" ? submission : undefined}
      />
    </>
  );
}
