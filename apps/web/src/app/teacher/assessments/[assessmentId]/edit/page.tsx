import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/dal";
import { getAssessment, getClasses, getQuestionBank } from "@/lib/data/teacher";
import { AssessmentEditor } from "../../_editor/assessment-editor";

export const metadata: Metadata = { title: "Edit" };

export default async function EditAssessmentPage(
  props: PageProps<"/teacher/assessments/[assessmentId]/edit">,
) {
  await requirePermission({ assessment: ["update"] });
  const { assessmentId } = await props.params;
  const { tab, saved } = await props.searchParams;
  const [assessment, classes, bank] = await Promise.all([
    getAssessment(assessmentId),
    getClasses(),
    getQuestionBank(),
  ]);
  if (!assessment) notFound();

  return (
    <>
      <PageHeader
        back={{ href: `/teacher/assessments/${assessment.id}`, label: assessment.title }}
        title={`Edit ${assessment.kind}`}
      />
      <AssessmentEditor initial={assessment} classes={classes} bank={bank} initialTab={tab === "paper" ? "paper" : "questions"}
        saved={saved === "published" || saved === "draft" ? saved : undefined}
      />
    </>
  );
}
