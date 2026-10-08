import type { Metadata } from "next";
import { GamePlayer } from "@/components/game-player";
import { requireStudent } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Game" };

export default async function PlayGamePage(props: PageProps<"/student/game/[sessionId]">) {
  const { sessionId } = await props.params;
  await requireStudent();
  return <GamePlayer sessionId={sessionId} resultsHref={`/student/game/${sessionId}/results`} />;
}
