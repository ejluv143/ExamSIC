import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Card } from "@/components/ui";
import { getAssessmentToTake } from "@/lib/data/student";
import { formatDateTime } from "@/lib/format";
import { StudentExam } from "./student-exam";

export async function generateMetadata(props: PageProps<"/student/assessments/[assessmentId]">): Promise<Metadata> {
  const { assessmentId } = await props.params;
  return { title: (await getAssessmentToTake(assessmentId))?.assessment.title ?? "Assessment" };
}

export default async function TakeAssessmentPage(props: PageProps<"/student/assessments/[assessmentId]">) {
  const { assessmentId } = await props.params;
  const data = await getAssessmentToTake(assessmentId);
  if (!data) notFound();
  const { assessment: a } = data;

  if (data.availability === "closed" || data.attemptsUsed >= a.settings.attemptsAllowed) {
    redirect(`/student/assessments/${a.id}/result`);
  }

  return (
    <>
      <Link href="/student/assessments" className="mb-4 inline-block text-sm text-muted hover:text-foreground">
        ← Quizzes & exams
      </Link>
      {data.availability === "upcoming" ? (
        <Card className="mx-auto max-w-lg p-8 text-center">
          <CalendarClock className="mx-auto size-8 text-info" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">{a.title}</h1>
          <p className="mt-1 text-sm text-muted">Opens {formatDateTime(a.settings.opensAt)}. Come back then.</p>
        </Card>
      ) : (
        <StudentExam
          assessment={a}
          classes={data.classes}
          attemptsUsed={data.attemptsUsed}
          studentId={data.studentId}
          watermark={data.watermark}
          codeRunner={data.codeRunner}
        />
      )}
    </>
  );
}
