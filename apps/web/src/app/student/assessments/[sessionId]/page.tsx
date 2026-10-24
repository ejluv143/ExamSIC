import type { Metadata } from "next";
import { TakeAssessment } from "@/features/attempt/components/take-assessment";
import { getPaperToTake } from "@/features/attempt/data";

export async function generateMetadata(props: PageProps<"/student/assessments/[sessionId]">): Promise<Metadata> {
  const { sessionId } = await props.params;
  const data = await getPaperToTake(sessionId);
  return { title: data?.paper?.quiz.title ?? "Quiz or exam" };
}

export default async function TakeAssessmentPage(props: PageProps<"/student/assessments/[sessionId]">) {
  const { sessionId } = await props.params;
  return <TakeAssessment sessionId={sessionId} area="student" />;
}
