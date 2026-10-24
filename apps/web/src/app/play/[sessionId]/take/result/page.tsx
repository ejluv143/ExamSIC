import type { Metadata } from "next";
import { AttemptResult } from "@/features/attempt/components/attempt-result";
import { requireGuest } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Result" };

export default async function GuestResultPage(props: PageProps<"/play/[sessionId]/take/result">) {
  const { sessionId } = await props.params;
  const { submitted } = await props.searchParams;
  await requireGuest();
  return <AttemptResult sessionId={sessionId} area="guest" submitted={!!submitted} />;
}
