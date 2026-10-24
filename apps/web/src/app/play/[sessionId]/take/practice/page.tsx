import type { Metadata } from "next";
import { PracticeAttempt } from "@/features/attempt/components/practice-attempt";
import { requireGuest } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Practice" };

export default async function GuestPracticePage(props: PageProps<"/play/[sessionId]/take/practice">) {
  const { sessionId } = await props.params;
  const { scope, topic } = await props.searchParams;
  await requireGuest();
  return <PracticeAttempt sessionId={sessionId} area="guest" scope={scope} topic={topic} />;
}
