import type { Metadata } from "next";
import { TakeAssessment } from "@/features/attempt/components/take-assessment";
import { getPaperToTake } from "@/features/attempt/data";
import { requireGuest } from "@/lib/auth/dal";

export async function generateMetadata(props: PageProps<"/play/[sessionId]/take">): Promise<Metadata> {
  const { sessionId } = await props.params;
  await requireGuest();
  const data = await getPaperToTake(sessionId);
  return { title: data?.paper?.quiz.title ?? "Quiz or exam" };
}

// A guest's quiz or exam: the same paper as a student's, under the guest shell.
export default async function GuestTakePage(props: PageProps<"/play/[sessionId]/take">) {
  const { sessionId } = await props.params;
  await requireGuest();
  return <TakeAssessment sessionId={sessionId} area="guest" />;
}
