import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameStandingsTable } from "@/components/game-standings";
import { Card, PageHeader } from "@/components/ui";
import { getMyGameStandings } from "@/lib/data/game";

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
        description={mine ? `You finished #${mine.rank} with ${mine.points.toLocaleString()} points` : "Final standings"}
      />
      <GameStandingsTable standings={standings} meId={standings.myAttemptId} />
    </>
  );
}
