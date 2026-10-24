import type { Metadata } from "next";
import { PracticeAttempt } from "@/features/attempt/components/practice-attempt";

export const metadata: Metadata = { title: "Practice" };

export default async function PracticePage(props: PageProps<"/student/assessments/[sessionId]/practice">) {
  const { sessionId } = await props.params;
  const { scope, topic } = await props.searchParams;
  return <PracticeAttempt sessionId={sessionId} area="student" scope={scope} topic={topic} />;
}
