import type { Metadata } from "next";
import { GamePlayer } from "@/components/game-player";
import { requireGuest } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Game" };

export default async function GuestGamePage(props: PageProps<"/play/[sessionId]">) {
  const { sessionId } = await props.params;
  await requireGuest();
  return <GamePlayer sessionId={sessionId} resultsHref={`/play/${sessionId}/results`} homeHref="/join" />;
}
