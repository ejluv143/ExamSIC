import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameStandingsTable } from "@/components/game-standings";
import { Card, PageHeader } from "@/components/ui";
import { requireGuest } from "@/lib/auth/dal";
import { getMyGameStandings } from "@/lib/data/game";

export const metadata: Metadata = { title: "Game results" };

export default async function GuestGameResultsPage(props: PageProps<"/play/[sessionId]/results">) {
  const { sessionId } = await props.params;
  await requireGuest();
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
        back={{ href: "/join", label: "Join another game" }}
        title={standings.title}
        description={mine ? `You finished #${mine.rank} with ${mine.points.toLocaleString()} points` : "Final standings"}
      />
      <GameStandingsTable standings={standings} meId={standings.myAttemptId} />
    </>
  );
}
