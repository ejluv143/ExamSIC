import type { Metadata } from "next";
import { rankSentence } from "@examinus/copy/game";
import { notFound } from "next/navigation";
import { GameStandingsTable } from "@/features/game/components/game-standings";
import { Card, PageHeader } from "@/components/ui";
import { getMyGameStandings } from "@/features/game/data";

export const metadata: Metadata = { title: "Game results" };

export default async function GameResultsPage(props: PageProps<"/student/game/[sessionId]/results">) {
  const { sessionId } = await props.params;
  const standings = await getMyGameStandings(sessionId);
  if (!standings) notFound();
  if ("refused" in standings)
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="text-sm text-muted">{standings.refused.message}</p>
      </Card>
    );
  const mine = standings.standings.find((s) => s.attemptId === standings.myAttemptId);
  return (
    <>
      <PageHeader
        back={{ href: "/student", label: "Dashboard" }}
        title={standings.title}
        description={mine ? rankSentence(mine, "final") : "Final standings"}
      />
      <GameStandingsTable standings={standings} meId={standings.myAttemptId} />
    </>
  );
}
