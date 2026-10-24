import type { Metadata } from "next";
import { AttemptResult } from "@/features/attempt/components/attempt-result";

export const metadata: Metadata = { title: "Result" };

export default async function ResultPage(props: PageProps<"/student/assessments/[sessionId]/result">) {
  const { sessionId } = await props.params;
  const { submitted } = await props.searchParams;
  return <AttemptResult sessionId={sessionId} area="student" submitted={!!submitted} />;
}
