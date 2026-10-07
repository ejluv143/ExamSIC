import clsx from "clsx";
import type { GameStandings } from "@examora/contract";
import { Card, Table, Td, Th } from "@/components/ui";

// The final standings of a game: rank, points, correct answers and the average time to answer.
export function GameStandingsTable({ standings, meId }: { standings: GameStandings; meId?: string | null }) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <thead>
          <tr>
            <Th className="w-16">Rank</Th>
            <Th>Player</Th>
            <Th className="text-right">Points</Th>
            <Th className="text-right">Correct</Th>
            <Th className="text-right">Avg. time</Th>
          </tr>
        </thead>
        <tbody>
          {standings.standings.map((s) => (
            <tr key={s.attemptId} className={clsx(s.attemptId === meId && "bg-primary-soft")}>
              <Td className="tabular-nums font-semibold">{s.rank}</Td>
              <Td>{s.name}</Td>
              <Td className="text-right font-semibold tabular-nums">{s.points.toLocaleString()}</Td>
              <Td className="text-right tabular-nums">
                {s.correct} / {standings.questionCount}
              </Td>
              <Td className="text-right tabular-nums">{s.averageMs === null ? "—" : `${(s.averageMs / 1000).toFixed(1)} s`}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
